import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

const PAGE_SIZE = { movies: 24, games: 36, books: 36 };
const wingState = new Map();

function stateFor(wing) {
  if (!wingState.has(wing)) wingState.set(wing, { status: "all", category: "all", page: 1 });
  return wingState.get(wing);
}

export function setLibraryControl(wing, type, value) {
  const state = stateFor(wing);
  if (type === "page") state.page = Math.max(1, Number(value) || 1);
  else { state[type] = value; state.page = 1; }
}

const artworkFor = item => typeof item?.artwork === "string"
  ? item.artwork
  : item?.artwork?.localPath || item?.artwork?.url || "";

function poster(item, label = item?.title || "Archive record") {
  const artwork = artworkFor(item);
  const initials = String(label).split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return `<i class="library-poster">${artwork
    ? `<img src="${esc(artwork)}" alt="Poster for ${esc(label)}">`
    : `<span aria-hidden="true">${esc(initials || "V")}</span>`}</i>`;
}

function statusForItems(items) {
  const completed = items.filter(item => item.status === "completed").length;
  return completed === items.length && items.length ? "completed" : completed ? "in_progress" : "backlog";
}

function pageSlice(records, page, pageSize) {
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const active = Math.min(Math.max(1, page), pages);
  return { active, pages, records: records.slice((active - 1) * pageSize, active * pageSize) };
}

function pager(wing, active, pages, total) {
  if (pages <= 1) return `<span class="library-page-count">${total} SHOWN</span>`;
  return `<nav class="library-pager" aria-label="${esc(wing)} result pages">
    <button class="button" data-library-page="${active - 1}" ${active === 1 ? "disabled" : ""}>PREVIOUS</button>
    <span>PAGE ${active} OF ${pages} / ${total} RESULTS</span>
    <button class="button" data-library-page="${active + 1}" ${active === pages ? "disabled" : ""}>NEXT</button>
  </nav>`;
}

function filters(wing, categories, total) {
  const state = stateFor(wing);
  return `<section class="panel library-controls">
    <div class="filterbar" role="group" aria-label="${esc(wing)} status filter">
      ${[["all", "ALL"], ["backlog", "BACKLOG"], ["in_progress", "IN PROGRESS"], ["completed", "ARCHIVED"]]
        .map(([value, label]) => `<button class="button ${state.status === value ? "primary" : ""}" data-library-status="${value}">${label}</button>`).join("")}
    </div>
    <label>CATEGORY
      <select data-library-category aria-label="${esc(wing)} category">
        <option value="all">ALL CATEGORIES</option>
        ${categories.map(category => `<option value="${esc(category)}" ${state.category === category ? "selected" : ""}>${esc(category)}</option>`).join("")}
      </select>
    </label>
    <span>${total} MATCHES</span>
  </section>`;
}

function itemDetail(wing, item) {
  if (!item || item.wing !== wing) return `<div class="panel empty"><b>RECORD NOT FOUND.</b>Return to the library.</div>`;
  return `<button class="tv-back" data-library-back>&lt;- ${esc(wing.toUpperCase())} LIBRARY</button>
    <article class="panel library-detail" data-item-id="${esc(item.id)}">
      ${poster(item)}
      <div>
        <span class="eyebrow">${esc(item.type || wing)} // ${esc(item.genres?.join(" / ") || "UNFILED")}</span>
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.description || item.note || "No archive description has been filed.")}</p>
        <div class="rating" role="group" aria-label="Rating for ${esc(item.title)}">
          ${Array.from({ length: 10 }, (_, index) => `<button data-rating="${index + 1}" class="${Number(item.rating) >= index + 1 ? "on" : ""}" aria-label="${index + 1} out of 10" title="${index + 1}/10">*</button>`).join("")}
        </div>
        <div class="button-row">
          <button class="button ${item.status !== "completed" ? "primary" : ""}" data-toggle-complete>${item.status === "completed" ? "UNARCHIVE" : "MARK COMPLETE"}</button>
          <button class="button" data-note>FIELD NOTE</button>
          <button class="button" data-workbench-edit="${esc(item.id)}">EDIT ARCHIVE FILE</button>
        </div>
      </div>
    </article>`;
}

function collectionDetail(collection) {
  const state = getState();
  if (!collection) return `<div class="panel empty"><b>COLLECTION NOT FOUND.</b>Return to Movies.</div>`;
  const items = (collection.itemIds || []).map(id => state.items[id]).filter(Boolean);
  const completed = items.filter(item => item.status === "completed").length;
  return `<button class="tv-back" data-library-back>&lt;- MOVIE COLLECTIONS</button>
    <section class="panel collection-detail">
      <header>${poster(items.find(item => artworkFor(item)) || items[0], collection.title)}<div>
        <span class="eyebrow">${esc(collection.legacy?.category || "MOVIE COLLECTION")}</span>
        <h2>${esc(collection.title)}</h2>
        <p>${completed}/${items.length} ARCHIVED</p>
      </div></header>
      <div class="collection-title-list">${items.map((item, index) => `<article>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div><b>${esc(item.title)}</b><small>${esc(item.year || "UNDATED")} / ${esc(item.status || "backlog")}</small></div>
        <button class="button" data-open-library-item="${esc(item.id)}">OPEN</button>
      </article>`).join("")}</div>
    </section>`;
}

