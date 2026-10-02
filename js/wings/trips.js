import { getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";
import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { closeModal, openModal } from "../ui/modals.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const meta = item => item?.tripMeta || {};
const prefs = () => getState().preferences.trips || {};
const statusLabel = value => ({ idea: "IDEA", upcoming: "UPCOMING", active: "IN PROGRESS", completed: "PAST TRIP", cancelled: "CANCELLED" }[value] || "IDEA");

export function ensureTripStyles() {
  if (document.querySelector("link[data-trip-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/trips.css?v=20260902-trips-v1";
  link.dataset.tripStyles = "";
  document.head.append(link);
  const recommendations = document.createElement("link");
  recommendations.rel = "stylesheet";
  recommendations.href = "./css/trips-recommendations.css?v=20260902-v1";
  recommendations.dataset.tripRecommendationStyles = "";
  document.head.append(recommendations);
  const controls=document.createElement("style");controls.dataset.tripControlStyles="";controls.textContent=".trip-card__controls{position:absolute;right:8px;top:8px;display:flex;gap:5px}.trip-card__controls .trip-card__remove,.trip-card__favorite{position:static;width:28px;height:28px;background:#17130d;border:1px solid #6b5430;color:#c59a48}.trip-card__favorite.on{color:#a9e45f;border-color:#668d3d;box-shadow:inset 0 0 12px rgba(85,145,41,.3)}";document.head.append(controls);
}

export function ensureTrips() {
  update(save => {
    save.preferences.trips ||= { status: "all", sort: "date" };
    save.metadata.trips ||= { version: 1, createdAt: new Date().toISOString() };
  });
}

export function setTripPreference(key, value) {
  update(save => { save.preferences.trips ||= {}; save.preferences.trips[key] = value; });
}

export function removeTrip(id) {
  update(save => { if (save.items[id]?.wing === "trips") delete save.items[id]; });
}

export function toggleTripFavorite(id){let favorite=false;update(save=>{const item=save.items[id];if(item?.wing!=="trips")return;item.favorite=!item.favorite;favorite=item.favorite;item.updatedAt=new Date().toISOString()});return favorite}

export function renderTripsShell(content, screen = "catalog") {
  return renderAtomicWingShell({ active: "trips", title: "TRAVEL ARCHIVE", section: screen === "detail" ? "TRIP FILE" : "JOURNEY BOARD", content: `<div class="vault-trips">${content}</div>`, footer: "TRIPS // PERSONAL JOURNEY ARCHIVE" });
}

function dateRange(item) {
  const data = meta(item), format = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "DATE OPEN";
  if (!data.startDate && !data.endDate) return "DATES NOT SET";
  return `${format(data.startDate)}${data.endDate && data.endDate !== data.startDate ? ` — ${format(data.endDate)}` : ""}`;
}

export function renderTripsWing(search = "") {
  const state = getState(), preference = prefs(), query = search.trim().toLowerCase(), status = preference.status || "all", sort = preference.sort || "date";
  const all = Object.values(state.items || {}).filter(item => item.wing === "trips" && item.tripMeta);
  let records = all.filter(item => status === "all" || (item.status || "idea") === status).filter(item => !query || `${item.title} ${meta(item).destination || ""} ${meta(item).companions || ""}`.toLowerCase().includes(query));
  records.sort((a, b) => sort === "title" ? String(a.title).localeCompare(String(b.title)) : sort === "recent" ? Date.parse(b.updatedAt || b.addedAt || 0) - Date.parse(a.updatedAt || a.addedAt || 0) : String(meta(a).startDate || "9999").localeCompare(String(meta(b).startDate || "9999")));
  const counts = value => all.filter(item => item.status === value).length;
  const pastEvidence = all.filter(item => item.status === "completed" && meta(item).actualTrip === true);
  const recommendations = pastEvidence.length ? (state.metadata.trips?.recommendations || []).filter(entry => !entry.dismissed) : [];
  const next = all.filter(item => ["upcoming", "active"].includes(item.status)).sort((a, b) => String(meta(a).startDate || "9999").localeCompare(String(meta(b).startDate || "9999")))[0];
  const cards = records.map(item => { const data = meta(item); return `<article class="trip-card"><button class="trip-card__open" data-open-trip="${esc(item.id)}"><span class="trip-card__stamp">${esc(data.countryCode || "✈")}</span><div><small>${esc(statusLabel(item.status))} // ${esc(dateRange(item))}</small><h3>${esc(item.title)}</h3><p>${esc(data.destination || "Destination not set")}</p><span>${esc([data.tripType,data.companions, data.transport].filter(Boolean).join(" · ") || "PERSONAL TRIP FILE")}</span></div><b>OPEN →</b></button><div class="trip-card__controls"><button class="trip-card__favorite ${item.favorite?"on":""}" data-trip-favorite="${esc(item.id)}" title="Favorite trip">★</button><button class="trip-card__remove" data-trip-remove="${esc(item.id)}" title="Remove trip">×</button></div></article>`; }).join("");
  return `<section class="trip-command panel"><div><span class="eyebrow">PERSONAL TRAVEL // MANUAL CONTROL</span><h2>JOURNEY BOARD</h2><p>Plan future travel, keep practical details together, and preserve completed trips without turning this into a crowded planner.</p></div><button class="button primary" data-trip-add>+ ADD TRIP</button></section>
    <section class="trip-vitals"><article><b>${all.length}</b><span>TRIP FILES</span></article><article><b>${counts("upcoming")}</b><span>UPCOMING</span></article><article><b>${counts("completed")}</b><span>PAST TRIPS</span></article><article class="ready"><b>${next ? esc(meta(next).startDate || "READY") : "READY"}</b><span>NEXT DEPARTURE</span></article></section>
    ${next ? `<button class="trip-next panel" data-open-trip="${esc(next.id)}"><span class="eyebrow">NEXT JOURNEY</span><h2>${esc(next.title)}</h2><p>${esc(meta(next).destination || "Destination not set")} · ${esc(dateRange(next))}</p><b>OPEN TRIP FILE →</b></button>` : ""}
    <section class="trip-tools panel"><div>${[["all","ALL"],["upcoming","UPCOMING"],["active","ACTIVE"],["idea","IDEAS"],["completed","PAST"]].map(([value,label]) => `<button class="button ${status === value ? "primary" : ""}" data-trip-filter="${value}">${label}</button>`).join("")}</div><label>SORT<select data-trip-sort><option value="date" ${sort === "date" ? "selected" : ""}>TRAVEL DATE</option><option value="recent" ${sort === "recent" ? "selected" : ""}>RECENTLY UPDATED</option><option value="title" ${sort === "title" ? "selected" : ""}>TITLE</option></select></label></section>
    <section class="trip-library panel"><header><div><span class="eyebrow">TRIP FILES // SCROLL TO BROWSE</span><h2>${status === "all" ? "ALL JOURNEYS" : statusLabel(status)}</h2></div><span>${records.length} MATCH${records.length === 1 ? "" : "ES"}</span></header><div class="trip-grid">${cards || `<div class="trip-empty"><b>NO TRIPS HERE YET.</b><p>Add an idea or upcoming journey when you are ready.</p><button class="button primary" data-trip-add>ADD FIRST TRIP</button></div>`}</div></section>
    <section class="trip-recommendations panel ${pastEvidence.length ? "ready" : "locked"}"><header><div><span class="eyebrow">TRAVEL RECOMMENDATIONS // PAST TRIPS ONLY</span><h2>WHERE TO GO NEXT</h2></div><b>${pastEvidence.length} VERIFIED PAST TRIP${pastEvidence.length === 1 ? "" : "S"}</b></header>${pastEvidence.length ? recommendations.length ? `<div class="trip-grid">${recommendations.map(entry => `<article class="trip-recommendation"><small>RECOMMENDED DESTINATION</small><h3>${esc(entry.title || entry.destination)}</h3><p>${esc(entry.reason || "Matched to places you have actually visited.")}</p></article>`).join("")}</div>` : `<div class="trip-recommendation-state"><b>RECOMMENDATION PROFILE READY</b><p>Your completed trips can now be used as travel evidence. Ideas and upcoming trips are never counted as places you have visited.</p></div>` : `<div class="trip-recommendation-state"><b>RECOMMENDATIONS BEGIN AFTER YOUR FIRST PAST TRIP</b><p>Adding an idea or upcoming trip will not influence this area. Only a trip you explicitly mark Past Trip becomes recommendation evidence.</p></div>`}</section>`;
}

export function renderTripPage(id) {
  const item = getState().items[id];
  if (!item || item.wing !== "trips") return `<section class="panel trip-empty"><b>TRIP FILE NOT FOUND.</b><button class="button" data-trip-back>RETURN TO TRIPS</button></section>`;
  const data = meta(item), field = (label, value) => `<article><span>${label}</span><b>${esc(value || "NOT SET")}</b></article>`;
  return `<button class="tv-back" data-trip-back>← JOURNEY BOARD</button><section class="trip-detail panel"><header><div><span class="eyebrow">${esc(statusLabel(item.status))} // ${esc(dateRange(item))}</span><h2>${esc(item.title)}</h2><p>${esc(data.destination || "Destination not set")}</p></div><span class="trip-detail__stamp">${esc(data.countryCode || "✈")}</span></header><div class="trip-detail__grid">${field("TRIP TYPE", data.tripType)}${field("BUDGET", data.budget)}${field("COMPANIONS", data.companions)}${field("TRANSPORT", data.transport)}${field("LODGING", data.lodging)}${field("CONFIRMATIONS", data.confirmations)}</div><section><span class="eyebrow">ITINERARY</span><p>${esc(data.itinerary || "No itinerary yet.")}</p></section><section><span class="eyebrow">PACKING / TASK CHECKLIST</span><p>${esc(data.checklist || "No checklist yet.")}</p></section><section><span class="eyebrow">TRIP NOTES</span><p>${esc(data.notes || "No notes yet.")}</p></section><div class="button-row"><button class="button primary" data-trip-edit="${esc(item.id)}">EDIT TRIP</button><button class="button ${item.favorite?"primary":""}" data-trip-favorite="${esc(item.id)}">${item.favorite?"FAVORITE ✓":"ADD FAVORITE"}</button><button class="button" data-trip-status="${item.status === "completed" ? "upcoming" : "completed"}" data-trip-id="${esc(item.id)}">${item.status === "completed" ? "RETURN TO UPCOMING" : "MARK TRIP COMPLETE"}</button><button class="button" data-trip-remove="${esc(item.id)}">REMOVE TRIP</button></div></section>`;
}

export function openTripDialog(id = "", onSaved = () => {}) {
  const item = id ? getState().items[id] : null, data = meta(item);
    openModal({ title: item ? "EDIT TRIP" : "ADD TRIP", body: `<div class="trip-form"><label>TRIP NAME<input data-trip-title value="${esc(item?.title || "")}" placeholder="NEW ORLEANS WEEKEND" autofocus></label><label>DESTINATION<input data-trip-destination value="${esc(data.destination || "")}" placeholder="CITY, REGION, OR COUNTRY"></label><div><label>START DATE<input type="date" data-trip-start value="${esc(data.startDate || "")}"></label><label>END DATE<input type="date" data-trip-end value="${esc(data.endDate || "")}"></label></div><label>STATUS<select data-trip-status-field>${[["idea","IDEA / SOMEDAY"],["upcoming","UPCOMING"],["active","IN PROGRESS"],["completed","PAST TRIP"],["cancelled","CANCELLED"]].map(([value,label]) => `<option value="${value}" ${(item?.status || "idea") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><div><label>TRIP TYPE<input data-trip-type value="${esc(data.tripType || "")}" placeholder="ROAD TRIP, WEEKEND, EVENT…"></label><label>BUDGET<input data-trip-budget value="${esc(data.budget || "")}" placeholder="$ OR NOTES"></label></div><label>COMPANIONS<input data-trip-companions value="${esc(data.companions || "")}" placeholder="WHO IS GOING"></label><label>TRANSPORT<input data-trip-transport value="${esc(data.transport || "")}" placeholder="FLIGHT, DRIVE, TRAIN…"></label><label>LODGING<input data-trip-lodging value="${esc(data.lodging || "")}" placeholder="HOTEL OR ADDRESS"></label><label>CONFIRMATIONS / IMPORTANT DETAILS<textarea data-trip-confirmations rows="3">${esc(data.confirmations || "")}</textarea></label><label>ITINERARY<textarea data-trip-itinerary rows="5">${esc(data.itinerary || "")}</textarea></label><label>PACKING / TASK CHECKLIST<textarea data-trip-checklist rows="5">${esc(data.checklist || "")}</textarea></label><label>NOTES<textarea data-trip-notes rows="5">${esc(data.notes || "")}</textarea></label></div>`, actions: [{ label: item ? "SAVE CHANGES" : "ADD TO TRIPS", primary: true, handler: dialog => { const title = dialog.querySelector("[data-trip-title]").value.trim(), destination = dialog.querySelector("[data-trip-destination]").value.trim(); if (!title && !destination) return; let tripId = id; update(save => { tripId ||= createId("trip"); const existing = save.items[tripId] || { id: tripId, wing: "trips", type: "trip", addedAt: new Date().toISOString() }; existing.title = title || destination; existing.status = dialog.querySelector("[data-trip-status-field]").value; existing.updatedAt = new Date().toISOString(); existing.tripMeta = { ...(existing.tripMeta || {}), personalArchive: true, actualTrip: existing.status === "completed" ? true : existing.tripMeta?.actualTrip === true, destination, startDate: dialog.querySelector("[data-trip-start]").value, endDate: dialog.querySelector("[data-trip-end]").value, tripType: dialog.querySelector("[data-trip-type]").value.trim(), budget: dialog.querySelector("[data-trip-budget]").value.trim(), companions: dialog.querySelector("[data-trip-companions]").value.trim(), transport: dialog.querySelector("[data-trip-transport]").value.trim(), lodging: dialog.querySelector("[data-trip-lodging]").value.trim(), confirmations: dialog.querySelector("[data-trip-confirmations]").value.trim(), itinerary: dialog.querySelector("[data-trip-itinerary]").value.trim(), checklist: dialog.querySelector("[data-trip-checklist]").value.trim(), notes: dialog.querySelector("[data-trip-notes]").value.trim() }; save.items[tripId] = existing; }); closeModal(); onSaved(tripId); } }] });
}

export function setTripStatus(id, status) {
  update(save => { const item = save.items[id]; if (item?.wing === "trips") { item.status = status; item.tripMeta ||= {}; item.tripMeta.personalArchive = true; if (status === "completed") item.tripMeta.actualTrip = true; item.updatedAt = new Date().toISOString(); } });
}
