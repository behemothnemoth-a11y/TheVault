import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { uploadWorkbenchArtwork } from "./workbench.js";

const pendingFiles = new Map();
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
const artworkUrl = item => typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url || "";

export function analyzeArtworkFiles(files) {
  const items = Object.values(getState().items || {});
  const matches = [];
  pendingFiles.clear();
  for (const file of files) {
    const key = normalize(file.name);
    const candidates = items.filter(item => {
      const title = normalize(item.title);
      return key === normalize(item.id) || key === title || key.startsWith(`${title} `);
    });
    const id = createId("artmatch");
    pendingFiles.set(id, file);
    matches.push({
      id, fileName: file.name, bytes: file.size,
      status: candidates.length === 1 ? "ready" : candidates.length ? "ambiguous" : "unmatched",
      itemId: candidates.length === 1 ? candidates[0].id : null,
      title: candidates.length === 1 ? candidates[0].title : null,
      candidateCount: candidates.length
    });
  }
  update(save => {
    save.metadata.stage7 ||= { startedAt: new Date().toISOString(), attachments: [] };
    save.metadata.stage7.lastAnalysis = matches.map(({ id, fileName, bytes, status, itemId, title, candidateCount }) =>
      ({ id, fileName, bytes, status, itemId, title, candidateCount })
    );
    save.metadata.stage7.lastAnalyzedAt = new Date().toISOString();
  });
  return matches;
}

export async function attachCuratedArtwork(matchId) {
  const match = getState().metadata.stage7?.lastAnalysis?.find(entry => entry.id === matchId);
  const file = pendingFiles.get(matchId);
  if (!match || match.status !== "ready" || !file) throw new Error("Artwork candidate is no longer available. Analyze the folder again.");
  const item = getState().items[match.itemId];
  const before = structuredClone(item.artwork || null);
  await createArchiveSnapshot(`Protected snapshot before artwork attachment ${match.itemId}`, {
    kind: "pre_artwork_attachment", protected: true
  });
  const saved = await uploadWorkbenchArtwork(match.itemId, file);
  const attachmentId = createId("artchange");
  update(save => {
    save.items[match.itemId].artwork = { localPath: saved.path, source: "local_curator" };
    save.metadata.stage7.attachments.push({
      id: attachmentId, itemId: match.itemId, fileName: match.fileName,
      before, after: structuredClone(save.items[match.itemId].artwork),
      status: "applied", appliedAt: new Date().toISOString()
    });
    const live = save.metadata.stage7.lastAnalysis.find(entry => entry.id === matchId);
    if (live) live.status = "attached";
  });
  pendingFiles.delete(matchId);
}

export async function rollbackArtworkAttachment(attachmentId) {
  const attachment = getState().metadata.stage7?.attachments?.find(entry => entry.id === attachmentId);
  if (!attachment || attachment.status !== "applied") throw new Error("Active artwork attachment not found.");
  await createArchiveSnapshot(`Protected snapshot before artwork rollback ${attachmentId}`, {
    kind: "pre_artwork_rollback", protected: true
  });
  update(save => {
    const live = save.metadata.stage7.attachments.find(entry => entry.id === attachmentId);
    save.items[live.itemId].artwork = structuredClone(live.before);
    live.status = "rolled_back";
    live.rolledBackAt = new Date().toISOString();
  });
}

export function renderArtworkCurator() {
  if (location.hash !== "#/artwork") return;
  const state = getState();
  const items = Object.values(state.items || {});
  const withArtwork = items.filter(item => artworkUrl(item)).length;
  const analysis = state.metadata.stage7?.lastAnalysis || [];
  const attachments = [...(state.metadata.stage7?.attachments || [])].reverse();
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 7 // OFFLINE CURATION</span><h2>ARTWORK CURATOR</h2>
    <p>Choose a local poster folder. The Curator matches filenames to stable IDs or exact titles and leaves ambiguous images alone.</p></section>
    <div class="ops-vitals"><div class="panel"><b>${withArtwork}</b><span>WITH ARTWORK</span></div><div class="panel"><b>${items.length - withArtwork}</b><span>NEED ARTWORK</span></div><div class="panel"><b>${analysis.filter(entry => entry.status === "ready").length}</b><span>READY MATCHES</span></div></div>
    <section class="panel ops-notice"><input id="artwork-folder-input" type="file" aria-label="Choose artwork folder" accept="image/jpeg,image/png,image/webp" multiple webkitdirectory>
    <span>Nothing is uploaded or attached until you press ATTACH.</span></section>
    <div class="ops-list">${analysis.map(entry => `<article class="panel ops-row"><div><b>${esc(entry.fileName)}</b><span>${entry.title ? esc(entry.title) : `${entry.candidateCount} MATCHES`}</span><small>${entry.status.toUpperCase()}</small></div>${entry.status === "ready" ? `<button class="button primary" data-attach-artwork="${entry.id}">ATTACH</button>` : ""}</article>`).join("") || `<div class="panel empty"><b>NO FOLDER ANALYZED</b>Choose a folder of JPG, PNG, or WebP posters.</div>`}</div>
    <section class="panel ops-history"><h3>ATTACHMENT LEDGER</h3>${attachments.slice(0, 30).map(entry => `<article class="ops-ledger"><span>${new Date(entry.appliedAt).toLocaleString()}</span><b>${esc(state.items[entry.itemId]?.title || entry.itemId)}</b><em>${entry.status.toUpperCase()}</em>${entry.status === "applied" ? `<button class="button" data-rollback-artwork="${entry.id}">ROLL BACK</button>` : ""}</article>`).join("") || "<p>NO CURATED ATTACHMENTS YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Artwork Curator";
  document.querySelector("#view-code").textContent = "VAULT://ARTWORK";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage7) update(save => { save.metadata.stage7 = { startedAt: new Date().toISOString(), attachments: [], lastAnalysis: [] }; });
  document.addEventListener("change", event => {
    if (event.target.id !== "artwork-folder-input") return;
    analyzeArtworkFiles([...event.target.files]);
    renderArtworkCurator();
    toast("ARTWORK ANALYZED", `${event.target.files.length} local files checked.`);
  }, true);
  document.addEventListener("click", async event => {
    const attach = event.target.closest("[data-attach-artwork]");
    const rollback = event.target.closest("[data-rollback-artwork]");
    if (!attach && !rollback) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (attach) await attachCuratedArtwork(attach.dataset.attachArtwork);
      else await rollbackArtworkAttachment(rollback.dataset.rollbackArtwork);
      renderArtworkCurator();
      toast("CURATOR COMPLETE", attach ? "Artwork attached with rollback." : "Artwork attachment rolled back.");
    } catch (error) { toast("CURATOR STOPPED", error.message, 6500); }
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderArtworkCurator, 0));
  setTimeout(renderArtworkCurator, 0);
  return true;
}
function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}
setTimeout(() => schedule(), 0);
