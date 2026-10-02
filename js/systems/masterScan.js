import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";

// The master scan: read D:, compare against what the Vault saw last time,
// and report what is new, what moved, and what has gone.
//
// The ledger is the point. Without it a scan can only say "here is everything",
// which is why the old one could not tell a moved file from a new one and never
// noticed a deletion at all. With it, the first run is a full read and every run
// after that is a comparison.

const LEDGER = "masterScan";
const REBASELINE_FLAG = "masterScanRebaseline20261001";

// Size plus modified time identifies a file across a move. Two different files
// almost never share both, and a move changes neither.
const signature = file => `${Number(file.bytes || 0)}:${String(file.lastWriteUtc || "")}`;
const lower = value => String(value || "").toLowerCase();

export const masterScanSummary = (state = getState()) => {
  const ledger = state.metadata?.[LEDGER];
  if (!ledger?.scannedAt) return null;
  return {
    scannedAt: ledger.scannedAt,
    fileCount: Number(ledger.fileCount || 0),
    durationMs: Number(ledger.durationMs || 0),
    pendingReview: (ledger.review || []).filter(entry => entry.status === "pending").length,
    missing: (ledger.missing || []).length,
    lastRun: ledger.lastRun || null
  };
};

// Every path the archive currently points at, and the record that owns it.
function pathOwners(state) {
  const owners = new Map();
  const add = (path, itemId, field) => {
    if (path) owners.set(lower(path), { itemId, field });
  };
  for (const item of Object.values(state.items || {})) {
    add(item.sourcePath, item.id, "sourcePath");
    const book = item.bookMeta, comic = item.comicMeta;
    for (const local of (book?.localFiles || [])) add(local.path, item.id, "bookFile");
    for (const volume of (comic?.volumes || [])) add(volume.sourcePath, item.id, "comicVolume");
    // Episodes carry their path as sourcePath; filePath exists on older records.
    for (const episode of Object.values(item.episodes || {})) {
      add(episode.sourcePath, item.id, "episode");
      add(episode.filePath, item.id, "episode");
    }
  }
  return owners;
}

export async function initializeMasterScanBaseline({ onProgress = () => {}, force = false } = {}) {
  const existing = getState().metadata?.[LEDGER];
  if (!force && existing?.scannedAt && (existing.files || []).length) return null;

  onProgress({ phase: "BUILDING D: BASELINE…", detail: "Read only — current library files become the starting point." });
  const response = await fetch("./__vault/master-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "master-scan" },
    body: "{}"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.scanned) throw new Error("The drive baseline could not finish.");

  const result = {
    firstRun: true,
    baselineOnly: true,
    fileCount: Number(payload.fileCount || 0),
    durationMs: Number(payload.durationMs || 0),
    truncated: Boolean(payload.truncated),
    added: 0,
    moved: 0,
    changed: 0,
    removed: 0,
    repointed: 0,
    flagged: 0,
    unchanged: Number(payload.fileCount || 0),
    at: payload.scannedAt
  };

  update(save => {
    save.metadata[LEDGER] = {
      scannedAt: payload.scannedAt,
      fileCount: Number(payload.fileCount || 0),
      durationMs: Number(payload.durationMs || 0),
      truncated: Boolean(payload.truncated),
      files: (payload.files || []).map(file => ({
        id: file.id, path: file.path, bytes: file.bytes,
        lastWriteUtc: file.lastWriteUtc, kind: file.kind, extension: file.extension
      })),
      review: [],
      missing: [],
      lastRun: result
    };
  });

  onProgress({ phase: "D: BASELINE READY", detail: `${result.fileCount} files remembered. Future scans will report only changes.` });
  return result;
}

