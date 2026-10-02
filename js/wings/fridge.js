import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import {
  LOCATIONS, addPantryItems, closePantryItem, expiringSoon, pantryHistory,
  pantryItems, pantrySearchTerms, pantryStats, restorePantryItem,
} from "../systems/fridge.js?v=20260913-receipts-v2";
import { fileReceipt, receiptSeen } from "../systems/household.js?v=20260913-receipts-v2";

/* WHAT'S IN THE FRIDGE — the full room rather than the card.
 *
 * Receipts come in by photo or paste. Food goes into the fridge with an
 * estimated best-by; everything else on the receipt is sorted and filed to the
 * household side instead of being dropped.
 */

export const KINDS = [
  { id: "food", label: "Food", goes: "into the fridge" },
  { id: "supplies", label: "Supplies", goes: "to household supplies" },
  { id: "medicine", label: "Medicine", goes: "to the medicine shelf" },
  { id: "other", label: "Everything else", goes: "to purchases" },
];

let state = { parsing: false, pending: [], receipt: null, dishes: null, suggesting: false, tab: "in", error: "" };
let redraw = () => {};

export function ensureFridge(onChanged = () => {}) { redraw = onChanged; }
export const fridgeState = () => state;
export function setFridgeTab(tab) { state.tab = tab; redraw(); }

async function ask(path, name, payload) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": name },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return { error: (await response.json().catch(() => ({}))).error || "failed" };
    return await response.json();
  } catch { return { error: "unreachable" }; }
}

export async function readGroceries({ text = "", image = "" }) {
  state.parsing = true; state.error = ""; redraw();
  const result = await ask("./__vault/fridge/parse", "fridge-parse", { text, image });
  state.parsing = false;
  if (result.error || !result.items?.length) {
    state.error = result.error === "ai_not_configured"
      ? "The Vault's AI is not configured, so it cannot read an order."
      : "Nothing readable in that.";
  } else {
    // Held for review rather than filed straight away: a misread quantity or a
    // mis-sorted item is much easier to fix before it is in the log than after.
    state.pending = result.items;
    state.receipt = {
      store: result.store || "", purchasedAt: result.purchasedAt || "",
      total: Number(result.total) || 0, fingerprint: result.fingerprint || "",
      duplicate: receiptSeen(result.fingerprint),
    };
  }
  redraw();
}

/* File the reviewed receipt: food into the fridge, the rest to the household.
 * The receipt itself is recorded once, which is what stops a second upload of
 * the same order from doubling everything. */
export function confirmPending(edited) {
  const rows = edited || state.pending;
  const receipt = state.receipt || {};
  const food = rows.filter(row => row.kind === "food")
    .map(row => ({ ...row, store: receipt.store }));
  const rest = rows.filter(row => row.kind !== "food");
  const added = addPantryItems(food);
  const filed = fileReceipt({ ...receipt, items: rest });
  state.pending = [];
  state.receipt = null;
  state.dishes = null;
  redraw();
  return { food: added.length, ...filed };
}

export function discardPending() { state.pending = []; state.receipt = null; redraw(); }

/* Read the review form back into state before anything redraws it. Moving one
 * row to another bucket re-renders the whole list, and without this every
 * unsaved correction in every other row would be thrown away. */
export function syncPending(root = document) {
  state.pending = state.pending.map((item, index) => {
    const read = field => root.querySelector(`[data-pending="${field}"][data-index="${index}"]`)?.value;
    const next = { ...item };
    const name = read("name");
    if (name !== undefined) next.name = name;
    const quantity = Number(read("quantity"));
    if (Number.isFinite(quantity) && quantity > 0) next.quantity = quantity;
    const price = Number(read("price"));
    if (Number.isFinite(price) && price >= 0) next.price = price;
    const kind = read("kind");
    if (kind) next.kind = kind;
    const location = read("location");
    if (location) next.location = location;
    return next;
  });
  return state.pending;
}

export function dropPending(index) {
  state.pending.splice(index, 1);
  if (!state.pending.length) state.receipt = null;
  redraw();
}

export async function suggestFromFridge() {
  const have = pantrySearchTerms();
  if (!have.length) { state.error = "Nothing in the fridge to cook with."; redraw(); return; }
  state.suggesting = true; state.error = ""; redraw();
  const result = await ask("./__vault/fridge/suggest", "fridge-suggest", { have });
  state.suggesting = false;
  state.dishes = result.dishes || [];
  redraw();
}

