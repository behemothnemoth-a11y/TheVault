import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

let busy = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function findProposal(proposalId) {
  return getState().metadata?.stage5?.proposals?.find(entry => entry.id === proposalId);
}

export async function applyProtectedRepair(proposalId) {
  if (busy) throw new Error("The Repair Bay is already working.");
  const proposal = findProposal(proposalId);
  if (!proposal) throw new Error("Proposal not found.");
  if (proposal.status === "applied") throw new Error("This proposal is already applied.");
  if (proposal.confidence !== "high") throw new Error("Only high-confidence proposals can enter the Repair Bay.");
  const show = getState().items?.[proposal.showId];
  if (!show) throw new Error("Series record not found.");
  const beforeEpisode = proposal.episodeId ? structuredClone(show.episodes?.[proposal.episodeId]) : null;
  if (proposal.action !== "create_episode_record" && !beforeEpisode) throw new Error("Episode record not found.");

  busy = true;
  try {
    await createArchiveSnapshot(`Protected snapshot before repair ${proposal.id}`, {
      kind: "pre_repair",
      protected: true
    });
    const repairId = createId("repair");
    const timestamp = new Date().toISOString();
    update(save => {
      const liveProposal = save.metadata.stage5.proposals.find(entry => entry.id === proposalId);
      const liveShow = save.items[liveProposal.showId];
      let episodeId = liveProposal.episodeId;
      if (liveProposal.action === "create_episode_record") {
        episodeId = createId("episode");
        liveShow.episodes ||= {};
        liveShow.episodes[episodeId] = {
          id: episodeId,
          season: Number(liveProposal.season),
          number: Number(liveProposal.episode),
          title: `Episode ${Number(liveProposal.episode)}`,
          status: "backlog",
          rating: null,
          note: "",
          rewatches: 0,
          sourcePath: liveProposal.proposedPath
        };
        liveShow.progress ||= {};
        liveShow.progress.total = Object.keys(liveShow.episodes).length;
      } else if (liveProposal.action === "alternate_file") {
        const episode = liveShow.episodes[episodeId];
        episode.alternateSourcePaths = [...new Set([...(episode.alternateSourcePaths || []), liveProposal.proposedPath])];
      } else {
        liveShow.episodes[episodeId].sourcePath = liveProposal.proposedPath;
      }
      liveProposal.episodeId = episodeId;
      liveProposal.status = "applied";
      liveProposal.decision = { status: "applied", decidedAt: timestamp, repairId };
      save.metadata.stage6 ||= { startedAt: timestamp, repairs: [] };
      save.metadata.stage6.repairs.push({
        id: repairId,
        proposalId,
        showId: liveShow.id,
        episodeId,
        action: liveProposal.action,
        status: "applied",
        appliedAt: timestamp,
        beforeEpisode,
        afterEpisode: structuredClone(liveShow.episodes[episodeId])
      });
      save.events.push({
        id: createId("evt"), type: "REPAIR_APPLIED", timestamp,
        itemId: liveShow.id, episodeId, wing: "tv",
        meta: { title: liveShow.title, action: liveProposal.action, repairId }
      });
    });
    return getState().metadata.stage6.repairs.at(-1);
  } finally {
    busy = false;
  }
}

export async function rollbackProtectedRepair(repairId) {
  if (busy) throw new Error("The Repair Bay is already working.");
  const repair = getState().metadata?.stage6?.repairs?.find(entry => entry.id === repairId);
  if (!repair || repair.status !== "applied") throw new Error("Active repair record not found.");
  busy = true;
  try {
    await createArchiveSnapshot(`Protected snapshot before rollback ${repair.id}`, {
      kind: "pre_repair_rollback",
      protected: true
    });
    const timestamp = new Date().toISOString();
    update(save => {
      const liveRepair = save.metadata.stage6.repairs.find(entry => entry.id === repairId);
      const show = save.items[liveRepair.showId];
      if (liveRepair.beforeEpisode) show.episodes[liveRepair.episodeId] = structuredClone(liveRepair.beforeEpisode);
      else delete show.episodes[liveRepair.episodeId];
      show.progress ||= {};
      show.progress.total = Object.keys(show.episodes || {}).length;
      liveRepair.status = "rolled_back";
      liveRepair.rolledBackAt = timestamp;
      const proposal = save.metadata.stage5.proposals.find(entry => entry.id === liveRepair.proposalId);
      if (proposal) {
        proposal.status = "pending";
        proposal.decision = { status: "pending", decidedAt: timestamp, rollbackOf: repairId };
        if (!liveRepair.beforeEpisode) proposal.episodeId = null;
      }
      save.events.push({
        id: createId("evt"), type: "REPAIR_ROLLED_BACK", timestamp,
        itemId: liveRepair.showId, episodeId: liveRepair.episodeId, wing: "tv",
        meta: { title: show.title, action: liveRepair.action, repairId }
      });
    });
  } finally {
    busy = false;
  }
}