export async function runMasterScan({ onProgress = () => {} } = {}) {
  onProgress({ phase: "READING D:…", detail: "Read only — nothing is moved or deleted." });
  const response = await fetch("./__vault/master-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "master-scan" },
    body: "{}"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.scanned) throw new Error("The drive scan could not finish.");
  await globalThis.__vaultActiveJobControl?.checkpoint?.();

  const state = getState();
  const previous = state.metadata?.[LEDGER]?.files || [];
  const firstRun = !previous.length;

  // The first run is a baseline, not an import. Everything already on the
  // organized library drive existed before the ledger did, so remembering those
  // files as "new" would flood Review with thousands of extras and specials.
  if (firstRun) {
    const result = {
      firstRun: true,
      fileCount: payload.fileCount,
      durationMs: payload.durationMs,
      truncated: Boolean(payload.truncated),
      added: 0, moved: 0, changed: 0, removed: 0,
      repointed: 0, flagged: 0,
      unchanged: payload.fileCount,
      needsSorting: 0
    };
    update(save => {
      save.metadata[LEDGER] = {
        scannedAt: payload.scannedAt,
        fileCount: payload.fileCount,
        durationMs: payload.durationMs,
        truncated: Boolean(payload.truncated),
        files: (payload.files || []).map(file => ({
          id: file.id, path: file.path, bytes: file.bytes,
          lastWriteUtc: file.lastWriteUtc, kind: file.kind, extension: file.extension
        })),
        review: [],
        missing: [],
        lastRun: { ...result, baseline: true, at: payload.scannedAt }
      };
    });
    onProgress({ phase: "BASELINE REMEMBERED", detail: `${payload.fileCount} current library files remembered. Future scans will report only changes.` });
    return result;
  }

  onProgress({ phase: "COMPARING AGAINST THE LAST SCAN…", total: payload.fileCount });
  const beforeById = new Map(previous.map(file => [file.id, file]));
  const beforeBySignature = new Map();
  for (const file of previous) {
    const key = signature(file);
    beforeBySignature.set(key, [...(beforeBySignature.get(key) || []), file]);
  }

  const seen = new Set();
  const added = [], moved = [], changed = [];
  for (const file of payload.files || []) {
    seen.add(file.id);
    const known = beforeById.get(file.id);
    if (known) {
      if (signature(known) !== signature(file)) changed.push(file);
      continue;
    }
    // Not at this path last time: the same bytes somewhere else means it moved.
    const candidates = (beforeBySignature.get(signature(file)) || []).filter(entry => !seen.has(entry.id));
    const origin = candidates.find(entry => !(payload.files || []).some(current => current.id === entry.id));
    if (origin) moved.push({ ...file, from: origin.path });
    else added.push(file);
  }
  const movedFrom = new Set(moved.map(entry => lower(entry.from)));
  const removed = previous.filter(file => !seen.has(file.id) && !movedFrom.has(lower(file.path)));

  // Follow moved files so records keep working, and flag the ones that are gone.
  const owners = pathOwners(state);
  let repointed = 0, flagged = 0;
  update(save => {
    for (const entry of moved) {
      const owner = owners.get(lower(entry.from));
      if (!owner) continue;
      const record = save.items[owner.itemId];
      if (!record) continue;
      if (owner.field === "sourcePath" && lower(record.sourcePath) === lower(entry.from)) {
        record.sourcePath = entry.path;
        if (record.bookMeta?.sourcePath && lower(record.bookMeta.sourcePath) === lower(entry.from)) record.bookMeta.sourcePath = entry.path;
        if (record.comicMeta?.sourcePath && lower(record.comicMeta.sourcePath) === lower(entry.from)) record.comicMeta.sourcePath = entry.path;
        repointed++;
      }
      for (const local of (record.bookMeta?.localFiles || [])) {
        if (lower(local.path) === lower(entry.from)) { local.path = entry.path; repointed++; }
      }
      for (const volume of (record.comicMeta?.volumes || [])) {
        if (lower(volume.sourcePath) === lower(entry.from)) { volume.sourcePath = entry.path; repointed++; }
      }
      for (const episode of Object.values(record.episodes || {})) {
        if (lower(episode.sourcePath) === lower(entry.from)) { episode.sourcePath = entry.path; episode.linkStatus = "linked"; repointed++; }
        else if (lower(episode.filePath) === lower(entry.from)) { episode.filePath = entry.path; episode.linkStatus = "linked"; repointed++; }
      }
    }
    // A record whose file is gone keeps everything it holds and says so.
    for (const file of removed) {
      const owner = owners.get(lower(file.path));
      if (!owner) continue;
      const record = save.items[owner.itemId];
      if (!record) continue;
      for (const episode of Object.values(record.episodes || {})) {
        if (lower(episode.sourcePath) === lower(file.path) || lower(episode.filePath) === lower(file.path)) {
          episode.linkStatus = "missing"; flagged++;
        }
      }
      if (owner.field === "sourcePath" && lower(record.sourcePath) === lower(file.path)) {
        record.fileMissing = true;
        flagged++;
      }
    }
  });

  onProgress({ phase: "WRITING THE LEDGER…", detail: `${added.length} new · ${moved.length} moved · ${removed.length} gone` });
  const result = {
    firstRun,
    fileCount: payload.fileCount,
    durationMs: payload.durationMs,
    truncated: Boolean(payload.truncated),
    added: added.length,
    moved: moved.length,
    changed: changed.length,
    removed: removed.length,
    repointed,
    flagged,
    unchanged: payload.fileCount - added.length - moved.length - changed.length
  };

  update(save => {
    const ledger = save.metadata[LEDGER] || {};
    // The sorting queue survives scans. Rebuilding it from this run's additions
    // alone would drop everything still waiting from the run before.
    const priorReview = new Map((ledger.review || []).map(entry => [entry.id, entry]));
    const stillOnDisk = new Set((payload.files || []).map(file => file.id));
    const carried = (ledger.review || []).filter(entry =>
      stillOnDisk.has(entry.id) && !owners.has(lower(entry.path)));
    // Only files that are new to the archive need sorting; a move is already solved.
    const unowned = added.filter(file => !owners.has(lower(file.path)) && !priorReview.has(file.id));
    save.metadata[LEDGER] = {
      scannedAt: payload.scannedAt,
      fileCount: payload.fileCount,
      durationMs: payload.durationMs,
      truncated: Boolean(payload.truncated),
      files: (payload.files || []).map(file => ({
        id: file.id, path: file.path, bytes: file.bytes,
        lastWriteUtc: file.lastWriteUtc, kind: file.kind, extension: file.extension
      })),
      review: [
        ...carried,
        ...unowned.map(file => ({
          id: file.id, path: file.path, name: file.name, kind: file.kind,
          extension: file.extension, bytes: file.bytes, status: "pending",
          foundAt: payload.scannedAt
        }))
      ],
      missing: removed.map(file => ({ id: file.id, path: file.path, kind: file.kind, noticedAt: payload.scannedAt })),
      lastRun: { ...result, at: payload.scannedAt }
    };
  });

  result.needsSorting = (getState().metadata[LEDGER].review || []).filter(entry => entry.status === "pending").length;
  onProgress({ phase: "SCAN COMPLETE", detail: `${result.added} new · ${result.moved} moved · ${result.removed} missing` });
  return result;
}

