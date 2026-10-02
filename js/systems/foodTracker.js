import { getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";

/* The food log: what was eaten, when, and what it amounted to.
 *
 * Everything is stored per 100g and multiplied at read time, because that is the
 * one form every source agrees on — USDA, Open Food Facts and a hand-typed
 * custom food alike. Portions change, the underlying food does not.
 */

export const MEALS = ["breakfast", "lunch", "dinner", "snack"];
export const DEFAULT_GOALS = { kcal: 2200, protein: 150, carbs: 220, fat: 70, water: 2500 };

/* Local date, never toISOString() — that rolls over in the early evening and
 * would file an 8pm dinner under tomorrow. */
export const foodDay = (date = new Date()) => date.toLocaleDateString("en-CA");

export const foodState = (state = getState()) => state.metadata?.food || {};
export const foodGoals = (state = getState()) => ({ ...DEFAULT_GOALS, ...(foodState(state).goals || {}) });

function withFood(mutator) {
  update(save => {
    save.metadata.food ||= {};
    const food = save.metadata.food;
    food.log ||= [];
    food.customFoods ||= [];
    food.water ||= {};
    food.weight ||= [];
    food.plate ||= {};
    mutator(food);
  });
}

/* One logged portion. `grams` is what was eaten; the macros are computed from
 * the per-100g figures so a portion can be edited later without re-looking-up. */
export function logFood({ food, grams, meal = "snack", date = foodDay() }) {
  const amount = Math.max(1, Math.round(Number(grams) || 0));
  const per = food?.per100g || {};
  if (!food?.name || !amount) return null;
  const scale = amount / 100;
  const entry = {
    id: createId("meal"),
    date, meal: MEALS.includes(meal) ? meal : "snack",
    name: String(food.name).slice(0, 160),
    brand: String(food.brand || "").slice(0, 90),
    source: String(food.source || "custom").slice(0, 40),
    foodId: String(food.id || "").slice(0, 80),
    grams: amount,
    kcal: Math.round((Number(per.kcal) || 0) * scale),
    protein: Math.round((Number(per.protein) || 0) * scale * 10) / 10,
    carbs: Math.round((Number(per.carbs) || 0) * scale * 10) / 10,
    fat: Math.round((Number(per.fat) || 0) * scale * 10) / 10,
    per100g: { ...per },
    at: new Date().toISOString(),
  };
  withFood(food_ => { food_.log.push(entry); });
  return entry;
}

export function removeLogEntry(id) {
  withFood(food => { food.log = food.log.filter(entry => entry.id !== id); });
}

export function entriesFor(date = foodDay(), state = getState()) {
  return (foodState(state).log || []).filter(entry => entry.date === date);
}

export function dayTotals(date = foodDay(), state = getState()) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, entries: 0 };
  for (const entry of entriesFor(date, state)) {
    totals.kcal += Number(entry.kcal) || 0;
    totals.protein += Number(entry.protein) || 0;
    totals.carbs += Number(entry.carbs) || 0;
    totals.fat += Number(entry.fat) || 0;
    totals.entries += 1;
  }
  totals.protein = Math.round(totals.protein);
  totals.carbs = Math.round(totals.carbs);
  totals.fat = Math.round(totals.fat);
  return totals;
}

export function byMeal(date = foodDay(), state = getState()) {
  const grouped = Object.fromEntries(MEALS.map(meal => [meal, []]));
  for (const entry of entriesFor(date, state)) (grouped[entry.meal] ||= []).push(entry);
  return grouped;
}

export function setFoodGoals(goals) {
  withFood(food => {
    food.goals = { ...DEFAULT_GOALS, ...(food.goals || {}) };
    for (const [key, value] of Object.entries(goals || {})) {
      const number = Math.max(0, Math.round(Number(value) || 0));
      if (number) food.goals[key] = number;
    }
  });
}

export function addWater(millilitres, date = foodDay()) {
  withFood(food => {
    food.water[date] = Math.max(0, (Number(food.water[date]) || 0) + Number(millilitres || 0));
  });
}

export const waterFor = (date = foodDay(), state = getState()) => Number(foodState(state).water?.[date] || 0);

export function logWeight(value, unit = "lb", date = foodDay()) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return false;
  withFood(food => {
    food.weight = [...food.weight.filter(entry => entry.date !== date), { date, value: number, unit }]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-400);
  });
  return true;
}

export const weightHistory = (state = getState()) => foodState(state).weight || [];

export function saveCustomFood({ name, per100g, servingGrams = 0 }) {
  const clean = String(name || "").trim().slice(0, 160);
  if (!clean) return null;
  const food = {
    id: createId("food"), name: clean, source: "custom",
    per100g: {
      kcal: Number(per100g?.kcal) || 0, protein: Number(per100g?.protein) || 0,
      carbs: Number(per100g?.carbs) || 0, fat: Number(per100g?.fat) || 0,
    },
    servingGrams: Math.max(0, Math.round(Number(servingGrams) || 0)),
  };
  withFood(store => { store.customFoods.push(food); });
  return food;
}

export const customFoods = (state = getState()) => foodState(state).customFoods || [];

/* Foods logged before, most used first — the fastest way to add the same
 * breakfast for the fortieth time. */
export function frequentFoods(state = getState(), limit = 8) {
  const counts = new Map();
  for (const entry of foodState(state).log || []) {
    const key = entry.foodId || entry.name;
    const seen = counts.get(key) || { count: 0, entry };
    seen.count += 1;
    seen.entry = entry;
    counts.set(key, seen);
  }
  return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, limit)
    .map(({ entry, count }) => ({
      count,
      grams: entry.grams,
      food: { id: entry.foodId, name: entry.name, brand: entry.brand, source: entry.source, per100g: entry.per100g },
    }));
}

/* A run of days with anything logged, counted back from today. */
export function foodStreak(state = getState()) {
  const days = new Set((foodState(state).log || []).map(entry => entry.date));
  if (!days.size) return 0;
  const cursor = new Date();
  if (!days.has(foodDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(foodDay(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function recentDays(days = 7, state = getState()) {
  const out = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - back);
    const key = foodDay(date);
    out.push({ date: key, ...dayTotals(key, state), water: waterFor(key, state) });
  }
  return out;
}

/* The South Dakota list. These are dishes rather than records, so the checklist
 * lives in metadata and is matched to any food record sharing the name. */
export const SOUTH_DAKOTA_PLATE = [
  { id: "chislic", name: "Chislic", note: "The state nosh — cubed lamb on toothpicks." },
  { id: "kuchen", name: "Kuchen", note: "The state dessert. German-Russian custard." },
  { id: "frybread", name: "Indian tacos / frybread", note: "Best eaten at a powwow." },
  { id: "walldrug", name: "Wall Drug donuts", note: "With the five-cent coffee." },
  { id: "kampeska", name: "Kampeska BBQ", note: "Cookin' on Kampeska, Watertown." },
  { id: "fairfood", name: "State Fair fried everything", note: "Huron, early September." },
  { id: "pheasant", name: "Pheasant", note: "The state bird, and the state dinner." },
  { id: "walleye", name: "Walleye", note: "Fried, from a lake, ideally same day." },
];

export function plateProgress(state = getState()) {
  const marked = foodState(state).plate || {};
  return SOUTH_DAKOTA_PLATE.map(dish => ({ ...dish, eatenOn: marked[dish.id] || "" }));
}

export function markPlate(id, eaten = true) {
  withFood(food => {
    if (eaten) food.plate[id] = foodDay();
    else delete food.plate[id];
  });
}