const freshness = days => {
  if (days === null) return { label: "no date", tone: "" };
  if (days < 0) return { label: `${Math.abs(days)}d past`, tone: "gone" };
  if (days === 0) return { label: "today", tone: "soon" };
  if (days <= 2) return { label: `${days}d left`, tone: "soon" };
  if (days <= 6) return { label: `${days}d left`, tone: "ok" };
  return { label: `${days}d left`, tone: "good" };
};

function renderIntake() {
  if (state.pending.length) {
    const receipt = state.receipt || {};
    const money = value => `$${(Number(value) || 0).toFixed(2)}`;
    const row = (item, index) => `<li>
      <input data-pending="name" data-index="${index}" value="${esc(item.name)}" maxlength="90">
      <input data-pending="quantity" data-index="${index}" type="number" min="0" step="0.5" value="${item.quantity}" title="quantity">
      <input data-pending="price" data-index="${index}" type="number" min="0" step="0.01" value="${Number(item.price || 0).toFixed(2)}" title="price">
      <select data-pending="kind" data-index="${index}" title="where this goes">
        ${KINDS.map(kind => `<option value="${kind.id}"${kind.id === item.kind ? " selected" : ""}>${esc(kind.label)}</option>`).join("")}
      </select>
      ${item.kind === "food" ? `<select data-pending="location" data-index="${index}" title="kept in">
        ${LOCATIONS.map(place => `<option value="${place}"${place === item.location ? " selected" : ""}>${place}</option>`).join("")}
      </select>` : `<span class="best-by">no expiry</span>`}
      <button data-pending-drop="${index}" title="Not this">×</button>
    </li>`;

    // Grouped by where each item is going, keeping each row's index into
    // state.pending so edits and drops still land on the right item.
    const buckets = KINDS.map(kind => {
      const members = state.pending.map((item, index) => ({ item, index })).filter(entry => entry.item.kind === kind.id);
      if (!members.length) return "";
      const spend = members.reduce((sum, entry) => sum + (Number(entry.item.price) || 0), 0);
      return `<section class="bucket bucket-${kind.id}">
        <h4>${esc(kind.label)} <span>${members.length} · ${money(spend)} · goes ${esc(kind.goes)}</span></h4>
        <ul class="pending-list">${members.map(entry => row(entry.item, entry.index)).join("")}</ul>
      </section>`;
    }).join("");

    return `<section class="intake reviewing">
      <header>
        <h3>${esc(receipt.store || "Receipt")}${receipt.purchasedAt ? ` · ${esc(receipt.purchasedAt)}` : ""}${receipt.total ? ` · ${money(receipt.total)}` : ""}</h3>
        <p>${state.pending.length} lines read and sorted. Change anything that landed in the wrong place — best-by dates are estimates.</p>
      </header>
      ${receipt.duplicate ? `<p class="intake-warning">This receipt looks like one you have already filed. Adding it again will double everything on it.</p>` : ""}
      ${buckets}
      <div class="intake-actions">
        <button class="pill solid" data-pending-confirm>${receipt.duplicate ? "file it again anyway" : "file everything"}</button>
        <button class="pill" data-pending-discard>discard</button>
      </div>
    </section>`;
  }
  return `<section class="intake">
    <header><h3>Add a grocery order</h3><p>Photograph the receipt, paste the order, or type a list.</p></header>
    <div class="intake-ways">
      <label class="drop-zone">
        <input type="file" accept="image/*" data-fridge-image hidden>
        <b>📷 photo of a receipt or order</b>
        <span>${state.parsing ? "reading…" : "tap to choose an image"}</span>
      </label>
      <form class="paste-form" data-fridge-text>
        <textarea name="text" rows="4" placeholder="or paste the order / type a list, one per line"></textarea>
        <button type="submit" class="pill solid" ${state.parsing ? "disabled" : ""}>${state.parsing ? "reading…" : "read it"}</button>
      </form>
    </div>
    ${state.error ? `<p class="intake-error">${esc(state.error)}</p>` : ""}
  </section>`;
}

