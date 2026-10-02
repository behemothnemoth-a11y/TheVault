import { createId } from "./ids.js";

const listeners = new Map();

export function on(type, callback) {
  const set = listeners.get(type) || new Set();
  set.add(callback);
  listeners.set(type, set);
  return () => set.delete(callback);
}

export function emit(type, detail = {}) {
  const event = {
    id: createId("evt"),
    type,
    timestamp: new Date().toISOString(),
    ...detail
  };
  for (const callback of listeners.get(type) || []) callback(event);
  for (const callback of listeners.get("*") || []) callback(event);
  return event;
}
