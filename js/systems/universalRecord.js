import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { tasteSignalFor } from "./tasteCalibration.js";

const artFor = item => typeof item?.artwork === "string"
  ? item.artwork
  : item?.artwork?.localPath || item?.artwork?.url || "";

const safeArt = item => {
  const value = artFor(item);
  return /^(?:\.\/)?assets\//.test(value) || /^\/assets\//.test(value) ? value : "";
};

const initials = title => String(title || "?")
  .split(/\s+/).filter(Boolean).slice(0, 2)
  .map(word => word[0]).join("").toUpperCase();

const currentStatus = item => {
  if (item?.wing === "books") return item.bookMeta?.status || "planned";
  if (item?.wing === "manga") return item.comicMeta?.readingStatus || item.status || "planned";
  if (item?.wing === "games") return item.gameMeta?.playStatus || item.status || "backlog";
  return item?.status || "backlog";
};

const statusOptions = item => {
  if (!item || item.wing === "tv") return [];
  if (item.wing === "books") return ["planned","reading","paused","completed","dropped"];
  if (item.wing === "manga") return ["planned","reading","paused","completed","dropped"];
  if (item.wing === "games") return ["backlog","playing","paused","completed","dropped"];
  if (item.wing === "movies") return ["planned","backlog","in_progress","completed"];
  return ["backlog","in_progress","completed"];
};

const dedicatedRoute = item => ({
  tv: `tv/${encodeURIComponent(item.id)}`,
  movies: `movies/${encodeURIComponent(item.id)}`,
  games: `games/${encodeURIComponent(item.id)}`,
  books: `books/${encodeURIComponent(item.id)}`,
  manga: `manga/${encodeURIComponent(item.id)}`,
  youtube: `youtube/${encodeURIComponent(item.id)}`,
  trips: `trips/${encodeURIComponent(item.id)}`
}[item?.wing] || item?.wing || "home");function collectionContext(item, state) {
  const rows = [];
  for (const [id, collection] of Object.entries(state.collections || {})) {
    const ids = collection.itemIds || collection.items || [];
    if (Array.isArray(ids) && ids.includes(item.id)) rows.push(collection.name || collection.title || id);
  }
  if (item.legacy?.collectionId) rows.push(item.legacy.collectionId);
  return [...new Set(rows)].slice(0, 12);
}

function planContext(item, state) {
  const desk = (state.metadata?.stage37?.plans || [])
    .filter(plan => (plan.entries || []).some(entry => entry.itemId === item.id)).slice(0, 5);
  const sessions = (state.metadata?.stage39?.plans || [])
    .filter(plan => (plan.entries || []).some(entry => (typeof entry === "string" ? entry : entry.itemId) === item.id)).slice(0, 5);
  return { desk, sessions };
}

function eventRows(item, state) {
  return (state.events || []).filter(event => event.itemId === item.id)
    .sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 30);
}

function episodeStats(item) {
  const episodes = Object.values(item.episodes || {});
  return {
    total: episodes.length,
    linked: episodes.filter(ep => ep.sourcePath).length,
    completed: episodes.filter(ep => ep.status === "completed").length
  };
}

export function recordUniversalOpen(itemId) {
  if (!getState().items?.[itemId]) return false;
  const openedAt = new Date().toISOString();
  update(save => {
    const stage = save.metadata.stage40 ||= { recentRecords: [], preferences: {}, policy: {} };
    const existing = (stage.recentRecords || []).find(row => row.itemId === itemId);
    stage.recentRecords = [{
      itemId,
      lastOpenedAt: openedAt,
      opens: Number(existing?.opens || 0) + 1
    }, ...(stage.recentRecords || []).filter(row => row.itemId !== itemId)].slice(0, 80);
  });
  return true;
}

export function setUniversalRecordRating(itemId, rating) {
  rating = Math.max(1, Math.min(10, Math.round(Number(rating) || 0)));
  const item = getState().items?.[itemId];
  if (!item || !rating) return null;
  const before = Number(item.rating || 0);
  update(save => { save.items[itemId].rating = rating; });
  emit(before ? "RATING_CHANGED" : "ITEM_RATED", {
    itemId, wing: item.wing, meta: { title: item.title, from: before || null, to: rating }
  });
  return rating;
}export function toggleUniversalRecordFavorite(itemId) {
  const item = getState().items?.[itemId];
  if (!item) return null;
  let value = false;
  update(save => {
    save.items[itemId].favorite = !Boolean(save.items[itemId].favorite);
    value = save.items[itemId].favorite;
  });
  emit("ITEM_METADATA_CHANGED", {
    itemId, wing: item.wing,
    meta: { title: item.title, action: value ? "favorite_added" : "favorite_removed" }
  });
  return value;
}

export function setUniversalRecordStatus(itemId, status) {
  const item = getState().items?.[itemId];
  if (!item || item.wing === "tv" || !statusOptions(item).includes(status)) return null;
  const before = currentStatus(item);
  update(save => {
    const target = save.items[itemId];
    if (target.wing === "books" && target.bookMeta) target.bookMeta.status = status;
    else if (target.wing === "manga" && target.comicMeta) {
      target.comicMeta.readingStatus = status;
      target.status = status === "reading" ? "in_progress" : status === "planned" ? "backlog" : status;
    } else if (target.wing === "games" && target.gameMeta) {
      target.gameMeta.playStatus = status;
      target.status = status === "playing" ? "in_progress" : status === "completed" ? "completed" : "backlog";
    } else target.status = status;
  });
  emit(status === "completed" ? "ITEM_COMPLETED" : before === "completed" ? "ITEM_UNCOMPLETED" : "ITEM_METADATA_CHANGED", {
    itemId, wing: item.wing, meta: { title: item.title, from: before, to: status }
  });
  return status;
}

