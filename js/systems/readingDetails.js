import { getState, update } from "../core/store.js";

// Books and comics carry their own details. An EPUB names its cover and describes
// itself in the package manifest; a comic archive opens on its front page. This
// module reads what is already on the drive and fills blanks with it — nothing is
// fetched from the network, and a value you set by hand is never overwritten.

const WRITE_BATCH = 25;
const meta = item => item.bookMeta || item.comicMeta || null;
const isReading = item => item?.wing === "books" || item?.wing === "manga";
const artOf = item => typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url || "";

// Every local file a record can point at, best format first.
export function readingFilesFor(item) {
  const data = meta(item) || {}, paths = [];
  const add = (path, format) => {
    const value = String(path || "").trim();
    if (value && !paths.some(entry => entry.path.toLowerCase() === value.toLowerCase()))
      paths.push({ path: value, format: String(format || value.split(".").pop() || "").toUpperCase() });
  };
  for (const local of data.localFiles || []) add(local.path, local.format);
  for (const volume of data.volumes || []) add(volume.sourcePath, volume.fileFormat);
  add(item.sourcePath, item.format || data.fileFormat);
  add(data.sourcePath, data.fileFormat);
  const rank = format => ["EPUB", "CBZ", "CBR", "CB7", "CBT"].indexOf(format);
  return paths.sort((a, b) => (rank(b.format) - rank(a.format)));
}

// A cover can only come out of a format the reader can open.
const coverable = entry => ["EPUB", "CBZ", "CBR", "CB7", "CBT"].includes(entry.format);

async function post(url, body, request) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": request },
    body: JSON.stringify(body)
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

// Runs on every draw of the two reading catalogs, so it walks the records once and
// resolves each record's files once rather than per counter.
export function readingDetailGaps(state = getState()) {
  const gaps = { records: 0, missingArtwork: 0, artworkAvailable: 0, missingDescription: 0, descriptionAvailable: 0, unreadable: 0 };
  for (const item of Object.values(state.items || {})) {
    if (!isReading(item)) continue;
    gaps.records++;
    const files = readingFilesFor(item);
    const hasArt = Boolean(artOf(item));
    const hasDescription = Boolean(String(item.description || "").trim());
    const canCover = files.some(coverable);
    if (!hasArt) gaps.missingArtwork++;
    if (!hasArt && canCover) gaps.artworkAvailable++;
    if (!hasDescription) gaps.missingDescription++;
    if (!hasDescription && files.some(entry => entry.format === "EPUB")) gaps.descriptionAvailable++;
    if (files.length && !canCover) gaps.unreadable++;
  }
  return gaps;
}

// Pull the cover image out of each record's own file.
export async function fillReadingCovers({ onProgress = () => {}, force = false, limit = 0 } = {}) {
  const state = getState();
  const targets = Object.values(state.items || {})
    .filter(item => isReading(item) && (force || !artOf(item)))
    .map(item => ({ item, file: readingFilesFor(item).find(coverable) }))
    .filter(entry => entry.file);
  const queue = limit > 0 ? targets.slice(0, limit) : targets;
  const result = { total: queue.length, applied: 0, failed: 0 };
  // Every update() redraws the open wing, so covers are written in batches.
  const pending = [];
  const flush = () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    update(save => {
      for (const entry of batch) {
        const record = save.items[entry.id];
        if (!record || (!force && artOf(record))) continue;
        record.artwork = entry.path;
        const data = record.bookMeta || record.comicMeta;
        if (data) {
          data.artworkSource = entry.source || "embedded cover";
          data.artworkCredit = "Cover image from your own copy of the file";
          data.artworkAddedAt = new Date().toISOString();
        }
      }
    });
  };
  for (let index = 0; index < queue.length; index++) {
    await globalThis.__vaultActiveJobControl?.checkpoint?.();
    const { item, file } = queue[index];
    onProgress({ current: index, total: queue.length, phase: "READING EMBEDDED COVERS…", detail: item.title });
    const payload = await post("./__vault/reading/cover", { path: file.path, itemId: item.id }, "reading-cover");
    if (!payload?.ready || !payload.path) { result.failed++; continue; }
    pending.push({ id: item.id, path: payload.path, source: payload.source });
    result.applied++;
    if (pending.length >= WRITE_BATCH || index === queue.length - 1) flush();
  }
  flush();
  onProgress({ current: queue.length, total: queue.length, phase: "COVERS COMPLETE", detail: `${result.applied} filled` });
  return result;
}

// Fill blank descriptions, authors, publishers, years and page counts from the
// package metadata inside each EPUB.
export async function fillReadingDetails({ onProgress = () => {}, limit = 0 } = {}) {
  const state = getState();
  const targets = Object.values(state.items || {})
    .filter(isReading)
    .map(item => ({ item, file: readingFilesFor(item).find(entry => entry.format === "EPUB") }))
    .filter(entry => entry.file && (!String(entry.item.description || "").trim()
      || !(entry.item.authors || []).length || !entry.item.year));
  const queue = limit > 0 ? targets.slice(0, limit) : targets;
  const result = { total: queue.length, descriptions: 0, authors: 0, years: 0, publishers: 0, pages: 0, failed: 0 };
  const pending = [];
  const flush = () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    update(save => {
      for (const { id, details } of batch) {
        const record = save.items[id];
        if (!record) continue;
        const data = record.bookMeta || record.comicMeta;
        if (data?.identityEditedAt) continue;      // the reader edited this by hand
        if (!String(record.description || "").trim() && String(details.description || "").trim()) {
          record.description = details.description; result.descriptions++;
        }
        if (!(record.authors || []).length && (details.authors || []).length) {
          record.authors = details.authors;
          if (record.wing === "manga") record.creator = details.authors.join(", ");
          result.authors++;
        }
        if (!record.year && Number(details.year)) { record.year = Number(details.year); result.years++; }
        if (!String(record.publisher || "").trim() && String(details.publisher || "").trim()) {
          record.publisher = details.publisher; result.publishers++;
        }
        if (data && !Number(data.pageCount) && Number(details.pageCount)) {
          data.pageCount = Number(details.pageCount); result.pages++;
        }
        if (data) {
          data.localMetadataSource = details.metadataSource || data.localMetadataSource;
          data.metadataCheckedAt = new Date().toISOString();
        }
      }
    });
  };
  for (let index = 0; index < queue.length; index++) {
    await globalThis.__vaultActiveJobControl?.checkpoint?.();
    const { item, file } = queue[index];
    onProgress({ current: index, total: queue.length, phase: "READING EMBEDDED DETAILS…", detail: item.title });
    const details = await post("./__vault/reading/metadata", { path: file.path }, "reading-metadata");
    if (!details?.ready) { result.failed++; continue; }
    pending.push({ id: item.id, details });
    if (pending.length >= WRITE_BATCH || index === queue.length - 1) flush();
  }
  flush();
  onProgress({ current: queue.length, total: queue.length, phase: "DETAILS COMPLETE", detail: `${result.descriptions} descriptions` });
  return result;
}

// Both passes, for the wing's single "fill in what the files already know" button.
export async function fillReadingGaps({ onProgress = () => {} } = {}) {
  const details = await fillReadingDetails({ onProgress });
  const covers = await fillReadingCovers({ onProgress });
  return { details, covers };
}
