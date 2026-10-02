import { on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { evaluateAchievement, getAchievements } from "./achievements.js";

const ruleTypes = new Set(["event_count", "item_count", "achievement_chain"]);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function createAchievementDefinition(input) {
  if (!String(input.title || "").trim()) throw new Error("An achievement needs a title.");
  if (!ruleTypes.has(input.rule?.type)) throw new Error("Unknown evidence rule type.");
  const id = `achievement_custom_${createId("a").split("_").slice(1).join("_")}`;
  await createArchiveSnapshot(`Protected snapshot before achievement definition ${id}`, { kind: "pre_achievement_definition", protected: true });
  update(save => {
    save.metadata.stage20.definitions[id] = {
      id, title: String(input.title).trim(), description: String(input.description || "").trim(),
      icon: String(input.icon || "◆").slice(0, 4), secret: Boolean(input.secret),
      rarity: input.rarity || "uncommon", xp: Math.max(0, Math.min(250, Number(input.xp || 25))),
      rule: structuredClone(input.rule), status: "active", version: 1, createdAt: new Date().toISOString()
    };
  });
  return id;
}

export async function archiveAchievementDefinition(id) {
  if (!getState().metadata.stage20.definitions[id]) throw new Error("Custom achievement not found.");
  await createArchiveSnapshot(`Protected snapshot before archiving achievement ${id}`, { kind: "pre_achievement_archive", protected: true });
  update(save => { save.metadata.stage20.definitions[id].status = "archived"; save.metadata.stage20.definitions[id].archivedAt = new Date().toISOString(); });
}

export function renderAchievementWorkshop() {
  if (location.hash !== "#/achievement-workshop") return;
  const state = getState(), achievements = getAchievements();
  const custom = Object.values(state.metadata.stage20.definitions);
  document.querySelector("#view").innerHTML = `<section class="guild-hero panel"><span class="eyebrow">STAGE 20 // EVIDENCE WORKSHOP</span><h2>ACHIEVEMENT WORKSHOP</h2><p>Requirements are declarative, inspectable, and grounded in records or canonical events.</p></section>
    <div class="voice-vitals"><div class="panel"><b>${achievements.length}</b><span>DEFINITIONS</span></div><div class="panel"><b>${achievements.filter(item => item.unlocked).length}</b><span>UNLOCKED</span></div><div class="panel"><b>${custom.length}</b><span>CUSTOM</span></div></div>
    <section class="panel voice-policy"><b>NO HIDDEN CODE.</b><span>Secret requirements may be redacted in the Trophy Chamber, but their evidence rule remains auditable here.</span></section>
    <div class="achievement-grid">${achievements.map(item => { const evaluation = evaluateAchievement(item, state); return `<article class="panel achievement ${item.unlocked ? "" : "locked"}"><div class="achievement__icon">${item.secret && !item.unlocked ? "▓" : esc(item.icon)}</div><h3>${item.secret && !item.unlocked ? "CLASSIFIED" : esc(item.title)}</h3><p>${esc(item.description)}</p><small>${item.unlocked ? "UNLOCKED" : `${evaluation.evidence.count ?? 0}/${item.rule?.target ?? "?"} · ${item.rarity || "standard"}`}</small>${item.unlocked ? `<details><summary>EVIDENCE</summary><pre>${esc(JSON.stringify(item.unlocked.evidence, null, 2))}</pre></details>` : ""}${item.id.startsWith("achievement_custom_") ? `<button class="button danger" data-archive-achievement="${item.id}">ARCHIVE DEFINITION</button>` : ""}</article>`; }).join("")}</div>`;
  document.querySelector("#view-title").textContent = "Achievement Workshop";
  document.querySelector("#view-code").textContent = "VAULT://ACHIEVEMENTS";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage20) update(save => { save.metadata.stage20 = { startedAt: new Date().toISOString(), definitions: {}, evidenceRequired: true }; });
  document.addEventListener("click", async event => {
    const archive = event.target.closest("[data-archive-achievement]");
    if (!archive) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try { await archiveAchievementDefinition(archive.dataset.archiveAchievement); renderAchievementWorkshop(); toast("ACHIEVEMENT ARCHIVED", "Unlocked evidence remains preserved."); }
    catch (error) { toast("WORKSHOP STOPPED", error.message, 6000); }
  }, true);
  on("WING_VISITED", event => { if (event.wing === "achievement-workshop") setTimeout(renderAchievementWorkshop, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderAchievementWorkshop, 0));
  setTimeout(renderAchievementWorkshop, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
