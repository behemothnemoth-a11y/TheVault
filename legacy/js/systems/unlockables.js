import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

const catalog = [
  { id: "unlock_command_amber", level: 2, title: "Amber Command Skin", kind: "command_skin" },
  { id: "unlock_title_archivist", level: 3, title: "Archivist Title", kind: "title" },
  { id: "unlock_video_store_badge", level: 4, title: "Video Store Badge", kind: "decoration" },
  { id: "unlock_dossier_stamp", level: 5, title: "Senior Clearance Stamp", kind: "decoration" },
  { id: "unlock_basement_lamp", level: 6, title: "Basement Lamp", kind: "secret_cosmetic" },
  { id: "unlock_terminal_skin", level: 7, title: "Terminal Command Skin", kind: "command_skin" }
];

export function syncUnlockables() {
  const state = getState();
  const eligible = catalog.filter(entry => Number(state.profile.level || 1) >= entry.level && !state.metadata.stage21.unlocks[entry.id]);
  if (!eligible.length) return [];
  update(save => eligible.forEach(entry => {
    save.metadata.stage21.unlocks[entry.id] = { unlockedAt: new Date().toISOString(), level: entry.level, kind: entry.kind };
    save.metadata.stage21.ledger.push({ id: entry.id, title: entry.title, level: entry.level, at: save.metadata.stage21.unlocks[entry.id].unlockedAt });
  }));
  return eligible;
}

export function renderUnlockVault() {
  if (location.hash !== "#/unlockables") return;
  const state = getState(); syncUnlockables();
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 21 // COSMETIC PROGRESSION</span><h2>UNLOCK VAULT</h2><p>Progression changes atmosphere and identity. Core archive functions are never locked.</p></section><div class="achievement-grid">${catalog.map(entry => { const unlocked = state.metadata.stage21.unlocks[entry.id]; return `<article class="panel achievement ${unlocked ? "" : "locked"}"><div class="achievement__icon">${unlocked ? "◆" : "▓"}</div><h3>${entry.title}</h3><p>${entry.kind.replaceAll("_", " ")}</p><small>${unlocked ? `UNLOCKED AT LEVEL ${entry.level}` : `LEVEL ${entry.level}`}</small></article>`; }).join("")}</div>`;
  document.querySelector("#view-title").textContent = "Unlock Vault";
  document.querySelector("#view-code").textContent = "VAULT://UNLOCKS";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage21) update(save => { save.metadata.stage21 = { startedAt: new Date().toISOString(), unlocks: {}, ledger: [], coreFunctionsLocked: false }; });
  ["ACHIEVEMENT_UNLOCKED", "EXPEDITION_COMPLETED", "COLLECTION_SEALED", "SHOW_SEALED"].forEach(type => on(type, () => queueMicrotask(syncUnlockables)));
  syncUnlockables();
  on("WING_VISITED", event => { if (event.wing === "unlockables") setTimeout(renderUnlockVault, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderUnlockVault, 0));
  setTimeout(renderUnlockVault, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
