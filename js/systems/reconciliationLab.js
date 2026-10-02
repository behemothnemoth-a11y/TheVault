import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

const filters = { confidence: "all", action: "all", status: "pending" };
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const normalizePath = value => String(value || "").replaceAll("/", "\\").toLowerCase();
const normalizeTitle = value => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s*▸\s*$/, "").toLowerCase().replace(/&/g, " and ")
  .replace(/\b(?:the|a|an)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function proposalId(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `proposal_${(hash >>> 0).toString(36)}`;
}

function parseFile(file) {
  const path = String(file.path || "").replaceAll("/", "\\");
  const parts = path.split("\\");
  const coordinate = path.match(/(?:^|[.\s_-])s(\d{1,2})e(\d{1,3})(?:[.\s_-]|$)/i);
  if (!coordinate) return null;
  const seasonIndex = parts.findIndex(part => /^season\s*\d+$/i.test(part));
  const folderTitle = seasonIndex > 0 ? parts[seasonIndex - 1] : "";
  const fileTitle = String(file.name || parts.at(-1) || "").replace(/\.[^.]+$/, "").split(/(?:^|[.\s_-])s\d{1,2}e\d{1,3}/i)[0];
  return {
    season: Number(coordinate[1]),
    episode: Number(coordinate[2]),
    folderTitle,
    fileTitle,
    folderKey: normalizeTitle(folderTitle),
    fileKey: normalizeTitle(fileTitle)
  };
}

function proposalSummary(proposals, unmatchedCount) {
  return {
    total: proposals.length,
    pending: proposals.filter(item => item.status === "pending").length,
    deferred: proposals.filter(item => item.status === "deferred").length,
    dismissed: proposals.filter(item => item.status === "dismissed").length,
    highConfidence: proposals.filter(item => item.confidence === "high").length,
    mediumConfidence: proposals.filter(item => item.confidence === "medium").length,
    unlinkedEpisodes: proposals.filter(item => item.action === "link_unlinked_episode").length,
    missingPathReplacements: proposals.filter(item => item.action === "replace_missing_path").length,
    alternateFiles: proposals.filter(item => item.action === "alternate_file").length,
    missingEpisodeRecords: proposals.filter(item => item.action === "create_episode_record").length,
    unmatchedFiles: unmatchedCount
  };
}

export function buildReconciliationProposals(inventory, sentinelReport) {
  const state = getState();
  const shows = Object.values(state.items || {}).filter(item => item.wing === "tv" && !item.id.startsWith("tv_drive_"));
  const showsByTitle = new Map();
  for (const show of shows) {
    const key = normalizeTitle(show.title);
    if (!showsByTitle.has(key)) showsByTitle.set(key, []);
    showsByTitle.get(key).push(show);
  }
  const linked = new Set();
  for (const show of shows) {
    for (const episode of Object.values(show.episodes || {})) {
      if (episode.sourcePath) linked.add(normalizePath(episode.sourcePath));
    }
  }
  const missing = new Set((sentinelReport.missing || []).map(entry => normalizePath(entry.path)));
  const previous = new Map((state.metadata.stage5?.proposals || []).map(item => [item.id, item]));
  const proposals = [];
  const unmatched = [];

  for (const file of inventory.files || []) {
    if (linked.has(normalizePath(file.path))) continue;
    const parsed = parseFile(file);
    if (!parsed) {
      if (unmatched.length < 200) unmatched.push({ path: file.path, reason: "no_episode_coordinates" });
      continue;
    }
    const folderMatches = showsByTitle.get(parsed.folderKey) || [];
    const fileMatches = showsByTitle.get(parsed.fileKey) || [];
    const matches = folderMatches.length === 1 ? folderMatches : fileMatches.length === 1 ? fileMatches : [];
    if (matches.length !== 1) {
      if (unmatched.length < 200) unmatched.push({
        path: file.path,
        reason: folderMatches.length > 1 || fileMatches.length > 1 ? "ambiguous_series" : "series_not_matched",
        detectedTitle: parsed.folderTitle || parsed.fileTitle,
        season: parsed.season,
        episode: parsed.episode
      });
      continue;
    }
    const show = matches[0];
    const episode = Object.values(show.episodes || {}).find(candidate =>
      Number(candidate.season) === parsed.season && Number(candidate.number) === parsed.episode
    );
    const action = !episode ? "create_episode_record" :
      !episode.sourcePath ? "link_unlinked_episode" :
      missing.has(normalizePath(episode.sourcePath)) ? "replace_missing_path" : "alternate_file";
    const confidence = folderMatches.length === 1 ? "high" : "medium";
    const id = proposalId(`${show.id}|${parsed.season}|${parsed.episode}|${normalizePath(file.path)}|${action}`);
    const prior = previous.get(id);
    proposals.push({
      id,
      status: prior?.status || "pending",
      decision: prior?.decision || null,
      action,
      confidence,
      reason: confidence === "high" ? "exact_series_folder_and_episode_coordinates" : "filename_series_and_episode_coordinates",
      showId: show.id,
      episodeId: episode?.id || null,
      title: show.title,
      season: parsed.season,
      episode: parsed.episode,
      proposedPath: file.path,
      currentPath: episode?.sourcePath || null,
      fileBytes: file.bytes,
      fileLastWriteUtc: file.lastWriteUtc
    });
  }

  proposals.sort((a, b) =>
    Number(b.confidence === "high") - Number(a.confidence === "high") ||
    a.title.localeCompare(b.title) ||
    a.season - b.season ||
    a.episode - b.episode
  );
  const unmatchedCount = (inventory.files || []).filter(file => !linked.has(normalizePath(file.path))).length - proposals.length;
  const summary = proposalSummary(proposals, Math.max(0, unmatchedCount));
  update(save => {
    save.metadata.stage5 ||= { startedAt: new Date().toISOString(), proposals: [], generations: [] };
    save.metadata.stage5.proposals = proposals.slice(0, 5000);
    save.metadata.stage5.unmatchedSamples = unmatched;
    save.metadata.stage5.summary = summary;
    save.metadata.stage5.generatedAt = new Date().toISOString();
    save.metadata.stage5.sourceScanAt = inventory.scannedAt;
    save.metadata.stage5.generations = [...(save.metadata.stage5.generations || []), {
      generatedAt: save.metadata.stage5.generatedAt,
      sourceScanAt: inventory.scannedAt,
      total: summary.total,
      highConfidence: summary.highConfidence,
      unmatchedFiles: summary.unmatchedFiles
    }].slice(-90);
  });
  return { proposals, unmatched, summary };
}

export function decideReconciliationProposal(id, status) {
  if (!["pending", "deferred", "dismissed"].includes(status)) throw new Error("Unknown proposal status.");
  update(save => {
    const proposal = save.metadata.stage5.proposals.find(item => item.id === id);
    if (!proposal) throw new Error("Proposal not found.");
    proposal.status = status;
    proposal.decision = { status, decidedAt: new Date().toISOString() };
  });
}

export function ensureReconciliationStyles() {
  if (document.querySelector("link[data-reconciliation-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/reconciliation.css";
  link.dataset.reconciliationStyles = "";
  document.head.append(link);
}

function renderLaboratory() {
  if (location.hash !== "#/reconcile") return;
  const state = getState();
  const stage5 = state.metadata.stage5 || {};
  const summary = stage5.summary || proposalSummary([], 0);
  const query = (document.querySelector("#global-search")?.value || "").trim().toLowerCase();
  const proposals = (stage5.proposals || [])
    .filter(item => filters.status === "all" || item.status === filters.status)
    .filter(item => filters.confidence === "all" || item.confidence === filters.confidence)
    .filter(item => filters.action === "all" || item.action === filters.action)
    .filter(item => !query || `${item.title} ${item.proposedPath} ${item.action} s${item.season}e${item.episode}`.toLowerCase().includes(query));
  const card = item => `<article class="reconcile-card panel">
    <div><small>${item.confidence.toUpperCase()} CONFIDENCE · ${item.action.replaceAll("_", " ").toUpperCase()}</small>
    <b>${esc(item.title)} · S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}</b>
    ${item.currentPath ? `<span>CURRENT · ${esc(item.currentPath)}</span>` : `<span>CURRENT · NO EPISODE LINK</span>`}
    <span>PROPOSED · ${esc(item.proposedPath)}</span><em>${esc(item.reason.replaceAll("_", " "))}</em></div>
    <div class="reconcile-actions">${item.status !== "deferred" ? `<button class="button" data-proposal-status="deferred" data-proposal-id="${item.id}">DEFER</button>` : ""}
    ${item.status !== "dismissed" ? `<button class="button" data-proposal-status="dismissed" data-proposal-id="${item.id}">DISMISS</button>` : ""}
    ${item.status !== "pending" ? `<button class="button" data-proposal-status="pending" data-proposal-id="${item.id}">REOPEN</button>` : ""}</div></article>`;
  document.querySelector("#view").innerHTML = `<section class="reconcile-hero panel"><div><span class="eyebrow">STAGE 5 // PROPOSALS ONLY</span><h2>RECONCILIATION LABORATORY</h2>
    <p>The Vault has theories. None of them have permission to change an episode link.</p></div><div class="reconcile-mark">⌘</div></section>
    <div class="reconcile-vitals"><div class="panel"><b>${summary.total}</b><span>PROPOSALS</span></div><div class="panel"><b>${summary.highConfidence}</b><span>HIGH CONFIDENCE</span></div><div class="panel"><b>${summary.missingPathReplacements}</b><span>MISSING-PATH REPAIRS</span></div><div class="panel"><b>${summary.unmatchedFiles}</b><span>UNMATCHED FILES</span></div></div>
    <section class="panel reconcile-controls"><select data-reconcile-filter="status" aria-label="Proposal status"><option value="pending">PENDING</option><option value="all" ${filters.status === "all" ? "selected" : ""}>ALL STATUS</option><option value="deferred" ${filters.status === "deferred" ? "selected" : ""}>DEFERRED</option><option value="dismissed" ${filters.status === "dismissed" ? "selected" : ""}>DISMISSED</option></select>
    <select data-reconcile-filter="confidence" aria-label="Proposal confidence"><option value="all">ALL CONFIDENCE</option><option value="high" ${filters.confidence === "high" ? "selected" : ""}>HIGH</option><option value="medium" ${filters.confidence === "medium" ? "selected" : ""}>MEDIUM</option></select>
    <select data-reconcile-filter="action" aria-label="Proposal action"><option value="all">ALL ACTIONS</option>${["link_unlinked_episode", "replace_missing_path", "alternate_file", "create_episode_record"].map(value => `<option value="${value}" ${filters.action === value ? "selected" : ""}>${value.replaceAll("_", " ").toUpperCase()}</option>`).join("")}</select>
    <button class="button" data-route="sentinel">OPEN SENTINEL</button></section>
    <section class="reconcile-notice panel"><b>NO AUTOMATIC RELINKING</b><span>Deferring or dismissing changes only the proposal record.</span></section>
    <div class="reconcile-list">${proposals.slice(0, 100).map(card).join("") || `<div class="panel empty"><b>NO MATCHING PROPOSALS</b>Run the Sentinel or adjust filters.</div>`}${proposals.length > 100 ? `<div class="panel reconcile-more">${proposals.length - 100} MORE MATCHES · USE SEARCH AND FILTERS TO NARROW THE BENCH</div>` : ""}</div>`;
  document.querySelector("#view-title").textContent = "Reconciliation Laboratory";
  document.querySelector("#view-code").textContent = "VAULT://RECONCILE";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  ensureReconciliationStyles();
  if (!getState().metadata.stage5) {
    update(save => { save.metadata.stage5 = { startedAt: new Date().toISOString(), proposals: [], generations: [] }; });
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-proposal-status]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      decideReconciliationProposal(button.dataset.proposalId, button.dataset.proposalStatus);
      renderLaboratory();
      toast("PROPOSAL FILED", button.dataset.proposalStatus);
    } catch (error) {
      toast("PROPOSAL STOPPED", error.message, 6000);
    }
  }, true);
  document.addEventListener("change", event => {
    const select = event.target.closest("[data-reconcile-filter]");
    if (!select) return;
    filters[select.dataset.reconcileFilter] = select.value;
    renderLaboratory();
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderLaboratory, 0));
  document.querySelector("#global-search").addEventListener("input", () => setTimeout(renderLaboratory, 0));
  setTimeout(renderLaboratory, 0);
  return true;
}

function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}

setTimeout(() => schedule(), 0);
