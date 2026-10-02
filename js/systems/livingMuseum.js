import { on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const currentRoute = () => location.hash.replace(/^#\//, "");
const artFor = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const archiveItems = state => Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
const collectionItemIds = collection => (collection.itemIds || collection.items || collection.recordIds || []).map(entry => typeof entry === "string" ? entry : entry?.id).filter(Boolean);

function deterministicIndex(key, length) {
  if (!length) return -1;
  return [...key].reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 1), 0) % length;
}
function progressEvidence(item) {
  if (!item.progress?.total) return null;
  return `${Number(item.progress.completed || 0)}/${Number(item.progress.total)} complete`;
}
function evidenceFor(item, state) {
  const collections = Object.values(state.collections || {}).filter(collection => collectionItemIds(collection).includes(item.id));
  return [item.favorite ? "favorite" : null, Number(item.rating) ? `rated ${Number(item.rating)}/10` : null, progressEvidence(item), item.year ? `dated ${item.year}` : null, collections.length ? `${collections.length} collection${collections.length === 1 ? "" : "s"}` : null].filter(Boolean);
}

export function ensureDailyMuseumExhibit(now = new Date()) {
  const state = getState(), dateKey = localDateKey(now), existing = (state.metadata.stage36.exhibits || []).find(exhibit => exhibit.dateKey === dateKey && state.items[exhibit.itemId]);
  if (existing) return existing;
  const items = archiveItems(state).filter(item => item.title).sort((a, b) => a.title.localeCompare(b.title));
  const preferred = items.filter(item => item.favorite || Number(item.rating) >= 8 || artFor(item));
  const candidates = preferred.length ? preferred : items, item = candidates[deterministicIndex(dateKey, candidates.length)];
  if (!item) return null;
  const exhibit = { id: createId("exhibit"), dateKey, itemId: item.id, createdAt: now.toISOString(), source: "deterministic_local_rotation", evidence: evidenceFor(item, state) };
  update(save => { save.metadata.stage36.exhibits = [exhibit, ...(save.metadata.stage36.exhibits || []).filter(entry => entry.dateKey !== dateKey)].slice(0, 400); });
  return exhibit;
}

export function getLivingMuseumModel(state = getState(), now = new Date()) {
  const items = archiveItems(state), pins = new Set(state.metadata.stage36?.pins || []), itemById = new Map(items.map(item => [item.id, item]));
  const currentExhibit = (state.metadata.stage36?.exhibits || []).find(exhibit => exhibit.dateKey === localDateKey(now) && itemById.has(exhibit.itemId)) || null;
  const favorites = items.filter(item => item.favorite).sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || a.title.localeCompare(b.title));
  const continuing = items.filter(item => item.wing === "tv" && item.status === "in_progress").sort((a, b) => (b.progress?.completed || 0) - (a.progress?.completed || 0));
  const masterworks = items.filter(item => Number(item.rating) >= 9).sort((a, b) => Number(b.rating) - Number(a.rating) || a.title.localeCompare(b.title));
  const pinned = [...pins].map(id => itemById.get(id)).filter(Boolean);
  const highlightPool = items.filter(item => item.favorite || Number(item.rating) || artFor(item) || item.year);
  const highlights = (highlightPool.length ? highlightPool : items).sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || Number(b.rating || 0) - Number(a.rating || 0) || Number(Boolean(artFor(b))) - Number(Boolean(artFor(a))) || a.title.localeCompare(b.title)).slice(0, 12);
  const onThisDay = (state.events || []).filter(event => {
    const date = new Date(event.timestamp);
    return Number.isFinite(date.getTime()) && date.getMonth() === now.getMonth() && date.getDate() === now.getDate() && date.getFullYear() < now.getFullYear();
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const genreCounts = new Map();
  items.forEach(item => (item.genres || []).forEach(genre => genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)));
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  const collections = Object.values(state.collections || {}).map(collection => ({ collection, itemIds: collectionItemIds(collection).filter(id => itemById.has(id)) })).filter(entry => entry.itemIds.length).sort((a, b) => b.itemIds.length - a.itemIds.length).slice(0, 8);
  return { items, itemById, currentExhibit, favorites, continuing, masterworks, pinned, highlights, onThisDay, genres, collections };
}

function openAttributes(item) { return item.wing === "tv" ? `data-open-series="${item.id}"` : `data-museum-open="${item.id}"`; }
function card(item, state, pins, reason) {
  const art = artFor(item), evidence = reason || evidenceFor(item, state).join(" · ") || `${item.wing} record`;
  return `<article class="museum-card panel"><button class="museum-card__open" ${openAttributes(item)} style="--h:${[...item.title].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360}"><i>${art ? `<img src="${esc(art)}" alt="">` : esc(item.title.slice(0, 2))}</i><span><b>${esc(item.title)}</b><small>${esc(evidence)}</small></span></button><button class="museum-pin ${pins.has(item.id) ? "on" : ""}" data-museum-pin="${item.id}" aria-label="${pins.has(item.id) ? "Unpin" : "Pin"} ${esc(item.title)}">&#9733;</button></article>`;
}
function gallery(title, code, items, state, pins, reasonFor) {
  if (!items.length) return "";
  return `<section class="museum-gallery"><div class="museum-gallery__header"><div><span class="eyebrow">${esc(code)}</span><h2>${esc(title)}</h2></div><b>${items.length}</b></div><div class="museum-grid">${items.slice(0, 12).map(item => card(item, state, pins, reasonFor?.(item))).join("")}</div></section>`;
}

