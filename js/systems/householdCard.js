import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { runningLow, spendSummary, supplies, supplyRhythm, wasteCost } from "./household.js?v=20260913-receipts-v2";

/* HOUSEHOLD — the first card on the Life Dashboard that is about life rather
 * than about the Vault. Everything on it comes off receipts: what is due to be
 * re-bought, what the last month cost, and what got thrown away. */

const money = value => `$${(Number(value) || 0).toFixed(2)}`;

function dueLine(row) {
  if (row.ranOut) return "out";
  if (row.daysLeft < 0) return `${Math.abs(row.daysLeft)}d overdue`;
  if (row.daysLeft === 0) return "due today";
  return `due in ${row.daysLeft}d`;
}

function lowList(state) {
  const low = runningLow(state, 7).slice(0, 6);
  const all = supplyRhythm(state);
  if (!all.length) {
    return `<p class="household-empty">No supplies yet. File a receipt and the paper towels, detergent and toothpaste on it land here — the Vault learns how often you re-buy each one.</p>`;
  }
  if (!low.length) {
    return `<p class="household-empty">Nothing due. Next up: <b>${esc(all[0].name)}</b>, ${esc(dueLine(all[0]))}.</p>`;
  }
  // The most recent unit of each thing is what "out" and "restocked" act on.
  const latest = row => row.items.slice().sort((a, b) => String(b.boughtOn).localeCompare(String(a.boughtOn)))[0];
  return `<ul class="household-low">${low.map(row => {
    const item = latest(row);
    return `<li class="${row.ranOut || row.daysLeft < 0 ? "is-late" : ""}">
      <b>${esc(row.name)}</b>
      <span>${esc(dueLine(row))} · ${row.learned ? `every ~${row.interval}d` : `usually ~${row.interval}d`}</span>
      ${row.ranOut
        ? `<button class="button" data-supply-restock="${esc(item.id)}">RESTOCKED</button>`
        : `<button class="button" data-supply-out="${esc(item.id)}">OUT</button>`}
    </li>`;
  }).join("")}</ul>`;
}

export function renderHouseholdCard(state = getState()) {
  const spend = spendSummary(state, 30);
  const waste = wasteCost(state, 30);
  const medicine = supplies(state).filter(item => item.kind === "medicine" && item.status === "in").length;
  const bucketLine = ["food", "supplies", "medicine", "other"]
    .filter(bucket => spend.byBucket[bucket])
    .map(bucket => `${bucket} ${money(spend.byBucket[bucket])}`).join(" · ");

  return `<section class="panel household-card">
    <div class="panel__header">
      <div><span class="eyebrow">LIFE // HOUSEHOLD</span><h2>WHAT THE HOUSE NEEDS</h2></div>
      <button class="button primary" data-open-household>ADD A RECEIPT</button>
    </div>
    <div class="household-grid">
      <article class="household-block household-due">
        <span class="eyebrow">RUNNING LOW</span>
        ${lowList(state)}
      </article>
      <article class="household-block">
        <span class="eyebrow">LAST 30 DAYS</span>
        <b class="household-figure">${money(spend.total)}</b>
        <small>across ${spend.receipts} receipt${spend.receipts === 1 ? "" : "s"}</small>
        ${bucketLine ? `<p class="household-note">${esc(bucketLine)}</p>` : ""}
        ${spend.stores.length ? `<p class="household-note">${spend.stores.map(([name, total]) => `${esc(name)} ${money(total)}`).join(" · ")}</p>` : ""}
      </article>
      <article class="household-block">
        <span class="eyebrow">THROWN OUT</span>
        <b class="household-figure${waste.cost ? " is-waste" : ""}">${money(waste.cost)}</b>
        <small>${waste.items} item${waste.items === 1 ? "" : "s"} binned from the fridge this month</small>
        ${waste.worst.length ? `<p class="household-note">Most often: ${waste.worst.map(row => `${esc(row.name)} (${row.times}×)`).join(", ")}</p>` : ""}
        ${medicine ? `<p class="household-note">${medicine} medicine item${medicine === 1 ? "" : "s"} on the shelf</p>` : ""}
      </article>
    </div>
  </section>`;
}
