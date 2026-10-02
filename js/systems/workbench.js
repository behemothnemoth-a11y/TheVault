import { getState, update } from "../core/store.js";
import { getReviewQueue, resolveReviewItem } from "./reviewQueue.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const selectedReviewIds = new Set();
const filters = { wing: "all", status: "all", issue: "all" };
const reviewLimit = 30;
const recordLimit = 80;

function artworkUrl(item) {
  if (typeof item.artwork === "string") return item.artwork;
  return item.artwork?.localPath || item.artwork?.url || "";
}

function missingIssue(item, issue) {
  if (issue === "artwork") return !artworkUrl(item);
  if (issue === "year") return !item.year;
  if (issue === "description") return !String(item.description || "").trim();
  if (issue === "genre") return !Array.isArray(item.genres) || !item.genres.length;
  return true;
}

function changedFields(before, after) {
  const output = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      output[key] = { before: structuredClone(before[key]), after: structuredClone(after[key]) };
    }
  }
  return output;
}

export function ensureWorkbenchStyles() {
  if (document.querySelector("link[data-workbench-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/workbench.css";
  link.dataset.workbenchStyles = "";
  document.head.append(link);
}

export function getWorkbenchStats() {
  const items = Object.values(getState().items || {});
  const changes = getState().metadata?.stage2?.changeLog || [];
  const batches = getState().metadata?.stage2?.reviewBatches || [];
  return {
    total: items.length,
    withArtwork: items.filter(item => artworkUrl(item)).length,
    missingArtwork: items.filter(item => !artworkUrl(item)).length,
    missingYear: items.filter(item => !item.year).length,
    missingDescription: items.filter(item => !String(item.description || "").trim()).length,
    changes: changes.length,
    batches: batches.length
  };
}

export function setWorkbenchFilter(name, value) {
  if (name in filters) filters[name] = value;
}

export function toggleWorkbenchReview(id, checked) {
  if (checked) selectedReviewIds.add(id);
  else selectedReviewIds.delete(id);
}

export function getSelectedReviewCount() {
  return selectedReviewIds.size;
}

export function updateWorkbenchRecord(id, patch, source = "record_editor") {
  let changeId = null;
  update(save => {
    const item = save.items[id];
    if (!item) throw new Error("Record not found.");
    const allowed = ["title", "year", "genres", "description", "note", "owned", "artwork"];
    const sanitized = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
    const fields = changedFields(item, sanitized);
    if (!Object.keys(fields).length) return;
    Object.assign(item, sanitized);
    const timestamp = new Date().toISOString();
    changeId = `change_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    save.metadata.stage2.changeLog.push({
      id: changeId,
      itemId: id,
      source,
      changedAt: timestamp,
      fields,
      status: "applied"
    });
    if (save.metadata.stage2.changeLog.length > 5000) {
      save.metadata.stage2.changeLog = save.metadata.stage2.changeLog.slice(-5000);
    }
    save.metadata.stage2.lastMaintainedAt = timestamp;
  });
  return changeId;
}

export function undoWorkbenchChange(changeId) {
  update(save => {
    const change = save.metadata.stage2.changeLog.find(entry => entry.id === changeId);
    if (!change || change.status !== "applied") throw new Error("This change cannot be undone.");
    const item = save.items[change.itemId];
    if (!item) throw new Error("The edited record no longer exists.");
    for (const [field, values] of Object.entries(change.fields)) item[field] = structuredClone(values.before);
    change.status = "undone";
    change.undoneAt = new Date().toISOString();
    save.metadata.stage2.lastMaintainedAt = change.undoneAt;
  });
}

export async function uploadWorkbenchArtwork(itemId, file) {
  if (!file) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Artwork must be smaller than 8 MB.");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Artwork could not be read."));
    reader.readAsDataURL(file);
  });
  const response = await fetch("./__vault/artwork", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "save-artwork" },
    body: JSON.stringify({ itemId, dataUrl })
  });
  if (!response.ok) throw new Error(`Artwork intake returned ${response.status}.`);
  return response.json();
}

export function resolveWorkbenchBatch(action) {
  const compatibleKinds = {
    keep_original: "semantic_conflict",
    link_scanner: "scanner_only_episode",
    defer: "file_group",
    reject: null
  };
  if (!(action in compatibleKinds)) throw new Error("Unknown batch action.");
  const queue = getReviewQueue();
  const selected = queue.filter(item =>
    selectedReviewIds.has(item.id) &&
    item.status === "pending" &&
    (!compatibleKinds[action] || item.kind === compatibleKinds[action])
  );
  if (!selected.length) throw new Error("No compatible pending records are selected.");
  for (const item of selected) resolveReviewItem(item.id, action);
  update(save => {
    const timestamp = new Date().toISOString();
    save.metadata.stage2.reviewBatches.push({
      id: `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      reviewIds: selected.map(item => item.id),
      count: selected.length,
      completedAt: timestamp
    });
    save.metadata.stage2.lastMaintainedAt = timestamp;
  });
  selected.forEach(item => selectedReviewIds.delete(item.id));
  return selected.length;
}

