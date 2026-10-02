import { getState } from "../core/store.js";
import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import {
  MEALS, byMeal, customFoods, dayTotals, foodDay, foodGoals, foodStreak, frequentFoods,
  plateProgress, recentDays, waterFor, weightHistory,
} from "../systems/foodTracker.js?v=20260913-food-v2";
import { expiringSoon, pantryItems, vaultStickers } from "../systems/fridge.js?v=20260913-receipts-v2";

/* FOOD — the first room that does not look like the rest of the Vault.
 *
 * Warm paper instead of amber-on-black, photographs leading instead of text.
 * The archive's own two obsessions drive the contents: recipes from the
 * creators being watched, and South Dakota food.
 */

let curios = { cocktail: null, meal: null, fridge: null, started: false };
let viewDate = foodDay();
let redraw = () => {};

export const foodViewDate = () => viewDate;
export function setFoodDate(date) { viewDate = date; }
export function shiftFoodDate(days) {
  const date = new Date(viewDate + "T12:00:00");
  date.setDate(date.getDate() + days);
  const next = foodDay(date);
  // Never walk into the future; there is nothing to log there.
  viewDate = next > foodDay() ? foodDay() : next;
}

async function ask(path, name, payload) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": name },
      body: JSON.stringify(payload),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function rollFoodCurio(kind) {
  curios[kind] = null;
  redraw();
  curios[kind] = await ask("./__vault/food/curio", "food-curio", { kind });
  redraw();
}

export async function searchFridge(ingredient) {
  curios.fridge = { loading: true, ingredient };
  redraw();
  const result = await ask("./__vault/food/fridge", "food-fridge", { ingredient });
  curios.fridge = { ...(result || {}), ingredient };
  redraw();
}

export function ensureFoodWing(onChanged = () => {}) {
  redraw = onChanged;
  if (curios.started) return;
  curios.started = true;
  ask("./__vault/food/curio", "food-curio", { kind: "cocktail" }).then(d => { curios.cocktail = d; redraw(); });
  ask("./__vault/food/curio", "food-curio", { kind: "meal" }).then(d => { curios.meal = d; redraw(); });
}

const dish = (label, body, extra = "") => `<article class="dish-card">
  <header><h3>${esc(label)}</h3>${extra ? `<span>${esc(extra)}</span>` : ""}</header>
  ${body}
</article>`;

/* ---------- the tracker ---------- */

function ring(totals, goals) {
  const share = Math.min(1.4, goals.kcal ? totals.kcal / goals.kcal : 0);
  const over = totals.kcal > goals.kcal;
  return `<div class="kcal-ring${over ? " is-over" : ""}" style="--share:${(Math.min(1, share) * 100).toFixed(1)}%">
    <b>${totals.kcal.toLocaleString()}</b>
    <span>of ${goals.kcal.toLocaleString()} kcal</span>
    <small>${over ? `${(totals.kcal - goals.kcal).toLocaleString()} over` : `${(goals.kcal - totals.kcal).toLocaleString()} left`}</small>
  </div>`;
}

const macroBar = (label, value, goal, tone) => `<li class="macro ${tone}">
  <span>${esc(label)}</span>
  <i style="--fill:${goal ? Math.min(100, (value / goal) * 100).toFixed(1) : 0}%"></i>
  <b>${value}<em>/${goal}g</em></b>
</li>`;

