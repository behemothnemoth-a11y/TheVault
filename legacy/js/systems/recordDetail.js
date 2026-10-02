import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { connectionsForNode } from "./relationshipGraph.js";
import { tasteSignalFor } from "./tasteCalibration.js";

const artworkFor = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const formatDate = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "NOT RECORDED";

export function recordDetailOpened(itemId) {
  const item = getState().items[itemId];
  if (!item) return null;
  const at = new Date().toISOString();
  update(save => {
    const stage = save.metadata.stage40;
    const previous = stage.recentRecords.find(entry => entry.itemId === itemId);
    stage.recentRecords = [{ itemId, lastOpenedAt: at, opens: Number(previous?.opens || 0) + 1 }, ...stage.recentRecords.filter(entry => entry.itemId !== itemId)].slice(0, 80);
  });
  emit("UNIVERSAL_RECORD_OPENED", { itemId, wing: item.wing, meta: { title: item.title } });
  return item;
}

export function setUniversalRecordRating(itemId, rating) {
  const item = getState().items[itemId], value = Number(rating);
  if (!item || !Number.isInteger(value) || value < 0 || value > 10) return false;
  const before = item.rating ?? null;
  update(save => { save.items[itemId].rating = value || null; });
  emit(before == null ? "ITEM_RATED" : "RATING_CHANGED", { itemId, wing: item.wing, meta: { title: item.title, from: before, to: value || null, source: "universal_record" } });
  return true;
}

export function toggleUniversalRecordFavorite(itemId) {
  const item = getState().items[itemId];
  if (!item) return null;
  const next = !item.favorite;
  update(save => { save.items[itemId].favorite = next; });
  emit(next ? "ITEM_FAVORITED" : "ITEM_UNFAVORITED", { itemId, wing: item.wing, meta: { title: item.title, source: "universal_record" } });
  return next;
}

export function setUniversalRecordStatus(itemId, status) {
  const item = getState().items[itemId], allowed = new Set(["backlog", "in_progress", "completed"]);
  if (!item || item.wing === "tv" || !allowed.has(status)) return false;
  const before = item.status;
  update(save => {
    save.items[itemId].status = status;
    if (status === "completed") save.items[itemId].completedAt = new Date().toISOString();
    else delete save.items[itemId].completedAt;
  });
  emit("ITEM_STATUS_CHANGED", { itemId, wing: item.wing, meta: { title: item.title, from: before, to: status, source: "universal_record" } });
  return true;
}

export function getUniversalRecordModel(itemId, state = getState()) {
  const item = state.items[itemId];
  if (!item) return null;
  const collections = Object.values(state.collections || {}).filter(collection => collection.itemIds?.includes(itemId));
  const events = (state.events || []).filter(event => event.itemId === itemId).slice(-30).reverse();
  const relationships = connectionsForNode("item", itemId, state);
  const deskEntries = (state.metadata.stage37.plans || []).flatMap(plan => (plan.entries || []).filter(entry => entry.itemId === itemId).map(entry => ({ plan, entry }))).slice(0, 10);
  const sessions = (state.metadata.stage39.plans || []).filter(plan => plan.entries?.some(entry => entry.itemId === itemId)).slice(0, 10);
  const recent = state.metadata.stage40.recentRecords.find(entry => entry.itemId === itemId);
  const tvEpisodes = Object.values(item.episodes || {});
  return {
    item, collections, events, relationships, deskEntries, sessions, recent,
    taste: tasteSignalFor(item, state),
    episodeCount: tvEpisodes.length,
    completedEpisodes: tvEpisodes.filter(episode => episode.status === "completed").length,
    playableEpisodes: tvEpisodes.filter(episode => episode.sourcePath).length
  };
}

function ratingMarkup(item) {
  return `<div class="record-rating" role="group" aria-label="Rate ${esc(item.title)} from one to ten">${Array.from({ length: 10 }, (_, index) => { const value = index + 1; return `<button aria-label="${value} of 10" class="${Number(item.rating || 0) >= value ? "active" : ""}" data-record-rating="${value}" data-record-id="${esc(item.id)}">◆</button>`; }).join("")}</div>`;
}

