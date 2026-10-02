import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";

// One-time Books / Comics repair.
//
// The whole-drive reading scan walked C: first under a shared file cap, spent it
// on developer documentation, and never reached D: — so the reading library was
// invisible to the Vault while 29 README and pytest files sat in Books as if they
// were novels. The scan is fixed in the server; this applies the consequences to
// the archive: the fake books come out, the real ones go in, and copies of one
// book in several formats become a single record.
const PLAN_URL = "./data/repair/reading-plan.json";
const FLAG = "readingRepair20260912";

const norm = value => String(value || "").toLowerCase();
const filled = value => value !== undefined && value !== null && String(value).trim() !== "";

function localFileEntry(file) {
  return { path: file.path, format: file.format, bytes: Number(file.bytes || 0), lastWriteUtc: file.lastWriteUtc || "" };
}

function attachFiles(data, files) {
  data.localFiles ||= [];
  let added = 0;
  for (const file of files) {
    if (data.localFiles.some(entry => norm(entry.path) === norm(file.path))) continue;
    data.localFiles.push(localFileEntry(file));
    added++;
  }
  data.sourcePath ||= files[0]?.path || "";
  data.fileFormat ||= files[0]?.format || "";
  return added;
}

export async function runReadingRepair({ onProgress = () => {} } = {}) {
  if (getState().metadata?.maintenance?.[FLAG]) return null;
  const response = await fetch(PLAN_URL, { cache: "no-store" });
  if (!response.ok) return null;
  const plan = await response.json();
  if (!plan || plan.version !== 1) return null;

  await createArchiveSnapshot("Before the Books and Comics repair");
  const summary = {
    junkRemoved: 0, booksAdded: 0, booksLinked: 0, filesLinked: 0,
    comicsLinked: 0, issuesLinked: 0, seriesGrouped: 0, unreadableFlagged: 0
  };
  const addedAt = new Date().toISOString();

  onProgress({ phase: "REMOVING FILES THAT WERE NEVER BOOKS…" });
  update(save => {
    save.metadata.removedCards ||= [];
    for (const entry of plan.removeJunk || []) {
      const record = save.items[entry.id];
      if (!record) continue;
      save.metadata.removedCards.push({
        id: entry.id, item: JSON.parse(JSON.stringify(record)),
        title: record.title || entry.title || "Untitled card",
        wing: record.wing || "books", removedAt: addedAt, reason: entry.reason
      });
      delete save.items[entry.id];
      summary.junkRemoved++;
    }
    // Stop the fixed scan from offering the same developer files again.
    const ledger = save.metadata.readingDriveScan;
    if (ledger?.files) {
      const junkPaths = new Set((plan.removeJunk || []).map(entry => norm(entry.path)));
      for (const file of ledger.files) {
        if (junkPaths.has(norm(file.path)) || ["MD", "HTML", "HTM", "RTF", "XPS"].includes(String(file.extension || "").toUpperCase())) {
          if (file.status === "pending" || junkPaths.has(norm(file.path))) {
            file.status = "ignored";
            file.resolvedAs = "ignore";
            file.resolvedAt = addedAt;
            file.ignoredReason = "not a book — filed by the drive scan before it was fixed";
          }
        }
      }
    }
  });

  onProgress({ phase: "LINKING FILES TO BOOKS YOU ALREADY HAVE…" });
  update(save => {
    for (const entry of plan.linkBooks || []) {
      const record = save.items[entry.itemId];
      if (!record?.bookMeta) continue;
      summary.filesLinked += attachFiles(record.bookMeta, entry.files);
      record.owned = true;
      record.sourcePath ||= entry.files[0]?.path || "";
      if (!record.format) record.format = entry.files[0]?.format || "";
      summary.booksLinked++;
    }
  });

  onProgress({ phase: "ADDING THE BOOKS ON YOUR DRIVE…" });
  const queue = plan.createBooks || [], total = queue.length, BATCH = 400;
  // Each update() notifies every subscriber, which redraws the open wing. Adding the
  // books in batches keeps that to a handful of redraws instead of one per book.
  for (let start = 0; start < total; start += BATCH) {
    const batch = queue.slice(start, start + BATCH);
    onProgress({ phase: "ADDING THE BOOKS ON YOUR DRIVE…", current: start, total });
    update(save => {
      for (const entry of batch) {
        const id = createId("book_file");
        save.items[id] = {
          id, wing: "books", type: "book", title: entry.title,
          authors: entry.authors || [], publisher: entry.publisher || "",
          year: Number(entry.year) || null, genres: entry.genres || [],
          description: entry.description || "", format: entry.files[0]?.format || "",
          artwork: "", owned: true, favorite: false, addedAt,
          sourcePath: entry.files[0]?.path || "",
          bookMeta: {
            curated: true, status: "planned", pageCount: Number(entry.pageCount) || 0,
            currentPage: 0, percent: 0, kindleOwned: false, audibleOwned: false, notes: "",
            isbn: entry.isbn || "", seriesName: entry.seriesName || "",
            seriesPosition: entry.seriesPosition ?? null,
            seriesConfidence: entry.seriesName ? entry.confidence || "medium" : "",
            fileFormat: entry.files[0]?.format || "", sourcePath: entry.files[0]?.path || "",
            localFiles: [], readerProgress: 0, addedFromDriveScan: true,
            localMetadataSource: entry.metadataSource || "filename",
            metadataStatus: entry.confidence || "local", addedAt,
            readableInVault: entry.readable !== false
          }
        };
        // The draft stores a copy, so mutate the record as the store holds it.
        save.items[id].bookMeta.localFiles = entry.files.map(localFileEntry);
        summary.booksAdded++;
        summary.filesLinked += entry.files.length;
        if (entry.seriesName) summary.seriesGrouped++;
        if (entry.readable === false) summary.unreadableFlagged++;
      }
    });
  }

  onProgress({ phase: "FILING COMIC ISSUES…" });
  update(save => {
    for (const entry of plan.linkComics || []) {
      const record = save.items[entry.itemId];
      if (!record?.comicMeta) continue;
      record.comicMeta.volumes ||= [];
      const volumes = record.comicMeta.volumes;
      const used = new Set(volumes.map(volume => Number(volume.number)).filter(Number.isFinite));
      for (const issue of entry.issues || []) {
        if (volumes.some(volume => norm(volume.sourcePath) === norm(issue.path))) continue;
        let number = Number.isFinite(Number(issue.number)) ? Number(issue.number) : 1;
        while (used.has(number)) number++;
        used.add(number);
        volumes.push({
          number, title: issue.title || `Issue ${number}`, sourcePath: issue.path,
          fileFormat: issue.format, pageCount: Number(issue.pageCount) || 0,
          bytes: Number(issue.bytes || 0), lastWriteUtc: issue.lastWriteUtc || "",
          owned: true, read: false, metadataSource: issue.metadataSource || "filename"
        });
        summary.issuesLinked++;
      }
      volumes.sort((a, b) => Number(a.number) - Number(b.number));
      record.comicMeta.latestKnown = Math.max(Number(record.comicMeta.latestKnown || 0),
        ...volumes.map(volume => Number(volume.number) || 0));
      record.owned = true;
      summary.comicsLinked++;
    }
  });

  update(save => {
    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = {
      completedAt: new Date().toISOString(), planVersion: plan.version,
      source: plan.source, ...summary
    };
  });
  await flushPersistence();
  return summary;
}
