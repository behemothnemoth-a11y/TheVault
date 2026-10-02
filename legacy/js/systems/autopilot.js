import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { runOperationsJob } from "./operationsCenter.js";

let cycleInFlight = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export async function runAutopilotCycle({ source = "manual", quiet = false } = {}) {
  if (cycleInFlight) throw new Error("An Autopilot cycle is already running.");
  cycleInFlight = true;
  const cycleId = createId("cycle");
  const startedAt = new Date().toISOString();
  const steps = [];
  let outcome = "passed";
  try {
    for (const jobId of ["health", "snapshot", "sentinel", "health"]) {
      try {
        const result = await runOperationsJob(jobId, { quiet: true, source: `autopilot:${cycleId}` });
        steps.push({ jobId, outcome: result.outcome, detail: result.detail });
        if (result.outcome !== "passed") {
          outcome = "attention";
          if (jobId === "health") break;
        }
      } catch (error) {
        steps.push({ jobId, outcome: "failed", detail: error.message });
        outcome = "failed";
        break;
      }
    }
  } finally {
    const finishedAt = new Date().toISOString();
    update(save => {
      save.metadata.stage10 ||= { startedAt, enabled: true, cycles: [], policy: {} };
      save.metadata.stage10.lastRunAt = finishedAt;
      save.metadata.stage10.cycles.push({ id: cycleId, source, startedAt, finishedAt, outcome, steps });
      save.metadata.stage10.cycles = save.metadata.stage10.cycles.slice(-90);
    });
    cycleInFlight = false;
    if (!quiet) toast(outcome === "passed" ? "AUTOPILOT CYCLE COMPLETE" : "AUTOPILOT PAUSED SAFELY",
      outcome === "passed" ? "Health, snapshot, DVD boundary, and final health completed." : "The cycle stopped before unsafe follow-on work.", 7000);
    renderAutopilot();
  }
  return { cycleId, outcome, steps };
}

export function renderAutopilot() {
  if (location.hash !== "#/autopilot") return;
  const stage = getState().metadata.stage10 || { enabled: true, cycles: [] };
  const cycles = [...(stage.cycles || [])].reverse();
  const last = cycles[0];
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 10 // SAFE AUTOPILOT</span><h2>AUTOPILOT</h2>
    <p>The Vault can maintain itself while its local launcher is open. It checks health, protects a snapshot, and respects the intentional DVD-rip boundary. It never inventories excluded rips, repairs links, attaches artwork, or changes media files.</p></section>
    <div class="ops-vitals"><div class="panel"><b>${stage.enabled ? "ON" : "OFF"}</b><span>DAILY CYCLE</span></div><div class="panel"><b>${cycles.length}</b><span>RECORDED CYCLES</span></div><div class="panel"><b>${last?.outcome?.toUpperCase() || "READY"}</b><span>LAST OUTCOME</span></div></div>
    <section class="panel autopilot-controls"><button class="button primary" data-run-autopilot ${cycleInFlight ? "disabled" : ""}>${cycleInFlight ? "CYCLE RUNNING..." : "RUN SAFE CYCLE NOW"}</button>
      <button class="button" data-toggle-autopilot>${stage.enabled ? "TURN DAILY CYCLE OFF" : "TURN DAILY CYCLE ON"}</button></section>
    <section class="panel ops-notice"><b>HARD SAFETY LIMIT</b><span>Autopilot has no permission to apply Reconciliation proposals or Curator matches.</span></section>
    <section class="panel autopilot-map"><article><b>1 · HEALTH GATE</b><span>Stops on structural damage.</span></article><article><b>2 · SNAPSHOT</b><span>Protects current Vault data.</span></article><article><b>3 · DVD BOUNDARY</b><span>Skips intentional rip inventory by policy.</span></article><article><b>4 · FINAL HEALTH</b><span>Confirms the cycle ended cleanly.</span></article></section>
    <section class="panel ops-history"><h3>CYCLE LEDGER</h3>${cycles.slice(0, 40).map(cycle => `<article class="autopilot-cycle"><header><b>${new Date(cycle.startedAt).toLocaleString()}</b><em>${cycle.outcome.toUpperCase()}</em></header>${cycle.steps.map(step => `<span>${esc(step.jobId.toUpperCase())} · ${esc(step.outcome.toUpperCase())} · ${esc(step.detail)}</span>`).join("")}</article>`).join("") || "<p>NO AUTOPILOT CYCLES YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Safe Autopilot";
  document.querySelector("#view-code").textContent = "VAULT://AUTOPILOT";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-autopilot-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/autopilot.css"; link.dataset.autopilotStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage10) update(save => {
    save.metadata.stage10 = {
      startedAt: new Date().toISOString(), enabled: true, cycles: [],
      policy: { repairsAutomatic: false, artworkAutomatic: false, mediaFileChangesAllowed: false, intervalHours: 24 }
    };
  });
  document.addEventListener("click", async event => {
    const run = event.target.closest("[data-run-autopilot]");
    const toggle = event.target.closest("[data-toggle-autopilot]");
    if (!run && !toggle) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (toggle) {
      update(save => { save.metadata.stage10.enabled = !save.metadata.stage10.enabled; });
      renderAutopilot();
      return;
    }
    try { await runAutopilotCycle(); }
    catch (error) { toast("AUTOPILOT STOPPED", error.message, 6500); }
  }, true);
  window.addEventListener("hashchange", () => setTimeout(renderAutopilot, 0));
  setTimeout(renderAutopilot, 0);
  setTimeout(() => {
    const stage = getState().metadata.stage10;
    const last = stage.lastRunAt ? Date.parse(stage.lastRunAt) : 0;
    if (stage.enabled && Date.now() - last >= 86400000) runAutopilotCycle({ source: "daily", quiet: true }).catch(() => {});
  }, 90000);
  return true;
}
function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}
setTimeout(() => schedule(), 0);