function contextMarkup(item, state) {
  const recent = (state.metadata?.stage40?.recentRecords || []).find(row => row.itemId === item.id);
  const plans = planContext(item, state);
  const collections = collectionContext(item, state);
  return [
    ["COLLECTIONS", collections.length ? collections.join(" · ") : "None filed"],
    ["DAILY DESK", plans.desk.length ? `${plans.desk.length} appearance${plans.desk.length === 1 ? "" : "s"}` : "No appearances"],
    ["SESSION PLANS", plans.sessions.length ? `${plans.sessions.length} appearance${plans.sessions.length === 1 ? "" : "s"}` : "No appearances"],
    ["RECENT OPENS", recent ? `${recent.opens} · ${new Date(recent.lastOpenedAt).toLocaleString()}` : "First recorded open"]
  ].map(([key,value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("");
}export function renderUniversalRecord(itemId) {
  const state = getState(), item = state.items?.[itemId];
  if (!item) return `<section class="panel phase-empty"><b>RECORD NOT FOUND.</b><p>The requested Vault ID is not present.</p><button class="button" data-route="home">RETURN HOME</button></section>`;

  const art = safeArt(item), taste = tasteSignalFor(item, state);
  const events = eventRows(item, state), episodes = episodeStats(item);
  const statuses = statusOptions(item), status = currentStatus(item), rating = Number(item.rating || 0);
  const tags = [item.wing?.toUpperCase(), item.year || "", ...(item.genres || []).slice(0, 4), item.owned ? "OWNED" : "", item.favorite ? "FAVORITE" : ""].filter(Boolean);
  const ratingButtons = Array.from({length:10},(_,i)=>i+1)
    .map(value => `<button class="${rating === value ? "active" : ""}" data-record-rating="${value}" data-record-id="${esc(item.id)}" aria-label="Rate ${value} out of 10">${value}</button>`).join("");
  const statusButtons = statuses.length ? `<div class="button-row">${statuses.map(value => `<button class="button ${status === value ? "primary" : ""}" data-record-status="${esc(value)}" data-record-id="${esc(item.id)}">${esc(value.replaceAll("_"," ").toUpperCase())}</button>`).join("")}</div>` : "";
  const eventMarkup = events.length ? events.map(event => `<article><time>${esc(new Date(event.timestamp).toLocaleString())}</time><b>${esc(event.type.replaceAll("_"," "))}</b><small>${esc(event.meta?.action || event.meta?.to || event.meta?.title || "")}</small></article>`).join("") : "<p>No item-specific events recorded yet.</p>";

  return `<div class="record-page-actions"><button class="button" data-record-back="${esc(item.wing)}">← BACK</button><button class="button" data-record-copy>COPY RECORD LINK</button></div>
    <section class="panel record-hero">
      <div class="record-art">${art ? `<img src="${esc(art)}" alt="">` : `<span aria-hidden="true">${esc(initials(item.title))}</span>`}</div>
      <div><span class="eyebrow">UNIVERSAL RECORD // ${esc(item.id)}</span><h2>${esc(item.title)}</h2>
      <div class="record-tags">${tags.map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
      <p>${esc(item.description || item.note || "No description has been filed for this record yet.")}</p>
      <div class="record-primary-actions"><button class="button primary" data-route="${esc(dedicatedRoute(item))}">OPEN ${esc(item.wing.toUpperCase())} FILE</button><button class="button ${item.favorite ? "primary" : ""}" data-record-favorite="${esc(item.id)}">${item.favorite ? "★ FAVORITE" : "☆ FAVORITE"}</button></div></div>
    </section>
    <section class="record-dashboard">
      <article class="panel"><span>RATING</span><b>${rating ? `${rating}/10` : "UNRATED"}</b><div class="record-rating">${ratingButtons}</div></article>
      <article class="panel"><span>STATUS</span><b>${esc(status.replaceAll("_"," ").toUpperCase())}</b>${statusButtons}</article>
      <article class="panel"><span>EXPLICIT TASTE</span><b>${taste.total >= 0 ? "+" : ""}${taste.total}</b><small>ITEM ${taste.item} · WING ${taste.wing} · GENRE ${taste.genres}</small></article>
      <article class="panel"><span>OWNERSHIP / FILE</span><b>${item.owned ? "OWNED" : item.sourcePath ? "LOCAL FILE" : "CATALOG"}</b><small>${esc(item.sourcePath || (item.sourcePaths || [])[0] || "No primary file path")}</small></article>
    </section>
    ${item.wing === "tv" ? `<section class="panel record-tv"><div><span class="eyebrow">TELEVISION RECORD</span><h3>${episodes.completed} / ${episodes.total} EPISODES COMPLETE</h3><p>${episodes.linked} episode file${episodes.linked === 1 ? "" : "s"} linked. Series progress remains episode-based.</p></div><button class="button primary" data-route="tv/${encodeURIComponent(item.id)}">OPEN SERIES FILE</button></section>` : ""}
    <section class="record-columns"><article class="panel"><h3>CONTEXT</h3><dl>${contextMarkup(item,state)}</dl></article><article class="panel"><h3>RECENT ITEM EVENTS</h3><div class="record-events">${eventMarkup}</div></article></section>`;
}
