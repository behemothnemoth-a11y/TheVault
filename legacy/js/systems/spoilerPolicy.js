import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

export function clearanceForShow(show, preference = getState().preferences.spoilerClearance ?? 2) {
  const episodes = Object.values(show?.episodes || {}), completed = episodes.filter(entry => entry.status === "completed").length;
  const progressLevel = !episodes.length ? 1 : completed === episodes.length ? 5 : completed ? Math.min(4, 1 + Math.floor(completed / episodes.length * 4)) : 1;
  return Math.min(Number(preference), progressLevel);
}

export function applySpoilerPolicy() {
  const route = location.hash.replace(/^#\//, "");
  if (route !== "tv") return;
  const state = getState();
  document.querySelectorAll("[data-open-series]").forEach(button => {
    const show = state.items[button.dataset.openSeries];
    button.dataset.spoilerClearance = clearanceForShow(show);
  });
  document.querySelectorAll(".series-header").forEach(header => {
    const title = document.querySelector("#view-title")?.textContent;
    const show = Object.values(state.items).find(item => item.wing === "tv" && item.title === title);
    if (show) header.dataset.spoilerClearance = clearanceForShow(show);
  });
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage23) update(save => { save.metadata.stage23 = { startedAt: new Date().toISOString(), progressSensitive: true, fields: ["artwork", "episode_titles", "descriptions", "trivia", "achievements"] }; });
  on("WING_VISITED", event => { if (event.wing === "tv") setTimeout(applySpoilerPolicy, 50); });
  window.addEventListener("hashchange", () => setTimeout(applySpoilerPolicy, 100));
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