function renderTracker() {
  const state = getState();
  const totals = dayTotals(viewDate, state);
  const goals = foodGoals(state);
  const meals = byMeal(viewDate, state);
  const water = waterFor(viewDate, state);
  const isToday = viewDate === foodDay();
  const pretty = new Date(viewDate + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const mealRows = MEALS.map(meal => {
    const rows = meals[meal] || [];
    const sum = rows.reduce((total, entry) => total + (Number(entry.kcal) || 0), 0);
    return `<section class="meal-block">
      <header><h4>${esc(meal)}</h4><span>${sum ? `${sum} kcal` : ""}</span>
        <button class="pill" data-food-add="${esc(meal)}">+ add</button></header>
      ${rows.length ? `<ul>${rows.map(entry => `<li>
        <b>${esc(entry.name)}</b>
        <span>${entry.grams}g · ${entry.kcal} kcal · P${entry.protein} C${entry.carbs} F${entry.fat}</span>
        <button data-food-remove="${esc(entry.id)}" title="Remove">×</button>
      </li>`).join("")}</ul>` : `<p class="empty">nothing yet</p>`}
    </section>`;
  }).join("");

  return `<section class="tracker">
    <header class="tracker-head">
      <div class="day-nav">
        <button data-food-day="-1" aria-label="Previous day">‹</button>
        <b>${esc(isToday ? "Today" : pretty)}</b>
        <button data-food-day="1" ${isToday ? "disabled" : ""} aria-label="Next day">›</button>
      </div>
      <div class="tracker-tools">
        <button class="pill" data-food-goals>goals</button>
        <button class="pill" data-food-weight>weigh in</button>
      </div>
    </header>

    <div class="tracker-top">
      ${ring(totals, goals)}
      <ul class="macros">
        ${macroBar("protein", totals.protein, goals.protein, "p")}
        ${macroBar("carbs", totals.carbs, goals.carbs, "c")}
        ${macroBar("fat", totals.fat, goals.fat, "f")}
      </ul>
      <div class="water">
        <span>water</span>
        <b>${(water / 1000).toFixed(1)}L</b>
        <small>of ${(goals.water / 1000).toFixed(1)}L</small>
        <div class="water-buttons">
          <button data-food-water="250">+250ml</button>
          <button data-food-water="500">+500ml</button>
          ${water ? `<button data-food-water="-250">−250</button>` : ""}
        </div>
      </div>
    </div>

    <div class="meals">${mealRows}</div>
  </section>`;
}

function renderWeek() {
  const days = recentDays(7);
  const goals = foodGoals();
  const peak = Math.max(goals.kcal, ...days.map(day => day.kcal), 1);
  const bars = days.map(day => {
    const label = new Date(day.date + "T12:00:00").toLocaleDateString([], { weekday: "narrow" });
    return `<li${day.date === viewDate ? ' class="on"' : ""}>
      <i style="--h:${((day.kcal / peak) * 100).toFixed(1)}%" title="${day.kcal} kcal"></i>
      <span>${esc(label)}</span>
    </li>`;
  }).join("");
  const streak = foodStreak();
  const weights = weightHistory();
  const latest = weights[weights.length - 1];
  return dish("THIS WEEK", `
    <ul class="week-bars" style="--goal:${((goals.kcal / peak) * 100).toFixed(1)}%">${bars}</ul>
    <p class="dish-note">${streak ? `${streak} day${streak === 1 ? "" : "s"} logged in a row` : "No days logged yet"}${
      latest ? ` · last weigh-in ${latest.value}${esc(latest.unit)}` : ""}</p>`);
}

/* ---------- the four cards ---------- */

/* Dishes that belong to something in the archive. The 18 records already here
 * are creator recipes and South Dakota food, so this looks for the show or
 * creator a dish came from rather than inventing a pairing. */
function renderEatTheShow() {
  const state = getState();
  const recent = Object.values(state.items || {})
    .filter(item => (item.wing === "tv" || item.wing === "movies") && item.status === "in_progress" && item.title)
    .slice(0, 6);
  const foods = Object.values(state.items || {}).filter(item => item.wing === "food");

  // A food record naming a show or creator you watch is the pairing; nothing is
  // invented when there is no match.
  const pairs = [];
  for (const food of foods) {
    const text = `${food.title} ${food.description || ""}`.toLowerCase();
    const match = recent.find(item => text.includes(String(item.title).toLowerCase().slice(0, 18)));
    if (match) pairs.push({ food, match });
  }
  const body = pairs.length
    ? `<ul class="dish-list">${pairs.slice(0, 4).map(pair => `<li>
        <b>${esc(pair.food.title)}</b><span>from ${esc(pair.match.title)}</span></li>`).join("")}</ul>`
    : `<ul class="dish-list">${foods.slice(0, 4).map(food => `<li>
        <b>${esc(food.title)}</b><span>${esc(food.description || "")}</span></li>`).join("")}</ul>
       <p class="dish-note">Nothing you're part-way through has a dish on file yet.</p>`;
  return dish("EAT THE SHOW", body, `${foods.length} on file`);
}

function renderPlate() {
  const dishes = plateProgress();
  const eaten = dishes.filter(entry => entry.eatenOn).length;
  const list = dishes.map(entry => `<li class="${entry.eatenOn ? "done" : ""}">
    <button data-plate-toggle="${esc(entry.id)}" aria-pressed="${entry.eatenOn ? "true" : "false"}">
      <b>${esc(entry.name)}</b><span>${esc(entry.eatenOn ? `eaten ${entry.eatenOn}` : entry.note)}</span>
    </button></li>`).join("");
  return dish("THE SOUTH DAKOTA PLATE", `<ul class="plate-list">${list}</ul>`,
    `${eaten}/${dishes.length}`);
}

/* The card is the fridge door: enamel, a chrome handle, and stickers from the
 * archive plastered over it. The stickers are real artwork off the shelves —
 * the shows, games and comics actually being watched and read. */
function renderFridge() {
  const stock = pantryItems();
  const soon = expiringSoon(3);
  const stickers = vaultStickers(getState(), 26);

  const decals = stickers.map(sticker =>
    // background-image is set here rather than through a custom property: a
    // url() inside a variable resolves against the stylesheet that *uses* it,
    // so every relative artwork path would be looked for under /css/.
    `<i class="decal ${sticker.shape}" title="${esc(sticker.title)}"
      style="left:${sticker.left}%;top:${sticker.top}%;width:${sticker.size}px;height:${sticker.size}px;
             z-index:${sticker.depth};transform:rotate(${sticker.rotate}deg);
             background-image:url('${esc(sticker.art)}')"></i>`).join("");

  const note = stock.length
    ? `<b class="note-count">${stock.length}</b>
       <span>item${stock.length === 1 ? "" : "s"} in the house</span>
       ${soon.length ? `<em class="note-warn">${soon.length} to use within 3 days</em>` : `<em>nothing about to turn</em>`}`
    : `<b class="note-empty">empty</b><span>add a grocery order and the Vault will keep track</span>`;

  return `<article class="dish-card fridge-door">
    <div class="door-face">
      ${decals}
      <div class="door-handle" aria-hidden="true"></div>
      <div class="door-note">
        <span class="note-pin" aria-hidden="true"></span>
        ${note}
        <button class="pill solid" data-open-fridge>open the fridge</button>
      </div>
    </div>
  </article>`;
}

function renderCookedIt() {
  const frequent = frequentFoods(getState(), 6);
  return dish("COOKED IT", `
    <p class="dish-note">Log what you made. It counts toward today and the journal.</p>
    <div class="card-actions">
      <button class="pill solid" data-food-add="dinner">log a meal</button>
      <button class="pill" data-food-scan>scan a barcode</button>
    </div>
    ${frequent.length ? `<ul class="again-list">${frequent.map(item => `<li>
      <button data-food-again="${esc(item.food.name)}" data-grams="${item.grams}">
        <b>${esc(item.food.name)}</b><span>${item.grams}g · ${item.count}×</span></button></li>`).join("")}</ul>` : ""}`);
}

function curioCard(label, data, kind, extra) {
  if (!data) return dish(label, `<p class="dish-note">Looking…</p>`);
  const list = (data.ingredients || []).slice(0, 10).map(line => `<li>${esc(line)}</li>`).join("");
  return `<article class="dish-card has-photo">
    <header><h3>${esc(label)}</h3><span>${esc(extra(data))}</span></header>
    ${data.image ? `<img class="dish-photo" src="${esc(data.image)}" alt="${esc(data.title)}" loading="lazy">` : ""}
    <b class="dish-title">${esc(data.title)}</b>
    ${list ? `<ul class="ingredients">${list}</ul>` : ""}
    <p class="dish-method">${esc(data.method || "")}</p>
    <button class="pill" data-food-roll="${esc(kind)}">another</button>
  </article>`;
}

export function renderFoodWing() {
  const content = `<div class="food-room">
    <header class="food-banner">
      <h2>THE KITCHEN</h2>
      <p>What you ate, what to make, and the things a Redfield man is obliged to eat.</p>
    </header>

    ${renderTracker()}

    <section class="dish-grid">
      ${renderWeek()}
      ${renderCookedIt()}
      ${renderEatTheShow()}
      ${renderPlate()}
      ${renderFridge()}
      ${curioCard("A DRINK", curios.cocktail, "cocktail", data => [data.category, data.glass].filter(Boolean).join(" · "))}
      ${curioCard("SOMETHING TO COOK", curios.meal, "meal", data => [data.area, data.category].filter(Boolean).join(" · "))}
    </section>
  </div>`;

  return renderAtomicWingShell({
    active: "food",
    title: "THE KITCHEN",
    section: "FOOD",
    content,
    footer: "FOOD // KITCHEN",
  });
}
