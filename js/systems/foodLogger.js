import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { customFoods, logFood, saveCustomFood } from "./foodTracker.js?v=20260913-food-v2";

/* Adding something to the log: search a food, scan a barcode, or type one in.
 *
 * Portions are entered in grams and the macros are derived from the per-100g
 * figures every source returns, so a portion can be corrected later without
 * looking the food up again.
 */

let chosen = null;

const macroLine = per => `${Math.round(per.kcal || 0)} kcal · P${per.protein ?? "?"} C${per.carbs ?? "?"} F${per.fat ?? "?"} per 100g`;

function resultRow(food) {
  return `<li><button data-pick='${esc(JSON.stringify(food))}'>
    <b>${esc(food.name)}</b>
    <span>${esc([food.brand, food.source].filter(Boolean).join(" · "))}</span>
    <small>${esc(macroLine(food.per100g || {}))}</small>
  </button></li>`;
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

export function openFoodLogger({ meal = "snack", date, mode = "search", prefill = "", grams = 100, onDone = () => {} } = {}) {
  chosen = null;
  const body = `
    <div class="food-logger">
      <div class="logger-tabs">
        <button class="pill" data-logger-tab="search">search</button>
        <button class="pill" data-logger-tab="barcode">barcode</button>
        <button class="pill" data-logger-tab="custom">type it in</button>
      </div>

      <div data-logger-panel="search">
        <form data-logger-search><input name="q" placeholder="chicken breast, oat milk…" value="${esc(prefill)}" maxlength="80" autocomplete="off"><button type="submit">search</button></form>
        <ul class="logger-results" data-logger-results></ul>
      </div>

      <div data-logger-panel="barcode" hidden>
        <form data-logger-barcode><input name="code" placeholder="scan or type the digits" inputmode="numeric" maxlength="20" autocomplete="off"><button type="submit">look up</button></form>
        <ul class="logger-results" data-logger-barcode-results></ul>
      </div>

      <div data-logger-panel="custom" hidden>
        <label class="field"><span>NAME</span><input data-custom="name" maxlength="90" value="${esc(prefill)}"></label>
        <div class="custom-grid">
          <label class="field"><span>KCAL /100g</span><input data-custom="kcal" type="number" min="0" step="1"></label>
          <label class="field"><span>PROTEIN</span><input data-custom="protein" type="number" min="0" step="0.1"></label>
          <label class="field"><span>CARBS</span><input data-custom="carbs" type="number" min="0" step="0.1"></label>
          <label class="field"><span>FAT</span><input data-custom="fat" type="number" min="0" step="0.1"></label>
        </div>
        <button class="pill" data-custom-save>use this</button>
      </div>

      <div class="logger-chosen" data-logger-chosen hidden></div>

      <div class="logger-portion">
        <label class="field"><span>GRAMS</span><input data-logger-grams type="number" min="1" step="1" value="${grams}"></label>
        <label class="field"><span>MEAL</span><select data-logger-meal>
          ${["breakfast", "lunch", "dinner", "snack"].map(name =>
            `<option value="${name}"${name === meal ? " selected" : ""}>${name}</option>`).join("")}
        </select></label>
      </div>
    </div>`;

  openModal({
    title: "ADD TO THE LOG",
    body,
    actions: [{
      label: "ADD", primary: true, handler: () => {
        const grams = Number(document.querySelector("[data-logger-grams]")?.value) || 0;
        const meal = document.querySelector("[data-logger-meal]")?.value || "snack";
        if (!chosen) return toast("PICK A FOOD FIRST", "Search for one, scan it, or type it in.");
        if (!grams) return toast("HOW MUCH?", "Enter the weight in grams.");
        const entry = logFood({ food: chosen, grams, meal, date });
        closeModal();
        onDone();
        toast("LOGGED", `${entry.name} · ${entry.kcal} kcal`);
      }
    }]
  });

  const root = document.querySelector(".food-logger");
  if (!root) return;

  const show = name => root.querySelectorAll("[data-logger-panel]").forEach(panel => {
    panel.hidden = panel.dataset.loggerPanel !== name;
  });
  show(mode);

  const pick = food => {
    chosen = food;
    const box = root.querySelector("[data-logger-chosen]");
    box.hidden = false;
    box.innerHTML = `<b>${esc(food.name)}</b><span>${esc(macroLine(food.per100g || {}))}</span>`;
    if (food.servingGrams) {
      const input = root.querySelector("[data-logger-grams]");
      if (input && !input.dataset.touched) input.value = food.servingGrams;
    }
  };

  root.addEventListener("click", event => {
    const tab = event.target.closest("[data-logger-tab]")?.dataset.loggerTab;
    if (tab) return show(tab);
    const picked = event.target.closest("[data-pick]");
    if (picked) { try { pick(JSON.parse(picked.dataset.pick)); } catch { /* malformed row */ } return; }
    if (event.target.closest("[data-custom-save]")) {
      const read = field => root.querySelector(`[data-custom="${field}"]`)?.value;
      const food = saveCustomFood({
        name: read("name"),
        per100g: { kcal: read("kcal"), protein: read("protein"), carbs: read("carbs"), fat: read("fat") },
      });
      if (!food) return toast("NAME NEEDED", "Give it a name first.");
      pick(food);
      toast("SAVED", `${food.name} is in your own foods now.`);
    }
  });

  root.querySelector("[data-logger-grams]")?.addEventListener("input", event => {
    event.target.dataset.touched = "1";
  });

  root.querySelector("[data-logger-search]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const list = root.querySelector("[data-logger-results]");
    const query = new FormData(event.target).get("q");
    list.innerHTML = `<li class="note">Searching…</li>`;
    const mine = customFoods().filter(food => String(food.name).toLowerCase().includes(String(query).toLowerCase()));
    const result = await ask("./__vault/food/search", "food-search", { query });
    const rows = [...mine, ...((result?.results) || [])];
    if (!rows.length) {
      list.innerHTML = result?.needsKey
        ? `<li class="note">The shared USDA key is rate limited. Add your own free key in Settings to search properly — barcodes and your own foods still work.</li>`
        : `<li class="note">Nothing found.</li>`;
      return;
    }
    list.innerHTML = rows.map(resultRow).join("");
  });

  root.querySelector("[data-logger-barcode]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const list = root.querySelector("[data-logger-barcode-results]");
    const code = new FormData(event.target).get("code");
    list.innerHTML = `<li class="note">Looking up…</li>`;
    const result = await ask("./__vault/food/barcode", "food-barcode", { code });
    if (!result?.food) { list.innerHTML = `<li class="note">No product with that barcode.</li>`; return; }
    list.innerHTML = resultRow(result.food);
    pick(result.food);
  });
}
