import { getState, getStorageStatus } from "../core/store.js";
import { runHealthCheck } from "./health.js";

export function renderControlRoom() {
  const state = getState(), storage = getStorageStatus(), health = runHealthCheck(state);
  const records = Object.keys(state.items || {}).length;
  const episodes = Object.values(state.items || {}).flatMap(item => Object.values(item.episodes || {})).length;
  const review = (state.metadata?.reviewQueue?.items || []).filter(item => item.status === "pending").length;
  return `<section class="panel control-hero">
    <span class="eyebrow">ONE PLACE FOR ARCHIVE OPERATIONS</span><h2>CONTROL ROOM</h2>
    <p>Health, automation, approvals, recovery, and advanced maintenance are consolidated here. Normal browsing stays in the Library.</p>
  </section>
  <section class="control-vitals">
    <article class="panel"><span>HEALTH</span><b class="${health.ok ? "good" : "danger"}">${health.ok ? "NOMINAL" : `${health.issues.length} ISSUES`}</b><small>${records} records checked</small></article>
    <article class="panel"><span>EPISODES</span><b>${episodes}</b><small>cataloged episode records</small></article>
    <article class="panel"><span>DECISIONS</span><b>${review}</b><small>pending review items</small></article>
    <article class="panel"><span>RECOVERY</span><b>${storage.snapshotCount || 0}</b><small>snapshots / ${storage.engine}</small></article>
  </section>
  <div class="control-grid">
    <section class="panel"><h3>CARE AND AUTOMATION</h3><p>Observe, preview, approve, and verify background care.</p><div class="control-links">
      <button class="button primary" data-route="steward">VAULT STEWARD</button>
      <button class="button" data-route="operations">OPERATIONS</button>
      <button class="button" data-route="autopilot">AUTOPILOT</button>
      <button class="button" data-route="supervision">SUPERVISION</button>
      <button class="button" data-route="audit">FINAL AUDIT</button>
    </div></section>
    <section class="panel"><h3>DATA AND ENRICHMENT</h3><p>Edit records, add local posters, and import reviewed exports.</p><div class="control-links">
      <button class="button primary" data-route="workbench">WORKBENCH</button>
      <button class="button" data-route="imports">IMPORT STATION</button>
      <button class="button" data-route="artwork">POSTER CURATOR</button>
      <button class="button" data-route="enrichment">ENRICHMENT</button>
      <button class="button" data-route="settings">SETTINGS / DATA</button>
    </div></section>
  </div>
  <details class="panel control-maintenance"><summary><b>ADVANCED MAINTENANCE</b><span>DVD-rip extras remain intentional and are not treated as errors.</span></summary><div class="control-links">
    <button class="button" data-route="sentinel">SENTINEL</button>
    <button class="button" data-route="reconcile">RECONCILE</button>
    <button class="button" data-route="repairs">REPAIR BAY</button>
  </div></details>`;
}
