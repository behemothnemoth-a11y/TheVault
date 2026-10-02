import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { toast } from "../ui/notifications.js";

const PLAN_URL = "./data/repair/missing-file-review-20261001.json";
let planPromise = null;
let snapshotPromise = null;
const lower = value => String(value || "").toLowerCase();

async function plan() {
  if (!planPromise) {
    planPromise = fetch(PLAN_URL, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Missing-file review plan is unavailable.");
      return response.json();
    });
  }
  return planPromise;
}

function decisions(state = getState()) {
  return state.metadata?.missingFileReview?.decisions || {};
}

function currentPaths(state = getState()) {
  const paths = new Set();
  for (const item of Object.values(state.items || {})) {
    const add = value => { if (value) paths.add(lower(value)); };    add(item.sourcePath);
    for (const value of item.sourcePaths || []) add(value);
    const book = item.bookMeta || {};
    add(book.sourcePath);
    for (const file of book.localFiles || []) add(file.path);
    const comic = item.comicMeta || {};
    add(comic.sourcePath);
    for (const volume of comic.volumes || []) add(volume.sourcePath);
    for (const episode of Object.values(item.episodes || {})) {
      add(episode.sourcePath);
      add(episode.filePath);
    }
  }
  return paths;
}

export function missingFileReviewCount(state = getState()) {
  const decided = Object.keys(decisions(state)).length;
  return Math.max(0, 120 - decided);
}

function replacePath(save, oldPath, newPath) {
  const wanted = lower(oldPath);
  let changed = 0;  const swap = value => {
    if (!value || lower(value) !== wanted) return value;
    changed++;
    return newPath;
  };

  for (const item of Object.values(save.items || {})) {
    const before = item.sourcePath;
    item.sourcePath = swap(item.sourcePath);
    if (before !== item.sourcePath) delete item.fileMissing;

    if (Array.isArray(item.sourcePaths)) {
      item.sourcePaths = [...new Set(item.sourcePaths.map(swap))];
    }
    const book = item.bookMeta || {};
    book.sourcePath = swap(book.sourcePath);
    for (const file of book.localFiles || []) file.path = swap(file.path);
    const comic = item.comicMeta || {};
    comic.sourcePath = swap(comic.sourcePath);
    for (const volume of comic.volumes || []) volume.sourcePath = swap(volume.sourcePath);

    for (const episode of Object.values(item.episodes || {})) {
      const oldSource = episode.sourcePath, oldFile = episode.filePath;
      episode.sourcePath = swap(episode.sourcePath);
      episode.filePath = swap(episode.filePath);
      if (oldSource !== episode.sourcePath || oldFile !== episode.filePath) {
        episode.linkStatus = "linked";
      }
    }
  }
  return changed;
}async function ensureSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = createArchiveSnapshot(
      "Protected backup before missing-file relink review",
      { kind: "missing_file_relink", protected: true }
    ).catch(error => {
      snapshotPromise = null;
      throw error;
    });
  }
  return snapshotPromise;
}

function recordDecision(save, entry, decision, candidate = "") {
  save.metadata.missingFileReview ||= { decisions: {}, history: [] };
  save.metadata.missingFileReview.decisions ||= {};
  const row = {
    entryId: entry.id, oldPath: entry.oldPath, title: entry.title,
    decision, candidate, at: new Date().toISOString()
  };
  save.metadata.missingFileReview.decisions[entry.id] = row;
  save.metadata.missingFileReview.history ||= [];
  save.metadata.missingFileReview.history = [row, ...save.metadata.missingFileReview.history].slice(0, 1000);
}

