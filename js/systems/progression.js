import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { escapeHtml } from "../ui/safeHtml.js";

const levels = [
  [0, "Shelf Dweller"], [50, "Weekend Rental"], [125, "Archivist"], [225, "Media Goblin"],
  [350, "Keeper of Questionable Taste"], [500, "Senior Vault Dweller"],
  [700, "Curator of Lost Weekends"], [950, "Keeper of the Forbidden Spreadsheet"],
  [1250, "Chronically Overcatalogued"], [1600, "The Archivist"]
];
const meaningfulRewards = {
  EXPEDITION_COMPLETED: 75,
  COLLECTION_SEALED: 60,
  SHOW_SEALED: 50,
  ANCIENT_BACKLOG_COMPLETED: 40
};

export function profileForXp(xp) {
  let level = 1;
  let title = levels[0][1];
  for (let index = 0; index < levels.length; index++) {
    if (xp >= levels[index][0]) { level = index + 1; title = levels[index][1]; }
  }
  const next = levels[level]?.[0] ?? null;
  return { level, title, next, currentFloor: levels[level - 1][0] };
}

function syncProfile(save) {
  const profile = profileForXp(Number(save.profile.xp || 0));
  save.profile.level = profile.level;
  save.profile.title = profile.title;
}

function reward(event) {
  const xp = meaningfulRewards[event.type];
  if (!xp) return;
  if (getState().metadata.stage13?.grants?.some(entry => entry.eventId === event.id)) return;
  update(save => {
    save.metadata.stage13 ||= { startedAt: new Date().toISOString(), grants: [] };
    save.metadata.stage13.grants.push({
      eventId: event.id, type: event.type, xp, at: event.timestamp,
      title: event.meta?.title || event.type
    });
    save.profile.xp = Number(save.profile.xp || 0) + xp;
    syncProfile(save);
  });
}

export function renderCharacterSheet() {
  if (location.hash !== "#/character") return;
  const state = getState();
  const profile = profileForXp(Number(state.profile.xp || 0));
  const grants = [...(state.metadata.stage13?.grants || [])].reverse();
  const progress = profile.next ? Math.round((state.profile.xp - profile.currentFloor) / (profile.next - profile.currentFloor) * 100) : 100;
  document.querySelector("#view").innerHTML = `<section class="voice-hero panel"><div><span class="eyebrow">STAGE 13 // MEANINGFUL PROGRESSION</span><h2>ARCHIVIST DOSSIER</h2>
    <p>Level ${profile.level} · ${profile.title}</p></div><div class="voice-eye">${profile.level}</div></section>
    <div class="voice-vitals"><div class="panel"><b>${state.profile.xp}</b><span>TOTAL XP</span></div><div class="panel"><b>${profile.level}</b><span>CLEARANCE LEVEL</span></div><div class="panel"><b>${grants.length}</b><span>MEANINGFUL GRANTS</span></div></div>
    <section class="panel"><div class="panel__header"><h2>${profile.next ? `${profile.next - state.profile.xp} XP TO NEXT TITLE` : "MAXIMUM ARCHIVAL CLEARANCE"}</h2><span class="panel__code">${progress}%</span></div><div class="progress"><span style="width:${progress}%"></span></div></section>
    <section class="panel ops-history"><h3>XP LEDGER</h3>${grants.map(grant => `<article class="ops-ledger"><span>${new Date(grant.at).toLocaleString()}</span><b>${escapeHtml(grant.title)}</b><em>+${grant.xp} XP</em><small>${escapeHtml(grant.type.replaceAll("_", " "))}</small></article>`).join("") || "<p>NO MEANINGFUL XP GRANTS YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Archivist Dossier";
  document.querySelector("#view-code").textContent = "VAULT://CHARACTER";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage13) update(save => {
    save.metadata.stage13 = { startedAt: new Date().toISOString(), grants: [], meaningfulOnly: true };
    syncProfile(save);
  });
  Object.keys(meaningfulRewards).forEach(type => on(type, reward));
  on("WING_VISITED", event => { if (event.wing === "character") setTimeout(renderCharacterSheet, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderCharacterSheet, 0));
  setTimeout(renderCharacterSheet, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
