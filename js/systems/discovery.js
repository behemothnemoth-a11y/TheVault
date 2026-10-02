import { getState } from "../core/store.js";

const daysSince = date => Math.max(0, Math.floor((Date.now() - new Date(date)) / 86400000));

export function discover(mode = "vault") {
  const items = Object.values(getState().items);
  let pool = items.filter(item => item.status !== "completed");
  if (mode === "mercy") pool = pool.filter(item => !item.runtime || item.runtime <= 100);
  if (mode === "archaeology") pool.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
  if (!pool.length) pool = items;
  const item = mode === "archaeology" ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
  const reasons = [];
  const age = item.addedAt ? daysSince(item.addedAt) : 0;
  if (age > 365) reasons.push(`Untouched for ${age.toLocaleString()} days`);
  if (item.runtime && item.runtime <= 100) reasons.push(`Runtime: ${item.runtime} minutes`);
  if (item.rating >= 8) reasons.push("Your prior rating suggests unfinished business");
  if (item.status === "in_progress") reasons.push("You already opened this door");
  if (!reasons.length) reasons.push("The archive pulled this record from a dark shelf");
  return { item, reasons, mode };
}
