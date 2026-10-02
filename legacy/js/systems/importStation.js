import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { makeRelationshipRecord } from "./relationshipGraph.js";

const ADAPTERS = {
  youtube: { label: "YOUTUBE HISTORY", wing: "youtube", type: "youtube", genre: "YouTube Import" },
  music: { label: "LISTENING HISTORY", wing: "music", type: "music", genre: "Music Import" },
  podcasts: { label: "PODCAST HISTORY", wing: "podcasts", type: "podcast", genre: "Podcast Import" },
  books: { label: "BOOK EXPORT", wing: "books", type: "book", genre: "Book Import" },
  manga: { label: "MANGA EXPORT", wing: "manga", type: "manga", genre: "Manga Import" },
  food: { label: "FOOD / RESTAURANT LOG", wing: "food", type: "food", genre: "Food Import" },
  trips: { label: "TRIP / PLACE LOG", wing: "trips", type: "trip", genre: "Travel Import" },
  calendar: { label: "CALENDAR EXPORT", wing: "calendar", type: "event", genre: "Calendar Import" }
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const slug = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "").slice(0, 100) || "unknown";
function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function lookup(row, names) {
  if (!row || typeof row !== "object") return null;
  const keys = new Map(Object.keys(row).map(key => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), key]));
  for (const name of names) {
    const key = keys.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (key != null && row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = clean(value);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (compact) {
    const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = compact;
    const candidate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${utc ? "Z" : ""}`);
    return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index <= text.length; index++) {
    const character = text[index] ?? "\n";
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) { row.push(field); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(field); field = "";
      if (row.some(value => clean(value))) rows.push(row);
      row = [];
    } else field += character;
  }
  if (!rows.length) return [];
  const headers = rows.shift().map((header, index) => clean(header).replace(/^\uFEFF/, "") || `column_${index + 1}`);
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function unescapeIcs(value) {
  return clean(String(value || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"));
}

function parseIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)].map(([, block]) => {
    const row = {};
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const key = line.slice(0, separator).split(";")[0].toUpperCase();
      row[key] = unescapeIcs(line.slice(separator + 1));
    }
    return row;
  });
}

function extractRows(text, fileName) {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (/\.ics$/i.test(fileName) || /^BEGIN:VCALENDAR/i.test(trimmed)) return { format: "ics", rows: parseIcs(trimmed) };
  if (/\.tsv$/i.test(fileName)) return { format: "tsv", rows: parseDelimited(trimmed, "\t") };
  if (/\.csv$/i.test(fileName)) return { format: "csv", rows: parseDelimited(trimmed, ",") };
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch (error) { throw new Error(`The file is not valid JSON, CSV, TSV, or ICS: ${error.message}`); }
  if (Array.isArray(parsed)) return { format: "json", rows: parsed };
  for (const key of ["items", "records", "history", "events", "entries", "activities", "data"]) {
    if (Array.isArray(parsed?.[key])) return { format: "json", rows: parsed[key] };
  }
  if (parsed && typeof parsed === "object") return { format: "json", rows: [parsed] };
  throw new Error("The export does not contain recognizable records.");
}

function detectSource(rows, fileName) {
  if (/\.ics$/i.test(fileName)) return "calendar";
  const sample = rows.slice(0, 5);
  const keys = new Set(sample.flatMap(row => Object.keys(row || {}).map(key => key.toLowerCase().replace(/[^a-z0-9]/g, ""))));
  if (keys.has("titleurl") || keys.has("subtitles") || keys.has("videoid") || /youtube/i.test(fileName)) return "youtube";
  if (keys.has("trackname") || keys.has("artistname") || keys.has("mastermetadatatrackname") || keys.has("spotifytrackuri") || keys.has("msplayed") || /spotify|lastfm|music|listen/i.test(fileName)) return "music";
  if (keys.has("podcast") || keys.has("podcastname") || keys.has("episodetitle") || /podcast/i.test(fileName)) return "podcasts";
  if (keys.has("isbn") || keys.has("author") || keys.has("authors") || /goodreads|book/i.test(fileName)) return "books";
  if (keys.has("volume") || keys.has("chapter") || /manga|anilist|myanimelist/i.test(fileName)) return "manga";
  if (keys.has("restaurant") || keys.has("recipe") || keys.has("dish") || /food|restaurant|recipe/i.test(fileName)) return "food";
  if (keys.has("destination") || keys.has("latitude") || keys.has("longitude") || /trip|travel|place/i.test(fileName)) return "trips";
  if (keys.has("dtstart") || keys.has("starttime") || keys.has("startdate") || /calendar/i.test(fileName)) return "calendar";
  return null;
}

function subtitleCreator(row) {
  const subtitles = row?.subtitles;
  if (Array.isArray(subtitles)) return clean(subtitles[0]?.name || subtitles[0]?.title);
  return "";
}

function statusFor(row, source, occurredAt) {
  const raw = clean(lookup(row, ["status", "progress", "state"])).toLowerCase();
  if (/complete|completed|finished|read|watched|listened|visited|attended/.test(raw)) return "completed";
  if (/progress|current|reading|listening/.test(raw)) return "in_progress";
  if (["youtube", "music", "podcasts", "food", "trips", "calendar"].includes(source)) return "completed";
  return occurredAt && lookup(row, ["completedAt", "finishedAt", "dateRead"]) ? "completed" : "backlog";
}

function normalizeRow(row, source, index) {
  const adapter = ADAPTERS[source];
  const occurredAt = normalizeDate(lookup(row, ["time", "timestamp", "ts", "eventStartTimestamp", "playedAt", "listenedAt", "watchedAt", "completedAt", "dateRead", "visitedAt", "date", "start", "startTime", "startDate", "DTSTART"]));
  const sourceFields = {
    youtube: {
      title: clean(lookup(row, ["title", "videoTitle", "name"])).replace(/^Watched\s+/i, ""),
      creator: clean(lookup(row, ["channel", "channelTitle", "creator", "author"]) || subtitleCreator(row)),
      externalUrl: clean(lookup(row, ["titleUrl", "videoUrl", "url"])),
      series: "", place: ""
    },
    music: {
      title: clean(lookup(row, ["masterMetadataTrackName", "songName", "trackName", "track", "title", "name"])),
      creator: clean(lookup(row, ["masterMetadataAlbumArtistName", "artistName", "artist", "albumArtist"])),
      externalUrl: clean(lookup(row, ["spotifyTrackUri", "uri", "trackUri", "url"])),
      series: clean(lookup(row, ["masterMetadataAlbumAlbumName", "albumName", "album"])), place: ""
    },
    podcasts: {
      title: clean(lookup(row, ["episodeTitle", "episode", "title", "name"])),
      creator: clean(lookup(row, ["creator", "author", "publisher"])),
      externalUrl: clean(lookup(row, ["episodeUrl", "url", "uri"])),
      series: clean(lookup(row, ["podcastName", "podcast", "show", "series"])), place: ""
    },
    books: {
      title: clean(lookup(row, ["title", "bookTitle", "name"])),
      creator: clean(Array.isArray(lookup(row, ["authors"])) ? lookup(row, ["authors"]).join(", ") : lookup(row, ["author", "authors", "writer"])),
      externalUrl: clean(lookup(row, ["url", "link"])),
      series: clean(lookup(row, ["series", "shelf", "bookshelves"])), place: ""
    },
    manga: {
      title: clean(lookup(row, ["title", "mangaTitle", "name"])),
      creator: clean(Array.isArray(lookup(row, ["authors"])) ? lookup(row, ["authors"]).join(", ") : lookup(row, ["author", "authors", "creator"])),
      externalUrl: clean(lookup(row, ["url", "link"])),
      series: clean(lookup(row, ["series"])), place: ""
    },
    food: {
      title: clean(lookup(row, ["dish", "recipe", "restaurant", "title", "name"])),
      creator: clean(lookup(row, ["chef", "creator"])), externalUrl: clean(lookup(row, ["url", "link"])),
      series: "", place: clean(lookup(row, ["restaurant", "place", "location", "venue"]))
    },
    trips: {
      title: clean(lookup(row, ["trip", "destination", "place", "title", "name"])),
      creator: "", externalUrl: clean(lookup(row, ["url", "link"])),
      series: clean(lookup(row, ["journey", "tripName", "collection"])), place: clean(lookup(row, ["destination", "place", "location", "city"]))
    },
    calendar: {
      title: clean(lookup(row, ["SUMMARY", "summary", "title", "name", "event"])),
      creator: clean(lookup(row, ["organizer", "creator"])), externalUrl: clean(lookup(row, ["URL", "url", "link"])),
      series: clean(lookup(row, ["calendar", "category"])), place: clean(lookup(row, ["LOCATION", "location", "venue", "place"]))
    }
  }[source];
  if (!sourceFields?.title) return { error: `Row ${index + 1} has no recognizable title.` };
  const explicitId = clean(lookup(row, ["id", "externalId", "videoId", "trackId", "uri", "UID", "uid", "isbn", "guid"]) || sourceFields.externalUrl);
  const externalId = explicitId || `row_${hash(`${sourceFields.title}|${sourceFields.creator}|${occurredAt || ""}|${index}`)}`;
  const explicitYear = Number(lookup(row, ["year", "releaseYear", "publishedYear"]));
  const ratingValue = Math.round(Number(lookup(row, ["rating", "myRating", "score"])));
  const relationships = [];
  if (sourceFields.creator) relationships.push({ toType: "person", toLabel: sourceFields.creator, kind: source === "music" ? "performed_by" : source === "books" || source === "manga" ? "written_by" : source === "youtube" ? "published_by" : "created_by", field: "creator" });
  if (sourceFields.series) relationships.push({ toType: "franchise", toLabel: sourceFields.series, kind: source === "podcasts" ? "episode_of" : "part_of", field: "series" });
  if (sourceFields.place) relationships.push({ toType: "place", toLabel: sourceFields.place, kind: source === "trips" ? "visited" : source === "calendar" ? "occurred_at" : "experienced_at", field: "place" });
  return {
    source, externalId, title: sourceFields.title, wing: adapter.wing, type: adapter.type,
    year: Number.isInteger(explicitYear) && explicitYear >= 1000 ? explicitYear : source === "calendar" || source === "trips" ? Number(occurredAt?.slice(0, 4)) || null : null,
    genres: [adapter.genre], status: statusFor(row, source, occurredAt),
    rating: ratingValue >= 1 && ratingValue <= 10 ? ratingValue : null,
    description: clean(lookup(row, ["description", "details", "note", "notes", "comment"])),
    sourceOccurredAt: occurredAt, firstSourceAt: occurredAt, lastSourceAt: occurredAt, occurrences: 1,
    externalUrl: sourceFields.externalUrl || null, creator: sourceFields.creator || null,
    series: sourceFields.series || null, place: sourceFields.place || null, relationships
  };
}

export function getImportAdapters() {
  return Object.entries(ADAPTERS).map(([id, adapter]) => ({ id, ...adapter }));
}

export function inspectImportText(text, { source = "auto", fileName = "archive-export.json", state = getState() } = {}) {
  const { format, rows } = extractRows(String(text || ""), fileName);
  if (!rows.length) throw new Error("The export contains no records.");
  const resolvedSource = source === "auto" ? detectSource(rows, fileName) : source;
  if (!ADAPTERS[resolvedSource]) throw new Error("The source could not be identified. Choose the matching archive wing and scan again.");
  const errors = [], warnings = [];
  const normalized = new Map();
  rows.forEach((row, index) => {
    const result = normalizeRow(row, resolvedSource, index);
    if (result.error) { errors.push(result.error); return; }
    const key = `${resolvedSource}:${result.externalId}`;
    const existing = normalized.get(key);
    if (existing) {
      existing.occurrences++;
      if (result.sourceOccurredAt) {
        existing.firstSourceAt = !existing.firstSourceAt || result.sourceOccurredAt < existing.firstSourceAt ? result.sourceOccurredAt : existing.firstSourceAt;
        existing.lastSourceAt = !existing.lastSourceAt || result.sourceOccurredAt > existing.lastSourceAt ? result.sourceOccurredAt : existing.lastSourceAt;
      }
    } else normalized.set(key, result);
  });
  const currentItems = Object.values(state.items || {});
  const records = [...normalized.values()].map(record => {
    const id = `import_${record.wing}_${resolvedSource}_${hash(record.externalId)}_${hash([...record.externalId].reverse().join(""))}_${slug(record.title).slice(0, 36)}`;
    const exactSource = currentItems.find(item => item.import?.source === resolvedSource && item.import?.externalId === record.externalId);
    const titleConflict = currentItems.find(item => item.wing === record.wing && slug(item.title) === slug(record.title) && (!record.year || !item.year || Number(item.year) === Number(record.year)));
    const conflict = exactSource || titleConflict || state.items?.[id];
    return { ...record, id, action: conflict ? "skip" : "create", reason: conflict ? `Preserving existing record: ${conflict.title}` : null };
  });
  const duplicates = rows.length - normalized.size - errors.length;
  if (duplicates > 0) warnings.push(`${duplicates} repeated activity rows were collapsed into occurrence counts.`);
  const skipped = records.filter(record => record.action === "skip").length;
  if (skipped) warnings.push(`${skipped} existing records will be preserved without overwrite.`);
  return {
    source: resolvedSource, adapterLabel: ADAPTERS[resolvedSource].label, fileName: clean(fileName), format,
    fingerprint: `${resolvedSource}_${hash(String(text || ""))}_${hash([...String(text || "")].reverse().join(""))}_${String(text || "").length}_${rows.length}`,
    analyzedAt: new Date().toISOString(), rowCount: rows.length, duplicates, records, errors, warnings,
    creatable: records.filter(record => record.action === "create").length,
    skipped, rawRetained: false
  };
}

export async function applyImportPlan(plan) {
  if (!plan?.fingerprint || !ADAPTERS[plan.source] || !Array.isArray(plan.records)) throw new Error("The import plan is incomplete.");
  if (getState().metadata.stage28.batches.some(batch => batch.fingerprint === plan.fingerprint && batch.status === "applied")) throw new Error("This exact export is already in the Vault.");
  const records = plan.records.filter(record => record.action === "create");
  if (!records.length) throw new Error("The scan found no new records to import.");
  const live = getState();
  if (records.some(record => live.items[record.id])) throw new Error("The archive changed after preview. Scan the export again before importing.");
  await createArchiveSnapshot(`Protected snapshot before ${plan.source} import`, { kind: "pre_real_import", protected: true });
  const batchId = createId("importbatch"), importedAt = new Date().toISOString();
  const newItems = Object.fromEntries(records.map(record => [record.id, {
    id: record.id, type: record.type, wing: record.wing, title: record.title, year: record.year,
    genres: record.genres, status: record.status, rating: record.rating, note: "", owned: false,
    addedAt: importedAt, description: record.description || "",
    import: {
      source: plan.source, externalId: record.externalId, batchId, fileName: plan.fileName,
      fingerprint: plan.fingerprint, sourceOccurredAt: record.sourceOccurredAt,
      firstSourceAt: record.firstSourceAt, lastSourceAt: record.lastSourceAt,
      occurrences: record.occurrences, externalUrl: record.externalUrl,
      creator: record.creator, series: record.series, place: record.place,
      importedAt, rawRetained: false
    }
  }]));
  const relationState = { ...live, items: { ...live.items, ...newItems } };
  const newRelationships = {};
  for (const record of records) for (const relationship of record.relationships || []) {
    const filed = makeRelationshipRecord({
      fromItemId: record.id, toType: relationship.toType, toLabel: relationship.toLabel, kind: relationship.kind,
      source: `import:${plan.source}`, sourceBatchId: batchId, createdAt: importedAt,
      evidence: { batchId, source: plan.source, externalId: record.externalId, field: relationship.field, value: relationship.toLabel }
    }, relationState);
    if (!live.relationships?.[filed.id]) newRelationships[filed.id] = filed;
  }
  update(save => {
    Object.assign(save.items, newItems);
    Object.assign(save.relationships, newRelationships);
    save.metadata.stage28.batches.push({
      id: batchId, source: plan.source, adapterVersion: 1, fileName: plan.fileName,
      fingerprint: plan.fingerprint, format: plan.format, status: "applied", importedAt,
      rowCount: plan.rowCount, duplicateRows: plan.duplicates, skipped: plan.skipped,
      itemIds: Object.keys(newItems), relationshipIds: Object.keys(newRelationships), rawRetained: false,
      snapshotProtected: true, eventId: null
    });
  });
  const event = emit("IMPORT_BATCH_APPLIED", { wing: ADAPTERS[plan.source].wing, meta: { title: plan.adapterLabel, batchId, records: records.length, source: plan.source } });
  update(save => { save.metadata.stage28.batches.find(batch => batch.id === batchId).eventId = event.id; });
  return batchId;
}

export async function rollbackImportBatch(batchId) {
  const batch = getState().metadata.stage28?.batches?.find(entry => entry.id === batchId);
  if (!batch || batch.status !== "applied") throw new Error("Active import batch not found.");
  await createArchiveSnapshot(`Protected snapshot before rolling back import ${batchId}`, { kind: "pre_import_rollback", protected: true });
  let removedItems = 0, removedRelationships = 0, detachedEvents = 0;
  update(save => {
    const liveBatch = save.metadata.stage28.batches.find(entry => entry.id === batchId);
    const removedItemIds = new Set(liveBatch.itemIds);
    for (const itemId of liveBatch.itemIds) if (save.items[itemId]?.import?.batchId === batchId) { delete save.items[itemId]; removedItems++; }
    for (const [relationshipId, relationship] of Object.entries(save.relationships)) if (removedItemIds.has(relationship.fromItemId)) {
      delete save.relationships[relationshipId];
      removedRelationships++;
      for (const change of save.metadata.stage29.changeLog) if (change.relationshipId === relationshipId && change.status === "applied") {
        change.status = "undone";
        change.undoneAt = new Date().toISOString();
        change.undoneByImportRollback = batchId;
      }
    }
    for (const event of save.events) if (event.itemId && removedItemIds.has(event.itemId)) {
      event.meta = { ...(event.meta || {}), removedItemId: event.itemId, removedByImportRollback: batchId };
      delete event.itemId;
      detachedEvents++;
    }
    liveBatch.status = "rolled_back";
    liveBatch.rolledBackAt = new Date().toISOString();
    liveBatch.rollback = { removedItems, removedRelationships, detachedEvents };
  });
  emit("IMPORT_BATCH_ROLLED_BACK", { meta: { title: batch.source, batchId, removedItems, removedRelationships, detachedEvents } });
  return { removedItems, removedRelationships, detachedEvents };
}

let previewPlan = null;
let loadedText = "";
let loadedName = "";
let selectedSource = "auto";

export function renderImportStation() {
  if (location.hash !== "#/imports") return;
  const batches = [...(getState().metadata.stage28?.batches || [])].reverse();
  document.querySelector("#view").innerHTML = `<section class="import-hero panel"><div><span class="eyebrow">STAGE 28 // REVERSIBLE REAL-DATA INTAKE</span><h2>IMPORT STATION</h2><p>Scan exports locally, review exactly what will change, preserve existing records, then commit behind a protected snapshot.</p></div><div class="import-seal">LOCAL</div></section>
    <section class="panel import-policy"><b>RAW EXPORTS ARE NEVER STORED.</b><span>Imported source dates remain evidence fields. They do not become reconstructed Vault activity.</span></section>
    <div class="adapter-grid">${getImportAdapters().map(adapter => `<article class="panel adapter-card"><span>${esc(adapter.wing)}</span><h3>${esc(adapter.label)}</h3><small>JSON / CSV / TSV${adapter.id === "calendar" ? " / ICS" : ""}</small></article>`).join("")}</div>
    <section class="panel import-controls"><select data-import-source aria-label="Import source"><option value="auto">AUTO-DETECT SOURCE</option>${getImportAdapters().map(adapter => `<option value="${adapter.id}" ${selectedSource === adapter.id ? "selected" : ""}>${esc(adapter.label)}</option>`).join("")}</select><input data-import-file type="file" aria-label="Choose export file" accept=".json,.csv,.tsv,.ics,application/json,text/csv,text/tab-separated-values,text/calendar"><button class="button primary" data-choose-import>CHOOSE EXPORT</button><span>${loadedName ? esc(loadedName) : "NO FILE SCANNED"}</span></section>
    ${previewPlan ? `<section class="panel import-preview"><header><div><small>${esc(previewPlan.source.toUpperCase())} / ${esc(previewPlan.format.toUpperCase())}</small><h3>SCAN MANIFEST</h3></div><button class="button primary" data-apply-import ${previewPlan.creatable ? "" : "disabled"}>IMPORT ${previewPlan.creatable} NEW RECORDS</button></header>
      <div class="voice-vitals"><div class="panel"><b>${previewPlan.rowCount}</b><span>SOURCE ROWS</span></div><div class="panel"><b>${previewPlan.creatable}</b><span>NEW RECORDS</span></div><div class="panel"><b>${previewPlan.skipped}</b><span>PRESERVED CONFLICTS</span></div><div class="panel"><b>${previewPlan.duplicates}</b><span>COLLAPSED REPEATS</span></div></div>
      ${(previewPlan.warnings.length || previewPlan.errors.length) ? `<div class="import-messages">${[...previewPlan.warnings, ...previewPlan.errors].map(message => `<p>${esc(message)}</p>`).join("")}</div>` : ""}
      <div class="import-records">${previewPlan.records.slice(0, 40).map(record => `<article class="${record.action}"><span>${record.action.toUpperCase()}</span><b>${esc(record.title)}</b><small>${esc(record.wing)}${record.occurrences > 1 ? ` / ${record.occurrences} OCCURRENCES` : ""}</small>${record.reason ? `<em>${esc(record.reason)}</em>` : ""}</article>`).join("")}</div></section>` : ""}
    <section class="panel ops-history"><h3>REVERSIBLE IMPORT LEDGER</h3>${batches.map(batch => `<article class="ops-ledger"><span>${new Date(batch.importedAt).toLocaleString()}</span><b>${esc(batch.source.toUpperCase())} / ${batch.itemIds.length} RECORDS</b><em>${batch.status.toUpperCase()}</em><small>${esc(batch.fileName)} / RAW RETAINED: NO</small>${batch.status === "applied" ? `<button class="button danger" data-rollback-import="${batch.id}">ROLL BACK BATCH</button>` : ""}</article>`).join("") || "<p>NO REAL-DATA IMPORTS FILED YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Import Station";
  document.querySelector("#view-code").textContent = "VAULT://IMPORTS";
}

function scanLoadedExport() {
  if (!loadedText) return;
  try { previewPlan = inspectImportText(loadedText, { source: selectedSource, fileName: loadedName }); }
  catch (error) { previewPlan = null; toast("EXPORT SCAN STOPPED", error.message, 8000); }
  renderImportStation();
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-import-graph-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/import-graph.css"; link.dataset.importGraphStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage28) update(save => {
    save.metadata.stage28 = { startedAt: new Date().toISOString(), batches: [], adapterVersions: Object.fromEntries(Object.keys(ADAPTERS).map(id => [id, 1])), protectedImports: true, rawExportsRetained: false };
  });
  document.addEventListener("click", async event => {
    const choose = event.target.closest("[data-choose-import]");
    const apply = event.target.closest("[data-apply-import]");
    const rollback = event.target.closest("[data-rollback-import]");
    if (!choose && !apply && !rollback) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (choose) return document.querySelector("[data-import-file]").click();
      if (apply) {
        const batchId = await applyImportPlan(previewPlan);
        previewPlan = null; loadedText = ""; loadedName = ""; renderImportStation();
        return toast("IMPORT FILED", `Protected batch ${batchId} is now in the archive.`, 7000);
      }
      const result = await rollbackImportBatch(rollback.dataset.rollbackImport);
      renderImportStation(); toast("IMPORT ROLLED BACK", `${result.removedItems} records and ${result.removedRelationships} links removed safely.`, 7000);
    } catch (error) { toast("IMPORT STOPPED", error.message, 8000); }
  }, true);
  document.addEventListener("change", async event => {
    if (event.target.matches("[data-import-source]")) {
      selectedSource = event.target.value; scanLoadedExport(); return;
    }
    if (!event.target.matches("[data-import-file]")) return;
    const file = event.target.files?.[0];
    if (!file) return;
    loadedName = file.name; loadedText = await file.text(); scanLoadedExport();
  }, true);
  on("WING_VISITED", event => { if (event.wing === "imports") setTimeout(renderImportStation, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderImportStation, 0));
  setTimeout(renderImportStation, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