export function renderUniversalRecord(itemId) {
  const model = getUniversalRecordModel(itemId);
  if (!model) return `<section class="panel phase-empty"><b>RECORD NOT FOUND</b><p>The requested Vault ID is not present in this archive.</p><button class="button" data-route="home">RETURN HOME</button></section>`;
  const { item } = model, art = artworkFor(item);
  const description = item.description || item.note || "No archive description has been filed for this record.";
  const statusControls = item.wing === "tv" ? `<button class="button primary" data-route="tv/${encodeURIComponent(item.id)}">OPEN EPISODES</button>` : ["backlog", "in_progress", "completed"].map(status => `<button class="button ${item.status === status ? "primary" : ""}" data-record-status="${status}" data-record-id="${esc(item.id)}">${status.replace("_", " ").toUpperCase()}</button>`).join("");
  const match = model.taste.total >= 18 ? "STRONG" : model.taste.total > 0 ? "GOOD" : model.taste.total < 0 ? "LOW" : "LEARNING";
  return `<div class="record-page-actions"><button class="button" data-record-back="${esc(item.wing)}">← BACK TO ${esc(item.wing.toUpperCase())}</button><button class="button" data-record-copy>COPY DIRECT LINK</button></div>
    <section class="panel record-hero"><div class="record-art">${art ? `<img src="${esc(art)}" alt="${esc(item.title)} artwork">` : `<span aria-hidden="true">${esc(item.title.slice(0, 2).toUpperCase())}</span>`}</div><div><span class="eyebrow">${esc(item.wing.toUpperCase())} RECORD</span><h2>${esc(item.title)}</h2><p>${esc(description)}</p><div class="record-tags"><span>${esc((item.status || "backlog").replace("_", " ").toUpperCase())}</span>${item.year ? `<span>${esc(item.year)}</span>` : ""}${(item.genres || []).map(genre => `<span>${esc(genre)}</span>`).join("")}</div><div class="button-row record-primary-actions">${statusControls}<button class="button ${item.favorite ? "primary" : ""}" data-record-favorite="${esc(item.id)}">${item.favorite ? "★ FAVORITE" : "☆ ADD FAVORITE"}</button><button class="button" data-workbench-edit="${esc(item.id)}">EDIT DETAILS</button></div></div></section>
    <section class="record-dashboard"><article class="panel rating-panel"><span>YOUR RATING</span><b>${item.rating ? `${item.rating}/10` : "NOT RATED"}</b>${ratingMarkup(item)}</article><article class="panel"><span>RECOMMENDATION MATCH</span><b>${match}</b><small>Based only on your ratings and explicit taste choices.</small></article><article class="panel"><span>SHOWN IN TODAY</span><b>${model.deskEntries.length}</b><small>${model.deskEntries[0] ? `LATEST ${esc(model.deskEntries[0].plan.dateKey)}` : "NOT SHOWN YET"}</small></article><article class="panel"><span>PLANNED SESSIONS</span><b>${model.sessions.length}</b><small>LAST OPENED ${esc(formatDate(model.recent?.lastOpenedAt))}</small></article></section>
    ${item.wing === "tv" ? `<section class="panel record-tv"><div><span class="eyebrow">EPISODES</span><h3>${model.completedEpisodes}/${model.episodeCount} ARCHIVED</h3><p>${model.playableEpisodes} local episode${model.playableEpisodes === 1 ? " is" : "s are"} ready to open directly. Episode ratings and playback live on the series page.</p></div><button class="button primary" data-route="tv/${encodeURIComponent(item.id)}">OPEN ALL EPISODES</button></section>` : ""}
    <section class="panel record-collections"><div class="panel__header"><h3>COLLECTIONS</h3><span class="panel__code">${model.collections.length}</span></div><div class="record-list">${model.collections.map(collection => `<button class="button" data-route="${item.wing}/collection/${encodeURIComponent(collection.id)}">${esc(collection.title || collection.name || collection.id)}</button>`).join("") || "<p class=\muted\>This record is not in a collection yet.</p>"}</div></section>
    <details class="panel record-technical"><summary>RECORD DETAILS & LOCAL EVIDENCE</summary><div class="record-columns"><article><h3>ARCHIVE DETAILS</h3><dl><div><dt>VAULT ID</dt><dd>${esc(item.id)}</dd></div><div><dt>OWNED</dt><dd>${item.owned ? "YES" : "NO"}</dd></div><div><dt>RELATIONSHIPS</dt><dd>${model.relationships.length}</dd></div><div><dt>RECORD OPENS</dt><dd>${model.recent?.opens || 1}</dd></div><div><dt>TASTE SCORE</dt><dd>${model.taste.total >= 0 ? "+" : ""}${model.taste.total}</dd></div></dl></article><article><h3>RECENT ACTIVITY</h3><div class="record-events">${model.events.slice(0, 10).map(event => `<article><time>${esc(formatDate(event.timestamp))}</time><b>${esc(event.type.replaceAll("_", " "))}</b><small>${esc(event.meta?.title || "")}</small></article>`).join("") || "<p>NO ITEM-SPECIFIC EVENTS FILED</p>"}</div></article></div><div class="phase-signal-strip"><b>UNIVERSAL RECORD CONTRACT</b><div><span>ONE DURABLE ROUTE</span><span>EXPLICIT EDITS</span><span>LOCAL EVIDENCE</span><span>NO SILENT COMPLETION</span></div></div></details>`;
}
