import { getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";
import { foodDay } from "./foodTracker.js?v=20260913-food-v2";

/* What is actually in the house.
 *
 * Everything that arrives is logged with an estimated best-by, and stays on the
 * list until it is used or thrown out. Nothing is ever deleted outright: what
 * gets binned is the more useful half of the record, because it says what keeps
 * being over-bought.
 */

export const LOCATIONS = ["fridge", "freezer", "pantry"];

const pantryOf = (state = getState()) => state.metadata?.food?.pantry || [];

function withPantry(mutator) {
  update(save => {
    save.metadata.food ||= {};
    save.metadata.food.pantry ||= [];
    mutator(save.metadata.food);
  });
}

export function pantryItems(state = getState()) {
  return pantryOf(state).filter(item => item.status === "in")
    .map(item => ({ ...item, daysLeft: daysUntil(item.bestBy) }))
    .sort((left, right) => (left.daysLeft ?? 999) - (right.daysLeft ?? 999));
}

export function pantryHistory(state = getState()) {
  return pantryOf(state).filter(item => item.status !== "in")
    .sort((left, right) => String(right.closedAt || "").localeCompare(String(left.closedAt || "")));
}

export function daysUntil(date) {
  if (!date) return null;
  const target = new Date(date + "T12:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function addPantryItems(items = []) {
  const added = [];
  withPantry(food => {
    for (const raw of items) {
      const name = String(raw?.name || "").trim().slice(0, 90);
      if (!name) continue;
      const entry = {
        id: createId("pantry"), name,
        quantity: Number(raw.quantity) || 1,
        unit: String(raw.unit || "count").slice(0, 20),
        category: String(raw.category || "other").slice(0, 20),
        location: LOCATIONS.includes(raw.location) ? raw.location : "fridge",
        bestBy: String(raw.bestBy || "").slice(0, 10),
        // Kept so that what gets binned can be counted in money, not just items.
        price: Number(raw.price) || 0,
        store: String(raw.store || "").slice(0, 60),
        addedAt: foodDay(),
        status: "in",
      };
      food.pantry.push(entry);
      added.push(entry);
    }
  });
  return added;
}

/* Used or binned. Both close the record; only one of them is a loss. */
export function closePantryItem(id, reason = "used") {
  withPantry(food => {
    const item = food.pantry.find(entry => entry.id === id);
    if (!item) return;
    item.status = reason === "binned" ? "binned" : "used";
    item.closedAt = new Date().toISOString();
  });
}

export function restorePantryItem(id) {
  withPantry(food => {
    const item = food.pantry.find(entry => entry.id === id);
    if (item) { item.status = "in"; delete item.closedAt; }
  });
}

export function expiringSoon(withinDays = 3, state = getState()) {
  return pantryItems(state).filter(item => item.daysLeft !== null && item.daysLeft <= withinDays);
}

export function pantryStats(state = getState()) {
  const all = pantryOf(state);
  const binned = all.filter(item => item.status === "binned");
  const used = all.filter(item => item.status === "used");
  const counts = new Map();
  for (const item of binned) {
    const key = item.name.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeatWaste = [...counts.entries()].filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1]).slice(0, 5);
  return {
    inStock: all.filter(item => item.status === "in").length,
    used: used.length, binned: binned.length,
    wasteRate: used.length + binned.length ? Math.round((binned.length / (used.length + binned.length)) * 100) : 0,
    repeatWaste,
  };
}

/* Artwork lives as either a bare path or a record with a local copy in it. */
const artOf = item => (typeof item.artwork === "string"
  ? item.artwork
  : item.artwork?.localPath || item.artwork?.url || "");

const STICKER_WINGS = ["tv", "games", "manga", "books"];

/* Stickers for the fridge door, taken from the archive rather than invented.
 *
 * Weighted towards things actually engaged with — favourites, part-finished,
 * anything watched — so the door ends up covered in what this person is
 * actually into. Seeded by the day so it stays put while you look at it and is
 * different tomorrow.
 */
export function vaultStickers(state = getState(), count = 26) {
  const pool = [];
  for (const item of Object.values(state.items || {})) {
    if (!STICKER_WINGS.includes(item.wing) || !item.title) continue;
    const art = artOf(item);
    if (!art) continue;
    let weight = 1;
    if (item.status === "in_progress") weight += 6;
    if (item.favorite) weight += 5;
    if (item.status === "completed") weight += 2;
    if (Object.values(item.episodes || {}).some(episode => episode.status === "completed")) weight += 4;
    pool.push({ title: item.title, art, wing: item.wing, weight });
  }
  if (!pool.length) return [];
  pool.sort((left, right) => right.weight - left.weight || left.title.localeCompare(right.title));

  // Spread across the wings so one big shelf does not cover the whole door —
  // but never leave the door half bare because a wing has no artwork, so a
  // second pass fills from whatever is left.
  const perWing = new Map();
  const picked = [];
  const seed = Number(foodDay().replaceAll("-", ""));
  const cap = Math.ceil(count / 2);
  for (const entry of pool) {
    const used = perWing.get(entry.wing) || 0;
    if (used >= cap) continue;
    perWing.set(entry.wing, used + 1);
    picked.push(entry);
    if (picked.length >= count * 3) break;
  }
  if (picked.length < count * 3) {
    const taken = new Set(picked);
    for (const entry of pool) {
      if (taken.has(entry)) continue;
      picked.push(entry);
      if (picked.length >= count * 3) break;
    }
  }
  // Rotate the window by the day so the same few are not always on top.
  const start = picked.length ? seed % picked.length : 0;
  const chosen = [...picked.slice(start), ...picked.slice(0, start)].slice(0, count);

  /* Laid out the way stickers actually end up on a bottle: packed edge to edge,
   * overlapping, at every angle, in a range of sizes — not spaced politely
   * around a tidy margin. A jittered grid gives coverage without leaving the
   * bare patches that pure randomness always produces. */
  const columns = 6;
  const rows = Math.ceil(count / columns);
  return chosen.map((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const wobble = (offset, range) => (((seed + index * 977 + offset) % (range * 2)) - range);
    return {
      ...entry,
      left: Math.round((column / columns) * 100 + wobble(11, 9) - 4),
      top: Math.round((row / rows) * 100 + wobble(29, 10) - 4),
      size: 52 + ((seed + index * 53) % 38),
      rotate: wobble(7, 23),
      depth: (seed + index * 17) % 12,
      shape: (seed + index) % 5 === 0 ? "round" : "square",
    };
  });
}

/* The search terms to send when asking what can be cooked. Quantities, units and
 * packaging words are noise to a recipe index. */
export function pantrySearchTerms(state = getState()) {
  const stop = /\b(fresh|frozen|organic|large|small|boneless|skinless|whole|sliced|shredded|block|bag|box|can|jar|pack|ct|oz|lb|gal)\b/g;
  const seen = new Set();
  const terms = [];
  for (const item of pantryItems(state)) {
    const clean = item.name.toLowerCase().replace(stop, " ").replace(/\d+[\d/.]*/g, " ").replace(/\s+/g, " ").trim();
    if (clean && !seen.has(clean)) { seen.add(clean); terms.push(clean); }
  }
  return terms.slice(0, 14);
}