export async function relinkMissingFile(entryId, candidatePath) {
  const data = await plan();
  const entry = data.entries.find(value => value.id === entryId);
  if (!entry) throw new Error("Missing-file review entry was not found.");
  const candidate = (entry.candidates || []).find(value => lower(value.path) === lower(candidatePath));
  if (!candidate) throw new Error("That candidate is not part of the review plan.");  const onDisk = new Set((getState().metadata?.masterScan?.files || []).map(file => lower(file.path)));
  if (!onDisk.has(lower(candidate.path))) throw new Error("That candidate is no longer on the current D: baseline.");

  await ensureSnapshot();
  let changed = 0;
  update(save => {
    changed = replacePath(save, entry.oldPath, candidate.path);
    recordDecision(save, entry, "relinked", candidate.path);
  });
  await flushPersistence();
  toast("FILE RELINKED", changed
    ? `${changed} saved reference${changed === 1 ? "" : "s"} now point to the reviewed file.`
    : "The old path was no longer present.");
  return { changed, entry };
}

export async function keepMissingFile(entryId) {
  const data = await plan();
  const entry = data.entries.find(value => value.id === entryId);
  if (!entry) throw new Error("Missing-file review entry was not found.");
  update(save => recordDecision(save, entry, "keep_missing"));
  await flushPersistence();
  toast("LEFT MARKED MISSING", entry.title || entry.oldPath);
  return entry;
}

export async function relinkAllExactMissingFiles() {
  const data = await plan();
  const done = decisions();
  const entries = data.entries.filter(entry =>
    entry.matchType === "exact_unique" && !done[entry.id] && entry.candidates?.length === 1);
  if (!entries.length) return { entries: 0, references: 0 };  await ensureSnapshot();
  let references = 0;
  update(save => {
    for (const entry of entries) {
      const candidate = entry.candidates[0];
      references += replacePath(save, entry.oldPath, candidate.path);
      recordDecision(save, entry, "relinked", candidate.path);
    }
  });
  await flushPersistence();
  toast("EXACT FILES RELINKED", `${entries.length} paths approved · ${references} saved references repaired.`);
  return { entries: entries.length, references };
}

const labelFor = type => ({
  exact_unique: "EXACT",
  exact_multiple: "MULTIPLE EXACT COPIES",
  episode_match: "EPISODE MATCH",
  renamed_suggestion: "RENAMED SUGGESTION",
  still_missing: "STILL MISSING"
}[type] || "REVIEW");

function candidateRows(entry) {
  if (!(entry.candidates || []).length) {
    return `<p class="missing-review-empty">No trustworthy candidate exists on the current D: baseline.</p>`;
  }
  return `<div class="missing-review-candidates">${entry.candidates.map(candidate => `
    <article><div><b>${esc(candidate.path)}</b><small>${esc(candidate.reason || "")} · ${Math.round(Number(candidate.score || 0) * 100)}%</small></div>
    <button class="button primary" data-missing-relink="${esc(entry.id)}" data-missing-path="${esc(candidate.path)}">RELINK THIS FILE</button></article>`).join("")}</div>`;
}function entryCard(entry, decision) {
  const resolved = Boolean(decision);
  return `<article class="panel missing-review-card ${resolved ? "resolved" : ""}">
    <header><div><span class="eyebrow">${esc(labelFor(entry.matchType))} · ${esc(String(entry.wing || "").toUpperCase())}</span>
    <h3>${esc(entry.title || "Untitled record")}</h3></div><b>${entry.referenceCount} REF${entry.referenceCount === 1 ? "" : "S"}</b></header>
    <div class="missing-review-old"><span>OLD PATH</span><code>${esc(entry.oldPath)}</code></div>
    ${resolved ? `<p class="missing-review-decision"><b>${decision.decision === "relinked" ? "RELINKED" : "LEFT MISSING"}</b>${decision.candidate ? `<br>${esc(decision.candidate)}` : ""}</p>`
      : `${candidateRows(entry)}<div class="button-row"><button class="button" data-missing-keep="${esc(entry.id)}">KEEP MARKED MISSING</button></div>`}
  </article>`;
}

