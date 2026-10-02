import { getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";
import { foodDay } from "./foodTracker.js?v=20260913-food-v2";

/* Everything on a receipt that is not food.
 *
 * Supplies behave unlike groceries: detergent does not go off, it runs out. So
 * there is no best-by here — the Vault learns how often each thing gets bought
 * and says when you are due. Medicine does expire and is kept apart because it
 * matters more than yoghurt does. Everything else is just a purchase record.
 */

// How long a thing lasts before it is normally re-bought, when there is not yet
// enough history to have learned the real interval.
const TYPICAL_DAYS = {
  paper: 21, cleaning: 45, laundry: 45, toiletries: 40, pet: 30, health: 180, other: 60,
};

const home = (state = getState()) => state.metadata?.home || {};

function withHome(mutator) {
  update(save => {
    save.metadata.home ||= {};
    const store = save.metadata.home;
    store.supplies ||= [];
    store.purchases ||= [];
    store.receipts ||= [];
    mutator(store);
  });
}

export const supplies = (state = getState()) => (home(state).supplies || []);
export const purchases = (state = getState()) => (home(state).purchases || []);
export const receipts = (state = getState()) => (home(state).receipts || []);

/* Has this exact order already been filed? */
export const receiptSeen = (fingerprint, state = getState()) =>
  Boolean(fingerprint) && receipts(state).some(entry => entry.fingerprint === fingerprint);

export function fileReceipt({ fingerprint, store, purchasedAt, total, items = [] }) {
  const filed = { supplies: 0, medicine: 0, other: 0 };
  withHome(shelf => {
    shelf.receipts = [...shelf.receipts, {
      id: createId("receipt"), fingerprint, store: String(store || "").slice(0, 60),
      purchasedAt: purchasedAt || foodDay(), total: Number(total) || 0,
      lines: items.length, filedAt: new Date().toISOString(),
    }].slice(-400);

    for (const raw of items) {
      const name = String(raw?.name || "").trim().slice(0, 90);
      if (!name) continue;
      const shared = {
        id: createId("home"), name,
        quantity: Number(raw.quantity) || 1,
        unit: String(raw.unit || "count").slice(0, 20),
        price: Number(raw.price) || 0,
        category: String(raw.category || "other").slice(0, 20),
        store: String(store || "").slice(0, 60),
        boughtOn: purchasedAt || foodDay(),
      };
      if (raw.kind === "supplies" || raw.kind === "medicine") {
        shelf.supplies.push({ ...shared, kind: raw.kind, status: "in" });
        filed[raw.kind] += 1;
      } else {
        shelf.purchases.push({ ...shared, kind: "other" });
        filed.other += 1;
      }
    }
  });
  return filed;
}

export function closeSupply(id) {
  withHome(shelf => {
    const item = shelf.supplies.find(entry => entry.id === id);
    if (item) { item.status = "out"; item.ranOutOn = foodDay(); }
  });
}

export function restockSupply(id) {
  withHome(shelf => {
    const item = shelf.supplies.find(entry => entry.id === id);
    if (item) { item.status = "in"; delete item.ranOutOn; }
  });
}

// Store brands say who sold it, not what it is. "GV paper towels" and "Great
// Value paper towels" are the same thing bought twice.
const STORE_BRANDS = /\b(gv|great value|equate|mainstays|parent'?s choice|member'?s mark|sam'?s choice|marketside|kirkland( signature)?|up ?& ?up|market pantry|good ?& ?gather|signature select|hy-?vee|kroger|simple truth)\b/g;

const normalise = name => String(name || "").toLowerCase()
  .replace(STORE_BRANDS, " ")
  .replace(/\b\d+([.,]\d+)?\s*(ct|count|pk|pack|packs|rl|roll|rolls|oz|fl oz|lb|lbs|kg|g|ml|l|gal|sheets?)\b/g, " ")
  .replace(/[^a-z ]+/g, " ")
  // Singular, so "6 rolls of towels" and "towel" land together.
  .split(/\s+/).filter(Boolean).map(word => (word.length > 3 && /[^s]s$/.test(word) ? word.slice(0, -1) : word))
  .join(" ").trim();

/* Two receipt lines are the same product if most of their words are shared.
 * Exact matching almost never fires in practice — no two receipts spell a
 * product the same way — and without it the re-buy interval is never learned. */
function sameProduct(left, right) {
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / new Set([...a, ...b]).size >= 0.5;
}

/* How often this gets bought, learned from the buying.
 *
 * Two purchases give a real interval; one falls back to what that kind of thing
 * usually lasts. Either way it is an estimate, and the interface says so. */
export function supplyRhythm(state = getState()) {
  const groups = new Map();
  const ordered = supplies(state).slice().sort((a, b) => String(a.boughtOn).localeCompare(String(b.boughtOn)));
  for (const item of ordered) {
    const normalised = normalise(item.name);
    if (!normalised) continue;
    // Join an existing group when it is recognisably the same product.
    let key = groups.has(normalised) ? normalised : null;
    if (!key) {
      for (const existing of groups.keys()) {
        if (sameProduct(existing, normalised)) { key = existing; break; }
      }
    }
    key ||= normalised;
    const group = groups.get(key) || { key, name: item.name, category: item.category, dates: [], items: [] };
    group.dates.push(item.boughtOn);
    group.items.push(item);
    group.name = item.name; // the most recent spelling reads best
    groups.set(key, group);
  }
  const today = new Date(foodDay() + "T12:00:00");
  return [...groups.values()].map(group => {
    const dates = [...new Set(group.dates)].sort();
    let interval = TYPICAL_DAYS[group.category] || TYPICAL_DAYS.other;
    let learned = false;
    if (dates.length >= 2) {
      const gaps = [];
      for (let index = 1; index < dates.length; index += 1) {
        const gap = Math.round(
          (new Date(dates[index] + "T12:00:00") - new Date(dates[index - 1] + "T12:00:00")) / 86400000);
        if (gap > 0) gaps.push(gap);
      }
      if (gaps.length) {
        interval = Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
        learned = true;
      }
    }
    const last = dates[dates.length - 1];
    const due = new Date(last + "T12:00:00");
    due.setDate(due.getDate() + interval);
    const daysLeft = Math.round((due - today) / 86400000);
    const ranOut = group.items.some(item => item.status === "out"
      && item.boughtOn === last);
    return {
      ...group, dates, interval, learned, lastBought: last,
      dueOn: foodDay(due), daysLeft, ranOut,
      times: dates.length,
      spend: group.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0),
    };
  }).sort((left, right) => left.daysLeft - right.daysLeft);
}

/* What you are out of, or about to be. */
export const runningLow = (state = getState(), withinDays = 5) =>
  supplyRhythm(state).filter(row => row.ranOut || row.daysLeft <= withinDays);

export function spendSummary(state = getState(), days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const cutoff = foodDay(since);
  // Food is filed to the fridge rather than here, but a spending figure that
  // left out the groceries would be the wrong number, so it is counted in.
  const food = (state.metadata?.food?.pantry || [])
    .filter(item => Number(item.price) > 0)
    .map(item => ({ ...item, boughtOn: item.addedAt, bucket: "food" }));
  const rows = [
    ...food,
    ...supplies(state).map(item => ({ ...item, bucket: item.kind })),
    ...purchases(state).map(item => ({ ...item, bucket: "other" })),
  ].filter(item => (item.boughtOn || "") >= cutoff);

  const byBucket = {};
  let total = 0;
  for (const item of rows) {
    const value = Number(item.price) || 0;
    byBucket[item.bucket] = (byBucket[item.bucket] || 0) + value;
    total += value;
  }
  const stores = {};
  for (const receipt of receipts(state)) {
    if (receipt.purchasedAt < cutoff) continue;
    stores[receipt.store || "unknown"] = (stores[receipt.store || "unknown"] || 0) + (Number(receipt.total) || 0);
  }
  for (const bucket of Object.keys(byBucket)) byBucket[bucket] = Math.round(byBucket[bucket] * 100) / 100;
  return {
    days, total: Math.round(total * 100) / 100, byBucket,
    stores: Object.entries(stores).sort((left, right) => right[1] - left[1]).slice(0, 5),
    receipts: receipts(state).filter(receipt => receipt.purchasedAt >= cutoff).length,
  };
}

/* What was thrown away, in money rather than item counts — which is the number
 * that actually changes what gets bought. */
export function wasteCost(state = getState(), days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const cutoff = since.toISOString();
  const binned = (state.metadata?.food?.pantry || [])
    .filter(item => item.status === "binned" && (item.closedAt || "") >= cutoff);
  const byName = new Map();
  let total = 0;
  for (const item of binned) {
    const value = Number(item.price) || 0;
    total += value;
    const key = normalise(item.name) || item.name;
    const seen = byName.get(key) || { name: item.name, times: 0, cost: 0 };
    seen.times += 1;
    seen.cost += value;
    byName.set(key, seen);
  }
  return {
    days, items: binned.length, cost: Math.round(total * 100) / 100,
    worst: [...byName.values()].sort((left, right) => right.times - left.times || right.cost - left.cost).slice(0, 3),
  };
}