export function renderRepairBay() {
  if (location.hash !== "#/repairs") return;
  const state = getState();
  const eligible = (state.metadata.stage5?.proposals || []).filter(entry =>
    entry.status === "pending" && entry.confidence === "high"
  );
  const repairs = [...(state.metadata.stage6?.repairs || [])].reverse();
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 6 // GUARDED EXECUTION</span>
    <h2>REPAIR BAY</h2><p>Every repair begins with a protected snapshot. Every applied change has a rollback record. Media files are never changed.</p></section>
    <div class="ops-vitals"><div class="panel"><b>${eligible.length}</b><span>ELIGIBLE</span></div><div class="panel"><b>${repairs.filter(entry => entry.status === "applied").length}</b><span>ACTIVE REPAIRS</span></div><div class="panel"><b>${repairs.filter(entry => entry.status === "rolled_back").length}</b><span>ROLLED BACK</span></div></div>
    <section class="panel ops-notice"><b>HIGH CONFIDENCE ONLY</b><span>Medium-confidence theories remain proposals until you review them.</span></section>
    <div class="ops-list">${eligible.slice(0, 40).map(entry => `<article class="panel ops-row"><div><b>${esc(entry.title)} · S${entry.season}E${entry.episode}</b><span>${esc(entry.action.replaceAll("_", " "))}</span><small>${esc(entry.proposedPath)}</small></div><button class="button primary" data-apply-repair="${entry.id}">SNAPSHOT + APPLY</button></article>`).join("") || `<div class="panel empty"><b>NO ELIGIBLE REPAIRS</b>The proposal laboratory has no pending high-confidence repairs.</div>`}</div>
    <section class="panel ops-history"><h3>REPAIR LEDGER</h3>${repairs.slice(0, 50).map(entry => `<article class="ops-ledger"><span>${new Date(entry.appliedAt).toLocaleString()}</span><b>${esc(entry.action.replaceAll("_", " "))}</b><em>${entry.status.toUpperCase()}</em>${entry.status === "applied" ? `<button class="button" data-rollback-repair="${entry.id}">ROLL BACK</button>` : ""}</article>`).join("") || "<p>NO REPAIRS APPLIED.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Protected Repair Bay";
  document.querySelector("#view-code").textContent = "VAULT://REPAIRS";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-operations-styles]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "./css/operations.css"; link.dataset.operationsStyles = "";
    document.head.append(link);
  }
  if (!getState().metadata.stage6) update(save => { save.metadata.stage6 = { startedAt: new Date().toISOString(), repairs: [] }; });
  document.addEventListener("click", async event => {
    const apply = event.target.closest("[data-apply-repair]");
    const rollback = event.target.closest("[data-rollback-repair]");
    if (!apply && !rollback) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (apply) await applyProtectedRepair(apply.dataset.applyRepair);
      else await rollbackProtectedRepair(rollback.dataset.rollbackRepair);
      toast("REPAIR BAY COMPLETE", apply ? "Repair applied with protected rollback." : "Repair rolled back safely.");
      renderRepairBay();
    } catch (error) { toast("REPAIR BAY STOPPED", error.message, 6500); }
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderRepairBay, 0));
  setTimeout(renderRepairBay, 0);
  return true;
}
function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}
setTimeout(() => schedule(), 0);
