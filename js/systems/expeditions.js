import { expeditionDefinitions } from "../../data/expeditions.js";
import { getState, update } from "../core/store.js";

export function getExpeditions() {
  const state = getState();
  const custom = Object.values(state.metadata?.stage19?.definitions || {}).filter(definition => definition.status !== "archived");
  return [...expeditionDefinitions, ...custom].map(definition => {
    const raw = state.expeditions[definition.id] || {};
    const saved = { ...raw, status: raw.status || "available", startedAt: raw.startedAt || null };
    const objectives = definition.objectives.map(objective => {
      const matching = state.events.filter(event => event.type === objective.eventType && (!saved.startedAt || event.timestamp >= saved.startedAt));
      const count = objective.uniqueBy ? new Set(matching.map(event => event[objective.uniqueBy]).filter(Boolean)).size : matching.length;
      return { ...objective, count: Math.min(count, objective.target), done: count >= objective.target };
    });
    return { ...definition, ...saved, objectives, complete: objectives.every(objective => objective.done) };
  });
}

export function startExpedition(id) {
  update(save => {
    save.expeditions[id] = { status: "active", startedAt: new Date().toISOString() };
  });
}