// ---------------------------------------------------------------------------
// Sorting what the scan found.
//
// The AI decides which wing a file belongs to. What happens next depends on how
// safe the answer is to act on:
//
//   books / comics  the file itself carries its metadata, so a confident verdict
//                   is acted on and the record is built from the file, not the guess
//   tv              only linked when the filename states a season and episode AND
//                   the series is already in the archive. Inventing series from
//                   folder names is what put 134 fake shows in here once already
//   everything else the verdict is recorded as a suggestion and waits for you
//
// Audio is not scanned at all. Music is a Spotify listening record here, not a
// library of files, so local audio has nowhere to be filed and is not looked for.
// ---------------------------------------------------------------------------

const BATCH = 40;
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const EPISODE_CODE = /\bs(\d{1,2})\s*e(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b/i;

// A film's release year as the filename states it — "Blade Runner (1982).mkv".
function yearFrom(path) {
  const name = String(path || "").split(/[\\/]/).pop() || "";
  const match = /\b(19\d{2}|20\d{2})\b/.exec(name);
  return match ? Number(match[1]) : 0;
}

function episodeNumbersFrom(path) {
  const match = EPISODE_CODE.exec(String(path || "").split(/[\\/]/).pop() || "");
  if (!match) return null;
  const season = Number(match[1] ?? match[3]), episode = Number(match[2] ?? match[4]);
  return Number.isFinite(season) && Number.isFinite(episode) ? { season, episode } : null;
}

async function identifyBatch(files) {
  const response = await fetch("./__vault/master-scan/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "master-scan-identify" },
    body: JSON.stringify({
      files: files.map(file => ({
        fileId: file.id, path: file.path, name: file.name,
        extension: file.extension, kind: file.kind
      }))
    })
  });
  if (response.status === 503) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error === "ai_not_configured"
      ? "The Vault's AI is not configured, so files cannot be sorted automatically."
      : "AI identification is unavailable right now.");
  }
  if (response.status === 429) throw new Error("AI identification is busy. Try again shortly.");
  if (!response.ok) throw new Error("AI identification failed.");
  const payload = await response.json().catch(() => ({}));
  return new Map((payload.results || []).map(result => [result.fileId, result]));
}

