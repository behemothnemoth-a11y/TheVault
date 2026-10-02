import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { renderWing } from "../wings/views.js";
import { ensureTimelineStyles, renderTimeMachine, setTimelineFilter } from "./timeline.js";

const episodeCache = new Map();
let installed = false;
const currentRoute = () => location.hash.replace(/^#\//, "") || "home";

function refreshWing() {
  const route = currentRoute();
  if (!["movies", "games", "books"].includes(route)) return;
  document.querySelector("#view").innerHTML = renderWing(route, document.querySelector("#global-search")?.value || "");
}

function showTimeMachine() {
  if (currentRoute() !== "timeline") return;
  document.querySelector("#view").innerHTML = renderTimeMachine(document.querySelector("#global-search")?.value || "");
  document.querySelector("#view-title").textContent = "The Time Machine";
  document.querySelector("#view-code").textContent = "VAULT://TIME_MACHINE";
}

function episodeState(episode) {
  return {
    status: episode.status,
    rating: episode.rating ?? null,
    note: episode.note || "",
    rewatches: Number(episode.rewatches || 0)
  };
}

function rememberEpisodes() {
  episodeCache.clear();
  for (const item of Object.values(getState().items || {})) {
    for (const episode of Object.values(item.episodes || {})) episodeCache.set(episode.id, episodeState(episode));
  }
}

function canonicalizeEpisodeUpdate(event) {
  const show = getState().items[event.itemId];
  const episode = show?.episodes?.[event.episodeId];
  if (!episode) return;
  const before = episodeCache.get(episode.id) || { status: null, rating: null, note: "", rewatches: 0 };
  const after = episodeState(episode);
  const entries = [];
  const add = (type, from, to) => entries.push({
    id: createId("evt"),
    type,
    timestamp: new Date().toISOString(),
    itemId: show.id,
    episodeId: episode.id,
    wing: "tv",
    meta: { title: event.meta?.title || show.title, from, to }
  });
  if (before.status !== after.status) add(after.status === "completed" ? "EPISODE_COMPLETED" : "EPISODE_UNCOMPLETED", before.status, after.status);
  if (before.rating !== after.rating) add(before.rating == null ? "EPISODE_RATED" : "EPISODE_RATING_CHANGED", before.rating, after.rating);
  if (before.note !== after.note) add("EPISODE_NOTE_CHANGED", before.note ? "NOTE" : "EMPTY", after.note ? "NOTE" : "EMPTY");
  if (before.rewatches !== after.rewatches) add("EPISODE_REWATCHED", before.rewatches, after.rewatches);
  if (entries.length) {
    update(save => {
      save.events.push(...entries);
      if (save.events.length > 25000) save.events = save.events.slice(-25000);
    });
  }
  episodeCache.set(episode.id, after);
}

function toggleItem(itemId) {
  const before = getState().items[itemId];
  if (!before) return;
  const completed = before.status !== "completed";
  update(save => {
    const item = save.items[itemId];
    item.status = completed ? "completed" : "backlog";
    if (completed) item.completedAt = new Date().toISOString();
    else delete item.completedAt;
  });
  emit(completed ? "ITEM_COMPLETED" : "ITEM_UNCOMPLETED", {
    itemId, wing: before.wing,
    meta: { title: before.title, from: before.status, to: completed ? "completed" : "backlog" }
  });
  refreshWing();
  toast(completed ? "RECORD ARCHIVED" : "RETURNED TO BACKLOG", before.title);
}

function rateItem(itemId, rating) {
  const item = getState().items[itemId];
  if (!item) return;
  const before = item.rating ?? null;
  const after = Number(rating);
  update(save => { save.items[itemId].rating = after; });
  emit(before == null ? "ITEM_RATED" : "RATING_CHANGED", {
    itemId, wing: item.wing, meta: { title: item.title, from: before, to: after }
  });
  refreshWing();
}

function editItemNote(itemId) {
  const item = getState().items[itemId];
  if (!item) return;
  openModal({
    title: `FIELD NOTE // ${item.title}`,
    body: `<textarea rows="8" data-stage3-note placeholder="Personal note..."></textarea>`,
    actions: [{
      label: "FILE NOTE", primary: true,
      handler(modal) {
        const before = getState().items[itemId].note || "";
        const after = modal.querySelector("[data-stage3-note]").value.trim();
        if (before !== after) {
          update(save => { save.items[itemId].note = after; });
          emit(before ? "NOTE_CHANGED" : "NOTE_ADDED", {
            itemId, wing: item.wing,
            meta: { title: item.title, from: before ? "NOTE" : "EMPTY", to: after ? "NOTE" : "EMPTY" }
          });
        }
        closeModal();
        refreshWing();
        toast("FIELD NOTE FILED", item.title);
      }
    }]
  });
  document.querySelector("[data-stage3-note]").value = item.note || "";
}

function handleClick(event) {
  const timelineFilter = event.target.closest("[data-timeline-filter]");
  if (timelineFilter) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setTimelineFilter(timelineFilter.dataset.timelineFilter, timelineFilter.dataset.timelineValue);
    showTimeMachine();
    return;
  }
  const card = event.target.closest("[data-item-id]");
  if (!card) return;
  const itemId = card.dataset.itemId;
  const rating = event.target.closest("[data-rating]")?.dataset.rating;
  if (rating) {
    event.preventDefault(); event.stopImmediatePropagation(); rateItem(itemId, rating);
  } else if (event.target.closest("[data-toggle-complete]")) {
    event.preventDefault(); event.stopImmediatePropagation(); toggleItem(itemId);
  } else if (event.target.closest("[data-note]")) {
    event.preventDefault(); event.stopImmediatePropagation(); editItemNote(itemId);
  }
}

function install() {
  if (installed) return true;
  const state = getState();
  if (!state || !document.querySelector("#view")) return false;
  installed = true;
  ensureTimelineStyles();
  if (!state.metadata.stage3) {
    update(save => {
      save.metadata.stage3 = {
        startedAt: new Date().toISOString(),
        timeMachineEnabled: true,
        truthRule: "canonical_events_only"
      };
    });
  }
  rememberEpisodes();
  on("EPISODE_UPDATED", canonicalizeEpisodeUpdate);
  document.addEventListener("click", handleClick, true);
  window.addEventListener("hashchange", () => setTimeout(showTimeMachine, 0));
  document.querySelector("#global-search").addEventListener("input", () => setTimeout(showTimeMachine, 0));
  showTimeMachine();
  return true;
}

function scheduleInstall(attempt = 0) {
  if (install() || attempt >= 200) return;
  setTimeout(() => scheduleInstall(attempt + 1), 25);
}

export function initStage3Runtime() {
  scheduleInstall();
}

setTimeout(() => scheduleInstall(), 0);
window.addEventListener("load", () => scheduleInstall(), { once: true });
