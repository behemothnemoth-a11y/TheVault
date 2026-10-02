import { on, emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { checkAchievements, getAchievements } from "./achievements.js";
import { getObservationReport, selectObservation } from "./observations.js";
import { startVaultMoments } from "./vaultMoments.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
let installed = false;

function rememberMoment(kind, title, detail, evidence = {}) {
  const state = getState();
  const same = state.metadata.stage11?.moments?.find(entry =>
    entry.kind === kind && evidence.itemId && entry.evidence?.itemId === evidence.itemId
  );
  if (same) return false;
  update(save => {
    save.metadata.stage11 ||= { startedAt: new Date().toISOString(), moments: [], observationsSeen: [] };
    save.metadata.stage11.moments.push({
      id: createId("moment"), kind, title, detail, evidence,
      triggeredAt: new Date().toISOString()
    });
    save.metadata.stage11.moments = save.metadata.stage11.moments.slice(-250);
  });
  return true;
}

function handleEvent(event) {
  if (event.type === "WING_VISITED" && event.wing === "voice") setTimeout(renderArchiveVoice, 0);
  if (!["VAULT_OPENED", "WING_VISITED", "VAULT_MOMENT_TRIGGERED"].includes(event.type)) queueMicrotask(checkAchievements);
  if (event.type === "ITEM_COMPLETED") {
    const item = getState().items[event.itemId];
    const added = Date.parse(item?.addedAt || "");
    const days = Number.isFinite(added) ? Math.floor((Date.now() - added) / 86400000) : 0;
    if (days >= 1825 && rememberMoment("ancient_backlog", "IT HAS BEEN WAITING.",
      `${item.title} left the backlog after ${days.toLocaleString()} days.`,
      { itemId: item.id, addedAt: item.addedAt, days })) {
      emit("ANCIENT_BACKLOG_COMPLETED", {
        itemId: item.id, wing: item.wing, meta: { title: item.title, days }
      });
      toast("IT HAS BEEN WAITING.", `${days.toLocaleString()} days in the backlog.`, 7000);
    }
  }
  if (event.type === "EPISODE_COMPLETED") {
    const show = getState().items[event.itemId];
    const episodes = Object.values(show?.episodes || {});
    if (episodes.length && episodes.every(episode => episode.status === "completed") &&
        rememberMoment("show_sealed", "SERIES FILE SEALED", show.title,
          { itemId: show.id, episodes: episodes.length })) {
      emit("SHOW_SEALED", { itemId: show.id, wing: "tv", meta: { title: show.title, episodes: episodes.length } });
      toast("SERIES FILE SEALED", `${show.title} · ${episodes.length} episodes`, 7000);
    }
  }
  if (event.type === "ACHIEVEMENT_UNLOCKED") {
    rememberMoment("achievement", "ACHIEVEMENT UNLOCKED", event.meta?.title || "Classified achievement",
      { achievementId: event.achievementId });
    toast("ACHIEVEMENT UNLOCKED", event.meta?.title || "Classified", 6500);
  }
}

export function renderArchiveVoice() {
  if (location.hash !== "#/voice") return;
  const state = getState();
  const signals = getObservationReport(state);
  const selected = selectObservation(state);
  const moments = [...(state.metadata.stage11?.moments || [])].reverse();
  const achievements = getAchievements();
  document.querySelector("#view").innerHTML = `<section class="voice-hero panel"><div><span class="eyebrow">STAGE 11 // EVIDENCE-BASED CHARACTER</span>
    <h2>ARCHIVE VOICE</h2><p>${esc(selected.message)}</p></div><div class="voice-eye">V</div></section>
    <div class="voice-vitals"><div class="panel"><b>${signals.length}</b><span>CURRENT SIGNALS</span></div><div class="panel"><b>${moments.length}</b><span>RECORDED MOMENTS</span></div><div class="panel"><b>${achievements.filter(entry => entry.unlocked).length}</b><span>ACHIEVEMENTS FOUND</span></div></div>
    <section class="panel voice-policy"><b>THE VAULT DOES NOT INVENT MEMORIES.</b><span>Every statement below includes the archive facts that produced it.</span></section>
    <div class="voice-grid">${signals.map(signal => `<article class="panel voice-signal ${signal.id === selected.id ? "selected" : ""}"><small>${signal.rarity.toUpperCase()} · ${esc(signal.id.replaceAll("_", " "))}</small><b>${esc(signal.message)}</b><details><summary>SHOW EVIDENCE</summary><pre>${esc(JSON.stringify(signal.evidence, null, 2))}</pre></details></article>`).join("")}</div>
    <section class="panel voice-ledger"><div class="panel__header"><h2>MOMENT LEDGER</h2><span class="panel__code">RARE BY DESIGN</span></div>
      ${moments.map(moment => `<article><time>${new Date(moment.triggeredAt).toLocaleString()}</time><b>${esc(moment.title)}</b><span>${esc(moment.detail)}</span></article>`).join("") || `<div class="empty"><b>NO SPECIAL MOMENTS RECORDED.</b>The Vault is not going to fake one.</div>`}</section>`;
  document.querySelector("#view-title").textContent = "Archive Voice";
  document.querySelector("#view-code").textContent = "VAULT://VOICE";
}

function install() {
  if (installed) return true;
  if (!getState() || !document.querySelector("#view")) return false;
  installed = true;
  if (!document.querySelector("link[data-voice-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/archive-voice.css"; link.dataset.voiceStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage11) update(save => {
    save.metadata.stage11 = { startedAt: new Date().toISOString(), moments: [], observationsSeen: [], evidenceRequired: true };
  });
  on("*", handleEvent);
  checkAchievements();
  startVaultMoments((title, detail) => {
    rememberMoment("midnight", title, detail, { date: new Date().toISOString().slice(0, 10) });
    toast(title, detail, 7000);
  });
  window.addEventListener("hashchange", () => setTimeout(renderArchiveVoice, 0));
  setTimeout(renderArchiveVoice, 0);
  return true;
}
function schedule(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => schedule(attempt + 1), 25);
}
setTimeout(() => schedule(), 0);
