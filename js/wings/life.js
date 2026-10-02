import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { renderHouseholdCard } from "../systems/householdCard.js?v=20260913-receipts-v2";
import { renderLifeDashboard } from "../systems/lifeDashboard.js?v=20261001-routing-repair-v1";

/* LIFE DASHBOARD — until now a reserved placeholder. Its first real card is the
 * household: the half of every receipt that is not food. Further cards join it
 * here as they are defined, rather than the room waiting for all of them. */

export function renderLifeRoom() {
  const content = `<div class="life-room">
    ${renderLifeDashboard()}
    <section class="panel life-household-section">
      <div class="panel__header"><div><span class="eyebrow">HOUSEHOLD</span><h2>HOME & SUPPLIES</h2></div><small>RECEIPTS + LOCAL STOCK</small></div>
      ${renderHouseholdCard()}
    </section>
  </div>`;

  return renderAtomicWingShell({
    active: "dashboard",
    title: "LIFE DASHBOARD",
    section: "LIFE",
    content,
    footer: "LIFE // HOUSEHOLD",
  });
}