export function renderLivingMuseum() {
  if (currentRoute() !== "museum") return;
  ensureDailyMuseumExhibit();
  const state = getState(), model = getLivingMuseumModel(state), pins = new Set(state.metadata.stage36.pins || []), exhibit = model.currentExhibit, item = exhibit ? model.itemById.get(exhibit.itemId) : null, art = artFor(item);
  document.querySelector("#view").innerHTML = `<section class="museum-hero panel" style="--h:${item ? [...item.title].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360 : 30}">${item ? `<div class="museum-hero__poster">${art ? `<img src="${esc(art)}" alt="">` : esc(item.title.slice(0, 2))}</div><div class="museum-hero__copy"><span class="eyebrow">CHECKPOINT 36 // DAILY SPOTLIGHT // ${esc(exhibit.dateKey)}</span><h2>${esc(item.title)}</h2><p>${esc(exhibit.evidence.join(" · ") || `${item.wing} record selected by the local daily rotation`)}</p><div class="button-row"><button class="button primary" ${openAttributes(item)}>OPEN RECORD</button><button class="button" data-museum-pin="${item.id}">${pins.has(item.id) ? "UNPIN" : "PIN TO MUSEUM"}</button></div><small>Selected deterministically from your local archive. No external recommendation or invented date.</small></div>` : `<div><span class="eyebrow">CHECKPOINT 36 // LIVING MUSEUM</span><h2>THE GALLERIES ARE READY.</h2><p>Add records to begin the daily local rotation.</p></div>`}</section>
    ${gallery("Pinned Gallery", "YOUR CURATION", model.pinned, state, pins)}
    ${gallery("Archive Highlights", "LOCAL CATALOG", model.highlights, state, pins, record => evidenceFor(record, state).join(" · ") || `${record.wing} record`)}
    ${gallery("Continue the Story", "TELEVISION IN PROGRESS", model.continuing, state, pins, record => progressEvidence(record))}
    ${gallery("Favorite Records", "PERSONAL EVIDENCE", model.favorites, state, pins, record => `marked favorite${record.rating ? ` · ${record.rating}/10` : ""}`)}
    ${gallery("Masterworks", "RATED 9 OR 10", model.masterworks, state, pins, record => `your rating · ${record.rating}/10`)}
    ${model.onThisDay.length ? `<section class="museum-history panel"><div class="panel__header"><h2>ON THIS DAY</h2><span class="panel__code">WITNESSED HISTORY ONLY</span></div>${model.onThisDay.slice(0, 16).map(event => { const record = model.itemById.get(event.itemId); return `<article ${record ? openAttributes(record) : ""}><time>${new Date(event.timestamp).toLocaleString()}</time><b>${esc(event.type.replaceAll("_", " "))}</b><small>${esc(event.meta?.title || record?.title || "Vault event")}</small></article>`; }).join("")}</section>` : ""}
    <div class="museum-index"><section class="panel"><div class="panel__header"><h2>LARGEST GENRE HALLS</h2><span class="panel__code">CURRENT RECORDS</span></div>${model.genres.map(([genre, count]) => `<div><span>${esc(genre)}</span><b>${count}</b></div>`).join("") || `<p class="muted">No genre evidence yet.</p>`}</section><section class="panel"><div class="panel__header"><h2>COLLECTION WINGS</h2><span class="panel__code">PRESERVED GROUPS</span></div>${model.collections.map(({ collection, itemIds }) => `<div><span>${esc(collection.title || collection.name || collection.id || "Collection")}</span><b>${itemIds.length}</b></div>`).join("") || `<p class="muted">No collection evidence yet.</p>`}</section></div>
    <section class="panel museum-policy"><b>LIVING, NOT DEMANDING.</b><p>The museum changes when your archive changes and rotates once per local day. It has no check-in reward, attendance streak, external ranking, or fabricated history.</p></section>`;
  document.querySelector("#view-title").textContent = "The Living Museum";
  document.querySelector("#view-code").textContent = "VAULT://MUSEUM";
}

function togglePin(itemId) {
  if (!getState().items[itemId]) return;
  let pinned = false;
  update(save => {
    const current = save.metadata.stage36.pins || [], exists = current.includes(itemId);
    save.metadata.stage36.pins = exists ? current.filter(id => id !== itemId) : [...current, itemId].slice(-100);
    pinned = !exists;
    save.metadata.stage36.changeLog = [...(save.metadata.stage36.changeLog || []), { id: createId("museum_change"), itemId, action: pinned ? "pin" : "unpin", at: new Date().toISOString() }].slice(-1000);
  });
  toast(pinned ? "PINNED TO THE MUSEUM" : "REMOVED FROM PINNED GALLERY", getState().items[itemId].title);
  renderLivingMuseum();
}
function openRecord(itemId) {
  const item = getState().items[itemId]; if (!item) return;
  location.hash = `#/${item.wing}`;
  setTimeout(() => {
    const search = document.querySelector("#global-search");
    if (search) { search.value = item.title; search.dispatchEvent(new Event("input", { bubbles: true })); }
  }, 100);
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-museum-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/living-museum.css"; link.dataset.museumStyles = ""; document.head.append(link);
  }
  ensureDailyMuseumExhibit();
  on("WING_VISITED", event => { if (event.wing === "museum") setTimeout(renderLivingMuseum, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderLivingMuseum, 0));
  document.addEventListener("click", event => {
    const pin = event.target.closest("[data-museum-pin]")?.dataset.museumPin;
    if (pin) { event.preventDefault(); togglePin(pin); return; }
    const itemId = event.target.closest("[data-museum-open]")?.dataset.museumOpen;
    if (itemId) { event.preventDefault(); openRecord(itemId); }
  }, true);
  setInterval(() => ensureDailyMuseumExhibit(), 60 * 60 * 1000);
  setTimeout(renderLivingMuseum, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);