// Matches the trim the one-time reading repair applies, so a book filed by the AI
// reads the same as a book filed by the repair.
function bookTitleFrom(details, verdict) {
  const raw = String(details.title || verdict.title || "").trim();
  const series = String(details.seriesName || "").trim();
  if (!series || !raw) return raw || series;
  const escaped = series.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s*[-–:]\\s*(?:\\d{1,3}(?:\\.\\d+)?\\s*[-–:]\\s*)?(.+)$`).exec(raw);
  return match && match[1].trim().length >= 2 ? match[1].trim() : raw;
}

async function readingDetailsFor(path) {
  const response = await fetch("./__vault/reading/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "reading-metadata" },
    body: JSON.stringify({ path })
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.ready ? payload : null;
}

export async function sortMasterScanFiles({ onProgress = () => {}, limit = 0 } = {}) {
  const ledger = getState().metadata?.[LEDGER];
  const pending = (ledger?.review || []).filter(entry => entry.status === "pending" && !entry.verdict);
  const queue = limit > 0 ? pending.slice(0, limit) : pending;
  const result = { total: queue.length, identified: 0, filedBooks: 0, filedComics: 0, linkedEpisodes: 0, linkedFilms: 0, stagedGames: 0, suggested: 0, ignored: 0, failed: 0 };
  if (!queue.length) return result;

  for (let start = 0; start < queue.length; start += BATCH) {
    await globalThis.__vaultActiveJobControl?.checkpoint?.();
    const batch = queue.slice(start, start + BATCH);
    onProgress({ phase: "ASKING THE VAULT'S AI WHERE THESE BELONG…", current: start, total: queue.length });
    let verdicts;
    try { verdicts = await identifyBatch(batch); }
    catch (error) { if (start === 0) throw error; result.failed += batch.length; continue; }

    // Reading files are built from the file's own metadata, so fetch that first.
    const readingDetails = new Map();
    for (const file of batch) {
      const verdict = verdicts.get(file.id);
      if (!verdict || verdict.confidence !== "high") continue;
      if (verdict.wing !== "books" && verdict.wing !== "manga") continue;
      const details = await readingDetailsFor(file.path);
      if (details) readingDetails.set(file.id, details);
    }

    onProgress({ phase: "FILING WHAT IS SAFE TO FILE…", current: start + batch.length, total: queue.length });
    update(save => {
      const state = save;
      const seriesByTitle = new Map(Object.values(state.items || {})
        .filter(item => item.wing === "tv").map(item => [norm(item.title), item]));
      const entries = new Map((state.metadata[LEDGER].review || []).map(entry => [entry.id, entry]));

      for (const file of batch) {
        const verdict = verdicts.get(file.id);
        const entry = entries.get(file.id);
        if (!entry) continue;
        if (!verdict) { result.failed++; continue; }
        result.identified++;
        entry.verdict = {
          wing: verdict.wing, title: verdict.title, confidence: verdict.confidence,
          reason: verdict.reason, season: verdict.season ?? null, episode: verdict.episode ?? null,
          decidedAt: new Date().toISOString()
        };

        if (verdict.wing === "ignore") {
          entry.status = "ignored";
          entry.ignoredReason = verdict.reason || "not a work in its own right";
          result.ignored++;
          continue;
        }

        const confident = verdict.confidence === "high";

        // Books and comics: the file describes itself, so the record is real.
        if (confident && (verdict.wing === "books" || verdict.wing === "manga")) {
          const details = readingDetails.get(file.id);
          if (!details) { result.suggested++; continue; }
          const id = createId(verdict.wing === "books" ? "book_file" : "comic_file");
          const addedAt = new Date().toISOString();
          // A comic record is the series; a book record is the book. "Star Trek: The
          // Original Series - 054 - The Lost Years" is a shelf label glued to a title,
          // and the series is recorded separately, so the record reads "The Lost Years".
          const title = verdict.wing === "manga"
            ? String(details.seriesName || details.title || verdict.title || "").trim()
            : bookTitleFrom(details, verdict);
          if (!title) { result.suggested++; continue; }
          if (verdict.wing === "books") {
            state.items[id] = {
              id, wing: "books", type: "book", title,
              authors: details.authors || [], publisher: details.publisher || "",
              year: Number(details.year) || null, genres: details.genres || [],
              description: details.description || "", format: file.extension,
              artwork: "", owned: true, favorite: false, addedAt, sourcePath: file.path,
              bookMeta: {
                curated: true, status: "planned", pageCount: Number(details.pageCount) || 0,
                currentPage: 0, percent: 0, kindleOwned: false, audibleOwned: false, notes: "",
                isbn: details.isbn || "", seriesName: details.seriesName || "",
                seriesPosition: details.seriesPosition ?? null,
                seriesConfidence: details.seriesName ? details.confidence || "medium" : "",
                fileFormat: file.extension, sourcePath: file.path, localFiles: [],
                readerProgress: 0, addedFromDriveScan: true,
                localMetadataSource: details.metadataSource || "filename",
                metadataStatus: details.confidence || "local", addedAt, sortedByAi: true
              }
            };
            state.items[id].bookMeta.localFiles = [{ path: file.path, format: file.extension, bytes: Number(file.bytes || 0), lastWriteUtc: "" }];
            result.filedBooks++;
          } else {
            const number = Number.isFinite(Number(details.seriesPosition)) ? Number(details.seriesPosition) : 1;
            state.items[id] = {
              id, wing: "manga", type: "comic", title,
              creator: (details.authors || []).join(", "), publisher: details.publisher || "",
              year: Number(details.year) || null, genres: ["Comics"], description: details.description || "",
              artwork: "", owned: true, favorite: false, addedAt, sourcePath: file.path,
              comicMeta: {
                format: "comic", readingStatus: "planned", publicationStatus: "unknown",
                progressUnit: "volumes", readThrough: 0, latestKnown: number, releaseLane: "manual",
                monitoring: false, hidden: false, releases: [], volumes: [],
                sourcePath: file.path, fileFormat: file.extension, readerProgress: 0,
                addedFromDriveScan: true, sortedByAi: true,
                readingAccess: { preferred: "local", webUrl: "", kindleOwned: false, kindleUrl: "" }
              }
            };
            state.items[id].comicMeta.volumes = [{
              number, title: details.title || `Issue ${number}`, sourcePath: file.path,
              fileFormat: file.extension, pageCount: Number(details.pageCount) || 0,
              bytes: Number(file.bytes || 0), lastWriteUtc: "", owned: true, read: false,
              metadataSource: details.metadataSource || "filename"
            }];
            result.filedComics++;
          }
          entry.status = "added";
          entry.itemId = id;
          continue;
        }

        // Television: link an episode to a series that already exists, and only when
        // the filename itself states which episode it is.
        if (confident && verdict.wing === "tv") {
          const numbers = episodeNumbersFrom(file.path)
            || (Number.isFinite(verdict.season) && Number.isFinite(verdict.episode)
              ? { season: verdict.season, episode: verdict.episode } : null);
          const series = seriesByTitle.get(norm(verdict.title));
          if (numbers && series) {
            const record = state.items[series.id];
            // Episode records number the episode as `number`.
            const episode = Object.values(record.episodes || {}).find(value =>
              Number(value.season) === numbers.season && Number(value.number) === numbers.episode);
            // Never replace a link that already works — a second copy is not an upgrade.
            if (episode && !episode.sourcePath && !episode.filePath) {
              episode.sourcePath = file.path;
              episode.linkStatus = "linked";
              episode.linkedBy = "master scan";
              entry.status = "added";
              entry.itemId = series.id;
              result.linkedEpisodes++;
              continue;
            }
          }
        }

        // Films: attach a file to a film you already have. Like television, this
        // never creates a record — 2,562 of your film records have no file, so the
        // useful move is connecting them, not inventing more.
        if (confident && verdict.wing === "movies") {
          const wanted = norm(verdict.title);
          const year = Number(verdict.year) || yearFrom(file.path);
          const matches = Object.values(state.items || {}).filter(candidate =>
            candidate.wing === "movies" && norm(candidate.title) === wanted);
          // A remake shares its title, so a year has to settle it.
          const exact = matches.length === 1
            ? matches[0]
            : matches.filter(candidate => year && Number(candidate.year) === year);
          const target = Array.isArray(exact) ? (exact.length === 1 ? exact[0] : null) : exact;
          if (target && !target.sourcePath) {
            const record = state.items[target.id];
            record.sourcePath = file.path;
            record.owned = true;
            record.linkedBy = "master scan";
            entry.status = "added";
            entry.itemId = target.id;
            result.linkedFilms++;
            continue;
          }
        }

        // Steam manifests belong in the Games import review, which is already the
        // place you confirm a game before it enters the archive.
        if (verdict.wing === "games" && file.extension === "ACF") {
          const appId = (/appmanifest_(\d+)\.acf$/i.exec(file.path) || [])[1];
          if (appId) {
            state.metadata.games ||= {};
            const review = state.metadata.games.importReview || [];
            const key = `steam:${appId}`;
            if (!review.some(candidate => candidate.key === key)) {
              review.push({
                key, source: "steam", appId, title: verdict.title || `Steam app ${appId}`,
                minutes: 0, lastPlayed: 0, installed: true, path: file.path, sizeGb: 0,
                status: "pending", discoveredAt: new Date().toISOString(),
                discoveredVia: "master scan"
              });
              state.metadata.games.importReview = review;
            }
            entry.status = "added";
            result.stagedGames++;
            continue;
          }
        }

        // Everything else keeps its verdict and waits for you.
        result.suggested++;
      }
    });
  }

  onProgress({ phase: "SORTING COMPLETE", detail: `${result.filedBooks + result.filedComics} filed · ${result.linkedEpisodes + result.linkedFilms} linked · ${result.suggested} waiting` });
  return result;
}

export function masterScanSuggestions(state = getState()) {
  const review = state.metadata?.[LEDGER]?.review || [];
  const groups = new Map();
  for (const entry of review) {
    if (entry.status !== "pending" || !entry.verdict) continue;
    const wing = entry.verdict.wing || "unsorted";
    groups.set(wing, [...(groups.get(wing) || []), entry]);
  }
  return [...groups.entries()].map(([wing, entries]) => ({ wing, entries }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

export function ignoreMasterScanFiles(ids = []) {
  const wanted = new Set(ids);
  let count = 0;
  update(save => {
    for (const entry of (save.metadata[LEDGER]?.review || [])) {
      if (!wanted.size || wanted.has(entry.id)) {
        if (entry.status === "pending") { entry.status = "ignored"; count++; }
      }
    }
  });
  return count;
}