export async function renderMissingFileReview() {
  const data = await plan();
  const state = getState(), done = decisions(state);
  const unresolved = data.entries.filter(entry => !done[entry.id]);
  const resolved = data.entries.filter(entry => done[entry.id]);
  const counts = Object.fromEntries(["exact_unique","exact_multiple","episode_match","renamed_suggestion","still_missing"]
    .map(type => [type, unresolved.filter(entry => entry.matchType === type).length]));
  const exactBatch = counts.exact_unique || 0;

  return `<div class="missing-review">
    <section class="panel missing-review-hero"><div><span class="eyebrow">PATH RECOVERY // REVIEW ONLY</span>
    <h2>MISSING FILE REVIEW</h2><p>Choose what each old Vault path should point to. Nothing here moves, renames, or deletes a media file.</p></div>
    <div class="missing-review-stats"><span><b>${unresolved.length}</b>TO REVIEW</span><span><b>${resolved.length}</b>DECIDED</span><span><b>${counts.still_missing || 0}</b>NO CANDIDATE</span></div></section>
    ${exactBatch ? `<section class="panel missing-review-safe"><div><b>${exactBatch} EXACT ONE-TO-ONE MATCHES</b><p>Same filename, one current D: location. A protected snapshot is created before the first relink.</p></div>
    <button class="button primary" data-missing-relink-exact>RELINK ALL ${exactBatch} EXACT MATCHES</button></section>` : ""}
    <section class="missing-review-list">${unresolved.map(entry => entryCard(entry, null)).join("") || `<div class="panel"><h3>REVIEW COMPLETE</h3><p>No unresolved paths remain in this plan.</p></div>`}</section>
    ${resolved.length ? `<details class="panel missing-review-history"><summary>DECISION HISTORY · ${resolved.length}</summary><div>${resolved.map(entry => entryCard(entry, done[entry.id])).join("")}</div></details>` : ""}
  </div>`;
}

export function bindMissingFileReview(root, onChanged = () => {}) {
  if (!root) return;
  root.addEventListener("click", async event => {
    const relink = event.target.closest("[data-missing-relink]");
    if (relink) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await relinkMissingFile(relink.dataset.missingRelink, relink.dataset.missingPath);
        onChanged();
      } catch (error) { toast("RELINK PAUSED", error.message, 9000); }
      return;
    }
    const keep = event.target.closest("[data-missing-keep]")?.dataset.missingKeep;
    if (keep) {
      event.preventDefault();
      event.stopPropagation();
      await keepMissingFile(keep);
      onChanged();
      return;
    }
    if (event.target.closest("[data-missing-relink-exact]")) {
      event.preventDefault();
      event.stopPropagation();
      try {
        const result = await relinkAllExactMissingFiles();
        onChanged();
        toast("EXACT RELINK PASS COMPLETE", `${result.entries} paths · ${result.references} references repaired.`, 9000);
      } catch (error) { toast("EXACT RELINK PAUSED", error.message, 9000); }
    }
  });
}

function refreshMissingReviewRoute() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("hashchange"));
}

if (typeof document !== "undefined") {
  document.addEventListener("click", async event => {
    const relink = event.target.closest?.("[data-missing-relink]");
    const keep = event.target.closest?.("[data-missing-keep]");
    const batch = event.target.closest?.("[data-missing-relink-exact]");
    if (!relink && !keep && !batch) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (relink) {
      try {
        await relinkMissingFile(relink.dataset.missingRelink, relink.dataset.missingPath);
        refreshMissingReviewRoute();
      } catch (error) { toast("RELINK PAUSED", error.message, 9000); }
      return;
    }
    if (keep) {
      await keepMissingFile(keep.dataset.missingKeep);
      refreshMissingReviewRoute();
      return;
    }
    try {
      const result = await relinkAllExactMissingFiles();
      toast("EXACT RELINK PASS COMPLETE", `${result.entries} paths · ${result.references} references repaired.`, 9000);
      refreshMissingReviewRoute();
    } catch (error) { toast("EXACT RELINK PAUSED", error.message, 9000); }
  }, true);
}
