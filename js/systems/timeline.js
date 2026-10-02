import { getState } from "../core/store.js";

const filters = { range: "all", signal: "meaningful" };
const passiveTypes = new Set(["VAULT_OPENED", "WING_VISITED"]);
const labels = {
  VAULT_OPENED: ["⌂", "Vault opened"],
  WING_VISITED: ["→", "Wing entered"],
  ITEM_COMPLETED: ["✓", "Archived"],
  ITEM_UNCOMPLETED: ["↺", "Returned to backlog"],
  ITEM_RATED: ["◆", "Rated"],
  RATING_CHANGED: ["◆", "Rating changed"],
  NOTE_ADDED: ["✎", "Field note added"],
  NOTE_CHANGED: ["✎", "Field note changed"],
  EPISODE_COMPLETED: ["▤", "Episode watched"],
  EPISODE_UNCOMPLETED: ["↺", "Episode returned to backlog"],
  EPISODE_RATED: ["◆", "Episode rated"],
  EPISODE_RATING_CHANGED: ["◆", "Episode rating changed"],
  EPISODE_NOTE_CHANGED: ["✎", "Episode note changed"],
  EPISODE_REWATCHED: ["⟳", "Episode rewatch count changed"],
  ITEM_METADATA_CHANGED: ["⚒", "Metadata edited"],
  ITEM_METADATA_UNDONE: ["↶", "Metadata edit undone"],
  RECOVERY_REVIEW_DECIDED: ["⌘", "Recovery decision"],
  RECOVERY_REVIEW_BATCHED: ["⌘", "Recovery batch"],
  REPAIR_APPLIED: ["+", "Protected repair applied"],
  REPAIR_ROLLED_BACK: ["↶", "Protected repair rolled back"],
  LIBRARY_SCAN_COMPLETED: ["◉", "Library Sentinel scan"],
  ANCIENT_BACKLOG_COMPLETED: ["⌛", "Ancient backlog recovered"],
  SHOW_SEALED: ["■", "Series file sealed"],
  ACHIEVEMENT_UNLOCKED: ["★", "Achievement unlocked"],
  VAULT_MOMENT_TRIGGERED: ["V", "Vault moment"]
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

function startOfRange(range, now = new Date()) {
  const date = new Date(now);
  if (range === "today") date.setHours(0, 0, 0, 0);
  else if (range === "week") date.setDate(date.getDate() - 7);
  else if (range === "month") date.setMonth(date.getMonth() - 1);
  else if (range === "year") date.setFullYear(date.getFullYear() - 1);
  else return null;
  return date;
}

function titleFor(event, state) {
  return event.meta?.title || state.items[event.itemId]?.title || event.itemId || event.type;
}

function detailFor(event) {
  const meta = event.meta || {};
  if (meta.from != null && meta.to != null) return `${meta.from || "NONE"} → ${meta.to || "NONE"}`;
  if (meta.action) return String(meta.action).replaceAll("_", " ");
  return "";
}

export function ensureTimelineStyles() {
  if (document.querySelector("link[data-timeline-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/timeline.css";
  link.dataset.timelineStyles = "";
  document.head.append(link);
}

export function setTimelineFilter(name, value) {
  if (name in filters) filters[name] = value;
}

export function getTimelineReport(search = "") {
  const state = getState();
  const query = search.trim().toLowerCase();
  const start = startOfRange(filters.range);
  const events = (state.events || [])
    .filter(event => !start || new Date(event.timestamp) >= start)
    .filter(event => filters.signal === "all" || !passiveTypes.has(event.type))
    .filter(event => !query || `${event.type} ${event.wing || ""} ${titleFor(event, state)} ${new Date(event.timestamp).toLocaleString()}`.toLowerCase().includes(query))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const days = new Set(events.map(event => new Date(event.timestamp).toLocaleDateString()));
  const wings = new Map();
  events.forEach(event => {
    if (event.wing) wings.set(event.wing, (wings.get(event.wing) || 0) + 1);
  });
  const mostActiveWing = [...wings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "NONE";
  const now = new Date();
  const onThisDay = (state.events || []).filter(event => {
    const date = new Date(event.timestamp);
    return date.getFullYear() < now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return { events, activeDays: days.size, mostActiveWing, onThisDay };
}

export function renderTimeMachine(search = "") {
  const state = getState();
  const report = getTimelineReport(search);
  const groups = new Map();
  for (const event of report.events) {
    const key = new Date(event.timestamp).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const eventRow = event => {
    const [icon, label] = labels[event.type] || ["•", event.type.replaceAll("_", " ")];
    const detail = detailFor(event);
    return `<article class="time-event"><i>${icon}</i><div><time>${new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
      <b>${esc(label)}</b><span>${esc(titleFor(event, state))}</span>${detail ? `<em>${esc(detail)}</em>` : ""}</div></article>`;
  };
  return `<section class="time-hero panel"><div><span class="eyebrow">STAGE 3 // CANONICAL HISTORY</span><h2>THE TIME MACHINE</h2>
    <p>Only events the reconstructed Vault actually witnessed appear here.</p></div><div class="time-clock">⌛</div></section>
    <div class="time-vitals"><div class="panel"><b>${report.events.length}</b><span>VISIBLE EVENTS</span></div><div class="panel"><b>${report.activeDays}</b><span>ACTIVE DAYS</span></div><div class="panel"><b>${esc(report.mostActiveWing.toUpperCase())}</b><span>MOST ACTIVE WING</span></div><div class="panel"><b>${report.onThisDay.length}</b><span>ON THIS DAY</span></div></div>
    <section class="panel time-controls"><div>
      ${["today", "week", "month", "year", "all"].map(value => `<button class="button ${filters.range === value ? "primary" : ""}" data-timeline-filter="range" data-timeline-value="${value}">${value.toUpperCase()}</button>`).join("")}
    </div><div>
      <button class="button ${filters.signal === "meaningful" ? "primary" : ""}" data-timeline-filter="signal" data-timeline-value="meaningful">MEANINGFUL</button>
      <button class="button ${filters.signal === "all" ? "primary" : ""}" data-timeline-filter="signal" data-timeline-value="all">ALL SIGNALS</button>
    </div></section>
    ${report.onThisDay.length ? `<section class="panel time-echo"><div class="panel__header"><h2>ARCHIVAL ECHO DETECTED</h2><span class="panel__code">ON THIS DAY</span></div>${report.onThisDay.slice(0, 10).map(eventRow).join("")}</section>` : ""}
    <div class="time-groups">${[...groups.entries()].map(([date, events]) => `<section class="panel time-day"><header><h3>${esc(date.toUpperCase())}</h3><span>${events.length} EVENT${events.length === 1 ? "" : "S"}</span></header>${events.map(eventRow).join("")}</section>`).join("") || `<div class="panel empty"><b>THE ARCHIVE HAS BEEN QUIET.</b>No truthful events match this view.</div>`}</div>`;
}
