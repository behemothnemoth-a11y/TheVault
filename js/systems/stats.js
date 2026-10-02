import { getState } from "../core/store.js";

export function getStats() {
  const state = getState();
  const items = Object.values(state.items);
  return {
    total: items.length,
    completed: items.filter(item => item.status === "completed").length,
    inProgress: items.filter(item => item.status === "in_progress").length,
    rated: items.filter(item => Number.isFinite(item.rating)).length,
    notes: items.filter(item => item.note).length,
    events: state.events.length,
    achievements: Object.keys(state.achievements).length
  };
}