export function renderWorkbench(search = "") {
  const state = getState();
  const stats = getWorkbenchStats();
  const query = search.trim().toLowerCase();
  const items = Object.values(state.items || {})
    .filter(item => filters.wing === "all" || item.wing === filters.wing)
    .filter(item => filters.status === "all" || item.status === filters.status)
    .filter(item => filters.issue === "all" || missingIssue(item, filters.issue))
    .filter(item => !query || `${item.title} ${item.year || ""} ${(item.genres || []).join(" ")} ${item.id}`.toLowerCase().includes(query))
    .sort((a, b) => Number(Boolean(artworkUrl(a))) - Number(Boolean(artworkUrl(b))) || a.title.localeCompare(b.title));
  const wings = [...new Set(Object.values(state.items || {}).map(item => item.wing))].sort();
  const changes = (state.metadata?.stage2?.changeLog || []).slice(-8).reverse();
  const review = getReviewQueue()
    .filter(item => item.status === "pending")
    .filter(item => !query || `${item.title} ${item.kind} ${JSON.stringify(item.payload || {})}`.toLowerCase().includes(query))
    .slice(0, reviewLimit);

  const record = item => {
    const art = artworkUrl(item);
    const gaps = ["artwork", "year", "description", "genre"].filter(issue => missingIssue(item, issue));
    return `<article class="workbench-record panel">
      <div class="workbench-poster">${art ? `<img src="${esc(art)}" alt="">` : `<span>${esc(item.title.slice(0, 2))}</span>`}</div>
      <div class="workbench-record__copy"><small>${esc(item.wing)} // ${esc(item.id)}</small><b>${esc(item.title)}</b>
      <p>${esc((item.genres || []).join(" · ") || "UNFILED")} ${item.year ? `· ${esc(item.year)}` : ""}</p>
      <em>${gaps.length ? `MISSING ${gaps.join(", ").toUpperCase()}` : "METADATA COMPLETE"}</em></div>
      <button class="button" data-workbench-edit="${esc(item.id)}">EDIT FILE</button>
    </article>`;
  };
  const reviewRow = item => `<label class="workbench-review-row">
    <input type="checkbox" data-workbench-review-select="${esc(item.id)}" ${selectedReviewIds.has(item.id) ? "checked" : ""}>
    <span><b>${esc(item.title)}</b><small>${esc(item.kind.replaceAll("_", " "))}</small></span>
  </label>`;

  return `<section class="workbench-hero panel">
    <div><span class="eyebrow">STAGE 2 // ARCHIVE MAINTENANCE</span><h2>THE WORKBENCH</h2>
    <p>Edit the catalog without touching raw JSON. Every change leaves a trail.</p></div>
    <div class="workbench-seal">W</div>
  </section>
  <div class="workbench-vitals">
    <div class="panel"><b>${stats.total}</b><span>RECORDS</span></div>
    <div class="panel"><b>${stats.withArtwork}</b><span>WITH ARTWORK</span></div>
    <div class="panel"><b>${stats.missingYear}</b><span>MISSING YEAR</span></div>
    <div class="panel"><b>${stats.changes}</b><span>RECORDED EDITS</span></div>
  </div>
  <section class="panel">
    <div class="panel__header"><h2>CATALOG FILTERS</h2><span class="panel__code">${items.length} MATCHES · SHOWING ${Math.min(items.length, recordLimit)}</span></div>
    <div class="workbench-filters">
      <label>WING<select data-workbench-filter="wing"><option value="all">ALL WINGS</option>${wings.map(wing => `<option value="${esc(wing)}" ${filters.wing === wing ? "selected" : ""}>${esc(wing.toUpperCase())}</option>`).join("")}</select></label>
      <label>STATUS<select data-workbench-filter="status"><option value="all">ALL</option>${["backlog", "in_progress", "completed"].map(value => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${value.replaceAll("_", " ").toUpperCase()}</option>`).join("")}</select></label>
      <label>GAP<select data-workbench-filter="issue"><option value="all">ANY CONDITION</option>${["artwork", "year", "description", "genre"].map(value => `<option value="${value}" ${filters.issue === value ? "selected" : ""}>MISSING ${value.toUpperCase()}</option>`).join("")}</select></label>
    </div>
    <div class="workbench-record-list">${items.slice(0, recordLimit).map(record).join("") || `<div class="empty"><b>NO MATCHING RECORDS</b>Adjust the filters or search.</div>`}</div>
  </section>
  <div class="dashboard-grid">
    <section class="panel span-7">
      <div class="panel__header"><h2>CONTROLLED REVIEW DESK</h2><span class="panel__code">${selectedReviewIds.size} SELECTED</span></div>
      <p class="muted">Search also narrows this queue. Only compatible selected records are changed by a batch action.</p>
      <div class="workbench-batch-actions">
        <button class="button" data-workbench-batch="keep_original">KEEP ORIGINAL PATHS</button>
        <button class="button" data-workbench-batch="link_scanner">LINK NEW FILES</button>
        <button class="button" data-workbench-batch="defer">DEFER GROUPS</button>
        <button class="button" data-workbench-batch="reject">IGNORE SELECTED</button>
      </div>
      <div class="workbench-review-list">${review.map(reviewRow).join("") || `<div class="empty"><b>QUEUE CLEAR</b>No pending matches.</div>`}</div>
    </section>
    <section class="panel span-5">
      <div class="panel__header"><h2>RECENT MAINTENANCE</h2><span class="panel__code">${stats.batches} BATCHES</span></div>
      <div class="workbench-history">${changes.map(change => `<article><span><b>${esc(state.items[change.itemId]?.title || change.itemId)}</b><small>${new Date(change.changedAt).toLocaleString()} · ${Object.keys(change.fields).join(", ")}</small></span>${change.status === "applied" ? `<button class="button" data-workbench-undo="${change.id}">UNDO</button>` : `<em>UNDONE</em>`}</article>`).join("") || `<div class="empty"><b>NO EDITS YET</b>The workbench is clean.</div>`}</div>
    </section>
  </div>`;
}

export function getWorkbenchRecord(id) {
  return getState().items[id] || null;
}