function renderMovieLibrary(search, context) {
  const state = getState();
  if (context.segments?.[0] === "item") return itemDetail("movies", state.items[context.segments[1]]);
  if (context.segments?.[0] === "collection") return collectionDetail(state.collections?.[context.segments[1]]);
  const q = search.trim().toLowerCase(), control = stateFor("movies");
  const allCollections = Object.values(state.collections || {}).filter(collection => collection.wing === "movies");
  const categories = [...new Set(allCollections.map(collection => collection.legacy?.category || "Unfiled"))].sort();
  let collections = allCollections.map(collection => ({
    collection,
    items: (collection.itemIds || []).map(id => state.items[id]).filter(Boolean)
  })).filter(entry => !q || `${entry.collection.title} ${entry.collection.legacy?.category || ""} ${entry.items.map(item => item.title).join(" ")}`.toLowerCase().includes(q));
  if (control.category !== "all") collections = collections.filter(entry => (entry.collection.legacy?.category || "Unfiled") === control.category);
  if (control.status !== "all") collections = collections.filter(entry => statusForItems(entry.items) === control.status);
  const page = pageSlice(collections, control.page, PAGE_SIZE.movies);
  control.page = page.active;
  const cards = page.records.map(({ collection, items }) => {
    const completed = items.filter(item => item.status === "completed").length;
    const sample = items.find(item => artworkFor(item)) || items[0];
    return `<article class="panel collection-card">${poster(sample, collection.title)}<div>
      <span class="eyebrow">${esc(collection.legacy?.category || "MOVIES")}</span>
      <h3>${esc(collection.title)}</h3>
      <p>${items.length} TITLES / ${completed} ARCHIVED</p>
      <small>${items.slice(0, 3).map(item => esc(item.title)).join(" / ")}</small>
      <button class="button primary" data-open-library-collection="${esc(collection.id)}">OPEN COLLECTION</button>
    </div></article>`;
  }).join("");
  return `<section class="panel library-hero"><span class="eyebrow">PRESERVED FROM THE ORIGINAL VAULT</span><h2>MOVIE COLLECTIONS</h2><p>Browse franchises, creators, eras, and genre shelves before opening individual records.</p></section>
    ${filters("movies", categories, collections.length)}
    <div class="collection-card-grid">${cards || `<div class="panel empty"><b>NO COLLECTIONS MATCH.</b>Reset filters or search again.</div>`}</div>
    ${pager("movies", page.active, page.pages, collections.length)}`;
}

function renderFlatLibrary(wing, search, context) {
  const state = getState();
  if (context.segments?.[0] === "item") return itemDetail(wing, state.items[context.segments[1]]);
  const q = search.trim().toLowerCase(), control = stateFor(wing);
  const all = Object.values(state.items).filter(item => item.wing === wing);
  const categories = [...new Set(all.flatMap(item => item.genres || []))].sort();
  let items = all.filter(item => !q || `${item.title} ${item.year || ""} ${(item.genres || []).join(" ")}`.toLowerCase().includes(q));
  if (control.category !== "all") items = items.filter(item => (item.genres || []).includes(control.category));
  if (control.status !== "all") items = items.filter(item => item.status === control.status);
  items.sort((left, right) => left.title.localeCompare(right.title));
  const page = pageSlice(items, control.page, PAGE_SIZE[wing] || 36);
  control.page = page.active;
  const cards = page.records.map(item => `<article class="panel library-record-card">${poster(item)}<div>
    <span class="eyebrow">${esc(item.genres?.[0] || "UNFILED")}</span><h3>${esc(item.title)}</h3>
    <p>${esc(item.description || item.note || "Archive record ready.")}</p>
    <button class="button primary" data-open-library-item="${esc(item.id)}">OPEN RECORD</button>
  </div></article>`).join("");
  return `<section class="panel library-hero"><span class="eyebrow">CURATED LIBRARY</span><h2>${esc(wing.toUpperCase())}</h2><p>Browse a manageable shelf, then open a record for rating and notes.</p></section>
    ${filters(wing, categories, items.length)}
    <div class="library-record-grid">${cards || `<div class="panel empty"><b>NO RECORDS MATCH.</b>Reset filters or search again.</div>`}</div>
    ${pager(wing, page.active, page.pages, items.length)}`;
}

export function renderLibraryWing(wing, search = "", context = { segments: [] }) {
  return wing === "movies" ? renderMovieLibrary(search, context) : renderFlatLibrary(wing, search, context);
}
