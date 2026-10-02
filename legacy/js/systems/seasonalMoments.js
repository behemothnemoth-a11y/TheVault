import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const definitions = [
  { id: "new_year", title: "A NEW ARCHIVE VOLUME BEGINS.", test: date => date.getMonth() === 0 && date.getDate() === 1 },
  { id: "halloween", title: "THE ARCHIVE HAS GONE DARK.", test: date => date.getMonth() === 9 && date.getDate() === 31 },
  { id: "witching_minute", title: "ARE YOU LOST?", test: date => date.getHours() === 3 && date.getMinutes() === 33 }
];

export function seasonalCandidates(now = new Date(), state = getState()) {
  return definitions.filter(definition => definition.test(now)).map(definition => ({
    ...definition, key: `${definition.id}:${now.getFullYear()}`,
    alreadyTriggered: Boolean(state.metadata.stage27?.moments?.some(moment => moment.key === `${definition.id}:${now.getFullYear()}`))
  }));
}

export function triggerSeasonalMoments(now = new Date()) {
  const eligible = seasonalCandidates(now).filter(candidate => !candidate.alreadyTriggered);
  if (!eligible.length) return [];
  update(save => eligible.forEach(candidate => save.metadata.stage27.moments.push({
    id: createId("seasonal"), key: candidate.key, kind: candidate.id, title: candidate.title,
    triggeredAt: now.toISOString(), evidence: { localDate: now.toString(), rule: candidate.id }
  })));
  eligible.forEach(candidate => {
    emit("VAULT_MOMENT_TRIGGERED", { meta: { title: candidate.title, moment: candidate.id, evidence: { key: candidate.key } } });
    toast(candidate.title, "A rare calendar condition was met.", 7000);
  });
  document.body.dataset.seasonal = eligible[0]?.id || "";
  return eligible;
}

export function recordCollectionCeremony(event) {
  const collectionId = event?.meta?.collectionId;
  if (!event?.id || !collectionId) return null;
  const state = getState(), key = `collection:${collectionId}`;
  if (state.metadata.stage27?.moments?.some(moment => moment.key === key)) return null;
  const moment = {
    id: createId("seasonal"), key, kind: "collection_ceremony",
    title: `${event.meta?.title || "A collection"} was sealed.`,
    triggeredAt: event.timestamp || new Date().toISOString(),
    evidence: { eventId: event.id, collectionId, total: Number(event.meta?.total || 0) }
  };
  update(save => save.metadata.stage27.moments.push(moment));
  emit("VAULT_MOMENT_TRIGGERED", { meta: { title: moment.title, moment: moment.kind, evidence: moment.evidence } });
  toast("COLLECTION CEREMONY", moment.title, 7000);
  return moment;
}
export function renderSeasonalChamber() {
  if (location.hash !== "#/seasonal") return;
  const moments = [...getState().metadata.stage27.moments].reverse();
  document.querySelector("#view").innerHTML = `<section class="voice-hero panel"><div><span class="eyebrow">STAGE 27 // RARE BY DESIGN</span><h2>SEASONAL CHAMBER</h2><p>Calendar moments trigger once per defined period. Nothing here rewards daily attendance.</p></div><div class="voice-eye">☾</div></section>
    <div class="achievement-grid">${definitions.map(definition => `<article class="panel achievement"><div class="achievement__icon">?</div><h3>${definition.id.replaceAll("_", " ").toUpperCase()}</h3><p>${definition.title}</p><small>CALENDAR RULE / ONCE PER YEAR</small></article>`).join("")}<article class="panel achievement"><div class="achievement__icon">C</div><h3>COLLECTION CEREMONY</h3><p>A sealed collection receives one evidence-backed archival ceremony.</p><small>CANONICAL SEAL EVENT / ONCE PER COLLECTION</small></article></div>
    <section class="panel ops-history"><h3>SEASONAL LEDGER</h3>${moments.map(moment => `<article class="ops-ledger"><span>${new Date(moment.triggeredAt).toLocaleString()}</span><b>${esc(moment.title)}</b><em>${esc(moment.kind)}</em><small>${esc(moment.key)}</small></article>`).join("") || "<p>NO SEASONAL MOMENT HAS OCCURRED.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Seasonal Chamber"; document.querySelector("#view-code").textContent = "VAULT://SEASONAL";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage27) update(save => { save.metadata.stage27 = { startedAt: new Date().toISOString(), moments: [], streaksDisabled: true, annualDeduplication: true }; });
  setTimeout(() => triggerSeasonalMoments(), 10000);
  setInterval(() => triggerSeasonalMoments(), 60000);
  on("COLLECTION_SEALED", event => recordCollectionCeremony(event));
  on("WING_VISITED", event => { if (event.wing === "seasonal") setTimeout(renderSeasonalChamber, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderSeasonalChamber, 0)); setTimeout(renderSeasonalChamber, 100); return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