function renderContents() {
  const items = pantryItems();
  if (!items.length) return `<p class="empty-note">Nothing logged yet. Add an order above.</p>`;
  const groups = LOCATIONS.map(place => {
    const rows = items.filter(item => item.location === place);
    if (!rows.length) return "";
    return `<section class="place">
      <h4>${place} <span>${rows.length}</span></h4>
      <ul class="stock-list">${rows.map(item => {
        const state_ = freshness(item.daysLeft);
        return `<li class="${state_.tone}">
          <b>${esc(item.name)}</b>
          <span>${item.quantity} ${esc(item.unit)}</span>
          <i class="tag ${state_.tone}">${esc(state_.label)}</i>
          <div class="row-actions">
            <button data-pantry-used="${esc(item.id)}">used</button>
            <button data-pantry-binned="${esc(item.id)}" title="Threw it out">binned</button>
          </div>
        </li>`;
      }).join("")}</ul>
    </section>`;
  }).join("");
  return groups;
}

function renderUseItUp() {
  const soon = expiringSoon(3);
  if (!soon.length) return "";
  return `<section class="use-it-up">
    <h3>Use these first</h3>
    <ul>${soon.map(item => `<li><b>${esc(item.name)}</b>
      <span>${item.daysLeft < 0 ? `${Math.abs(item.daysLeft)} days past` : item.daysLeft === 0 ? "today" : `${item.daysLeft} days`}</span></li>`).join("")}</ul>
  </section>`;
}

function renderDishes() {
  if (state.suggesting) return `<p class="empty-note">Working out what you can make…</p>`;
  if (!state.dishes) return `<p class="empty-note">Ask what you can cook with what's in there.</p>`;
  if (!state.dishes.length) return `<p class="empty-note">Nothing matched. Try adding a few staples.</p>`;
  return `<ul class="dish-results">${state.dishes.map(dish => `<li>
    ${dish.image ? `<img src="${esc(dish.image)}" alt="${esc(dish.name)}" loading="lazy">` : ""}
    <div>
      <b>${esc(dish.name)}</b>
      <span class="uses">uses ${dish.uses.length} of yours: ${esc(dish.uses.join(", "))}</span>
      ${dish.missing?.length
        ? `<span class="missing">you'd still need: ${esc(dish.missing.slice(0, 6).join(", "))}</span>`
        : `<span class="have-all">you have everything</span>`}
    </div>
  </li>`).join("")}</ul>`;
}

function renderHistory() {
  const rows = pantryHistory().slice(0, 40);
  const stats = pantryStats();
  if (!rows.length) return `<p class="empty-note">Nothing used or binned yet.</p>`;
  return `<div class="history">
    <p class="waste-line">${stats.used} used · ${stats.binned} binned · <b>${stats.wasteRate}%</b> of what left the fridge was thrown out</p>
    ${stats.repeatWaste.length ? `<p class="waste-line quiet">Binned more than once: ${esc(stats.repeatWaste.map(([name, count]) => `${name} (${count})`).join(", "))}</p>` : ""}
    <ul class="history-list">${rows.map(item => `<li class="${item.status}">
      <b>${esc(item.name)}</b><span>${item.status}${item.closedAt ? ` · ${item.closedAt.slice(0, 10)}` : ""}</span>
      <button data-pantry-restore="${esc(item.id)}" title="Put it back">undo</button>
    </li>`).join("")}</ul>
  </div>`;
}

export function renderFridgeWing() {
  const stats = pantryStats();
  const tabs = [["in", `in the house (${stats.inStock})`], ["cook", "what can I make"], ["log", "history"]];
  const content = `<div class="food-room fridge-room">
    <header class="food-banner">
      <h2>THE FRIDGE</h2>
      <p>What's in the house, how long it has, and what it adds up to.</p>
    </header>

    ${renderIntake()}
    ${renderUseItUp()}

    <nav class="fridge-tabs">
      ${tabs.map(([id, label]) => `<button class="pill${state.tab === id ? " solid" : ""}" data-fridge-tab="${id}">${esc(label)}</button>`).join("")}
      ${state.tab === "cook" ? `<button class="pill" data-fridge-suggest>${state.suggesting ? "thinking…" : "suggest dishes"}</button>` : ""}
    </nav>

    <section class="fridge-body">
      ${state.tab === "in" ? renderContents() : state.tab === "cook" ? renderDishes() : renderHistory()}
    </section>
  </div>`;

  return renderAtomicWingShell({
    active: "food",
    title: "THE FRIDGE",
    section: "FOOD",
    content,
    footer: "FOOD // FRIDGE",
  });
}
