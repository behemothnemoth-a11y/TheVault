import { escapeHtml as esc } from "../ui/safeHtml.js";
import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { navigate } from "../systems/routeController.js?v=20260913-life-v1";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import {
  CHAPTER_STATES, CONTRACT_SECTIONS, MAP_FIELDS, PROPOSAL_FIELDS, SCENE_FIELDS,
  fieldLabel, stateLabel, studio,
} from "../systems/studioClient.js?v=20260913-studio-v2";

/* NOVEL STUDIO — the Writing room, rebuilt around the Novel Studio contract.
 *
 * This file draws and reacts. Every rule — no silent jumps, what a lock
 * protects, what needs a reason — is enforced by studio_core on the server, so
 * the interface can never quietly get round one. Refusals come back as plain
 * sentences and are shown as they are.
 *
 * Data lives in data/studio on disk rather than in the Vault's state, so it is
 * loaded on demand and cached here for drawing.
 */

const cache = { projects: null, project: {}, orientation: {}, chapter: {}, decisions: {}, manuscript: {} };
const failed = {};
const inFlight = new Set();
let segments = [];
let root = null;
let includeUnlocked = false;

// Draft autosave: one pending write at a time, never lost on navigation.
let draftTimer = null;
let draftPending = null;
let stopSpeech = () => {};

/* ---------------------------------------------------------------- routing */

function where() {
  const [head, pid, kind, id, tab] = segments;
  if (head !== "p" || !pid) return { view: "library" };
  if (kind === "contract") return { view: "contract", pid };
  if (kind === "decisions") return { view: "decisions", pid };
  if (kind === "manuscript") return { view: "manuscript", pid, bookId: id };
  if (kind === "c" && id) return { view: "chapter", pid, cid: id, tab: tab || "proposal" };
  return { view: "overview", pid };
}

const path = {
  project: pid => `writing/p/${pid}`,
  contract: pid => `writing/p/${pid}/contract`,
  decisions: pid => `writing/p/${pid}/decisions`,
  manuscript: (pid, bookId) => `writing/p/${pid}/manuscript/${bookId}`,
  chapter: (pid, cid, tab) => `writing/p/${pid}/c/${cid}${tab ? `/${tab}` : ""}`,
};

/* ---------------------------------------------------------------- loading */

function load(key, fetcher, assign) {
  if (inFlight.has(key) || failed[key]) return;
  inFlight.add(key);
  fetcher()
    .then(value => { assign(value); delete failed[key]; })
    .catch(error => { failed[key] = error.message; })
    .finally(() => { inFlight.delete(key); redraw(); });
}

function need(pid, cid) {
  if (!cache.project[pid]) load(`project:${pid}`, () => studio("get_project", { project_id: pid }), value => { cache.project[pid] = value; });
  if (!cache.orientation[pid]) load(`orientation:${pid}`, () => studio("orientation", { project_id: pid }), value => { cache.orientation[pid] = value; });
  if (cid && !cache.chapter[cid]) load(`chapter:${cid}`, () => studio("get_chapter", { project_id: pid, chapter_id: cid }), value => { cache.chapter[cid] = value; });
}

/* Re-fetch what a change touched, then redraw once. */
async function refresh(pid, cid) {
  const jobs = [
    studio("get_project", { project_id: pid }).then(value => { cache.project[pid] = value; }),
    studio("orientation", { project_id: pid }).then(value => { cache.orientation[pid] = value; }),
  ];
  if (cid) jobs.push(studio("get_chapter", { project_id: pid, chapter_id: cid }).then(value => { cache.chapter[cid] = value; }));
  delete cache.decisions[pid];
  delete cache.manuscript[pid];
  await Promise.all(jobs).catch(error => toast("COULD NOT REFRESH", error.message, 6000));
  redraw();
}

/* Run a studio operation. A refusal is shown and nothing else happens. */
async function act(op, args, { pid, cid, done } = {}) {
  try {
    const result = await studio(op, args);
    if (done) toast(done[0], done[1] || "");
    if (pid) await refresh(pid, cid);
    return result ?? true;
  } catch (error) {
    toast("NOT DONE", error.message, 7000);
    return null;
  }
}

function redraw() {
  if (!root?.isConnected || document.body.dataset.vaultRoute !== "writing") return;
  const work = root.querySelector(".studio-work");
  const scroll = work ? work.scrollTop : 0;
  // A redraw must never cost the author a keystroke. The draft box is rebuilt
  // from the cache, which the input handler keeps current, and its caret,
  // selection, scroll and focus are carried across.
  const editor = root.querySelector("[data-draft]");
  const carried = editor && !editor.readOnly ? {
    focused: document.activeElement === editor, start: editor.selectionStart,
    end: editor.selectionEnd, top: editor.scrollTop,
  } : null;
  root.innerHTML = renderWritingShell(renderWriting(segments));
  bindWriting(root);
  const next = root.querySelector(".studio-work");
  if (next) next.scrollTop = scroll;
  const rebuilt = root.querySelector("[data-draft]");
  if (carried && rebuilt && !rebuilt.readOnly) {
    rebuilt.scrollTop = carried.top;
    if (carried.focused) { rebuilt.focus(); rebuilt.setSelectionRange(carried.start, carried.end); }
  }
}

/* ---------------------------------------------------------------- shared bits */

const VERSION_KINDS = { snapshot: "Saved", auto: "Kept automatically" };

const PHASE = state => {
  const index = CHAPTER_STATES.indexOf(state);
  if (state === "LOCKED") return "locked";
  if (index <= CHAPTER_STATES.indexOf("SCENE_PLAN_APPROVED")) return "plan";
  if (index <= CHAPTER_STATES.indexOf("WRITE_READY")) return "ready";
  if (state === "FIRST_DRAFT") return "draft";
  return "edit";
};

const when = value => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const words = text => (String(text || "").match(/\S+/g) || []).length;
const chip = (label, tone = "") => `<span class="s-chip ${tone}">${esc(label)}</span>`;
const authorityChip = authority => chip(stateLabel(authority), `auth-${String(authority || "").toLowerCase()}`);

function loadingView(message = "Opening…") {
  return `<div class="studio studio-loading"><p>${esc(message)}</p></div>`;
}

function failureView(key) {
  return `<div class="studio studio-loading"><p class="s-error">${esc(failed[key])}</p>
    <button class="s-button" data-s="retry" data-key="${esc(key)}">Try again</button></div>`;
}

/* ---------------------------------------------------------------- library */

function renderLibrary() {
  if (!cache.projects && !failed.projects) {
    load("projects", () => studio("list_projects"), value => { cache.projects = value; });
    return loadingView("Opening the studio…");
  }
  if (failed.projects) return failureView("projects");
  const cards = cache.projects.map(project => `<button class="s-project" data-s="open-project" data-pid="${esc(project.id)}">
      <span class="s-project__mode">${project.mode === "adaptation" ? "Source adaptation" : "Original novel"}</span>
      <b>${esc(project.title)}</b>
      <p>${esc(project.premise || "No premise yet.")}</p>
      <small>${project.books} book${project.books === 1 ? "" : "s"} · ${project.chapters} chapter${project.chapters === 1 ? "" : "s"} · updated ${esc(when(project.updatedAt))}</small>
    </button>`).join("");
  return `<div class="studio studio-library">
    <header class="s-library-head">
      <div><span class="s-kicker">Novel Studio</span><h1>Your projects</h1>
        <p>Plan globally, refine locally, recheck globally. The AI proposes; you decide canon.</p></div>
      <button class="s-button primary" data-s="new-project">New project</button>
    </header>
    ${cards ? `<div class="s-project-grid">${cards}</div>`
      : `<div class="s-empty"><h2>No projects yet</h2><p>Start an original novel, or a project that adapts existing material — a campaign, transcripts, older prose.</p><button class="s-button primary" data-s="new-project">Create the first project</button></div>`}
  </div>`;
}

/* ---------------------------------------------------------------- project frame */

function outline(project, active) {
  const chaptersFor = (bookId, movementId) => project.chapters
    .filter(chapter => chapter.bookId === bookId && (chapter.movementId || null) === (movementId || null))
    .sort((a, b) => a.number - b.number)
    .map(chapter => `<button class="s-outline-chapter phase-${PHASE(chapter.state)}${active.cid === chapter.id ? " is-active" : ""}"
        data-s="go" data-to="${esc(path.chapter(project.id, chapter.id))}" title="${esc(stateLabel(chapter.state))}">
        <i></i><span>${chapter.number}. ${esc(chapter.title)}</span>
        ${chapter.locked ? `<em class="s-mark lock" title="Locked text">locked</em>` : ""}
        ${chapter.stale ? `<em class="s-mark stale" title="Needs review">stale</em>` : ""}
        ${chapter.reopened ? `<em class="s-mark reopened" title="Reopened">reopened</em>` : ""}
      </button>`).join("");

  const books = project.books.map(book => {
    const movements = book.movements.map(movement => `<div class="s-outline-movement">
        <span>${esc(movement.title)}</span>${chaptersFor(book.id, movement.id)}</div>`).join("");
    return `<section class="s-outline-book">
      <header><b>${esc(book.title)}</b><small>${esc(stateLabel(book.state))}</small></header>
      ${movements}${chaptersFor(book.id, null)}
      <div class="s-outline-actions">
        <button class="s-link" data-s="add-chapter" data-book="${esc(book.id)}">+ Chapter</button>
        <button class="s-link" data-s="add-movement" data-book="${esc(book.id)}">+ Movement</button>
        <button class="s-link" data-s="go" data-to="${esc(path.manuscript(project.id, book.id))}">Manuscript</button>
      </div>
    </section>`;
  }).join("");

  const tab = (view, label, to, extra = "") => `<button class="s-outline-link${active.view === view ? " is-active" : ""}" data-s="go" data-to="${esc(to)}">${esc(label)}${extra}</button>`;
  const open = cache.orientation[project.id]?.contractOpen;
  return `<nav class="studio-outline" aria-label="Project outline">
    <button class="s-link s-back" data-s="go" data-to="writing">← All projects</button>
    <h2>${esc(project.title)}</h2>
    <span class="s-kicker">${project.mode === "adaptation" ? "Source adaptation" : "Original novel"}</span>
    <div class="s-outline-links">
      ${tab("overview", "Overview", path.project(project.id))}
      ${tab("contract", "Project contract", path.contract(project.id), open ? ` <small>${open} open</small>` : "")}
      ${tab("decisions", "Canon & decisions", path.decisions(project.id))}
    </div>
    ${books || `<p class="s-quiet">No books yet.</p>`}
    <button class="s-link" data-s="add-book">+ Book</button>
  </nav>`;
}

function frame(project, active, work, inspector) {
  return `<div class="studio">
    <div class="studio-grid">
      ${outline(project, active)}
      <main class="studio-work">${work}</main>
      <aside class="studio-inspector">${inspector}</aside>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- overview */

function renderOverview(project) {
  const orient = cache.orientation[project.id];
  if (!orient) return failed[`orientation:${project.id}`] ? failureView(`orientation:${project.id}`) : loadingView();
  const target = orient.nextTarget || {};
  const goTo = target.type === "chapter" && target.id ? `data-s="go" data-to="${esc(path.chapter(project.id, target.id))}"`
    : target.type === "chapter" ? `data-s="add-chapter" data-book="${esc(target.bookId)}"`
    : target.type === "book" && !project.books.length ? `data-s="add-book"`
    : "";

  const list = (rows, empty, tone) => rows.length
    ? `<ul class="s-flag-list">${rows.map(row => `<li><button class="s-link" data-s="go" data-to="${esc(path.chapter(project.id, row.id))}">${row.number}. ${esc(row.title)}</button> ${chip(tone)}</li>`).join("")}</ul>`
    : `<p class="s-quiet">${esc(empty)}</p>`;

  const books = project.books.map(book => {
    const chapters = project.chapters.filter(chapter => chapter.bookId === book.id);
    const locked = chapters.filter(chapter => chapter.state === "LOCKED").length;
    return `<article class="s-book-card">
      <header><h3>${esc(book.title)}</h3>${chip(stateLabel(book.state))}</header>
      <p>${chapters.length} chapter${chapters.length === 1 ? "" : "s"} · ${locked} locked · ${book.movements.length} movement${book.movements.length === 1 ? "" : "s"}</p>
      <div class="s-row">
        <button class="s-button" data-s="add-chapter" data-book="${esc(book.id)}">Add chapter</button>
        <button class="s-button" data-s="go" data-to="${esc(path.manuscript(project.id, book.id))}">Read manuscript</button>
      </div>
    </article>`;
  }).join("");

  const work = `<header class="s-work-head"><span class="s-kicker">Overview</span><h1>${esc(project.title)}</h1></header>
    <section class="s-next">
      <span class="s-kicker">Next</span>
      <h2>${esc(orient.next)}</h2>
      ${orient.blockedUntil ? `<p class="s-blocked">Blocked until: ${esc(orient.blockedUntil)}</p>` : ""}
      <p class="s-quiet">Stage: ${esc(stateLabel(orient.stage))}${orient.book ? ` · ${esc(orient.book.title)}` : ""}${orient.chapter ? ` · chapter ${orient.chapter.number}` : ""}</p>
      ${goTo ? `<button class="s-button primary" ${goTo}>Go</button>` : ""}
    </section>
    ${orient.contractEssentialsMissing.length ? `<section class="s-panel s-soft-warn">
      <h3>Contract essentials still open</h3>
      <p>${orient.contractEssentialsMissing.map(fieldLabel).join(", ")}. Nothing is blocked — they stay open until you decide.</p>
      <button class="s-button" data-s="go" data-to="${esc(path.contract(project.id))}">Open the contract</button></section>` : ""}
    ${project.mode === "adaptation" ? `<section class="s-panel s-upcoming">
      <h3>Source adaptation</h3>
      <p>Source import, the living codex, open threads with Review Five, and the adaptation map arrive in the next phase. The novel core below already works for this project.</p></section>` : ""}
    <section class="s-panel">
      <header class="s-panel-head"><h3>Books</h3><button class="s-button" data-s="add-book">Add book</button></header>
      ${books || `<p class="s-quiet">No books yet. A project can hold one or more series and books.</p>`}
    </section>
    <section class="s-two">
      <div class="s-panel"><h3>Needs review</h3>${list(orient.stale, "Nothing is stale.", "stale")}</div>
      <div class="s-panel"><h3>Reopened</h3>${list(orient.reopened, "Nothing is reopened.", "reopened")}</div>
    </section>`;

  const inspector = `<section class="s-inspect">
      <span class="s-kicker">Project</span>
      <dl class="s-facts">
        <dt>Mode</dt><dd>${project.mode === "adaptation" ? "Source adaptation" : "Original novel"}</dd>
        <dt>Contract fields open</dt><dd>${orient.contractOpen}</dd>
        <dt>Locked facts</dt><dd>${orient.lockedFacts}</dd>
        <dt>Rejected ideas</dt><dd>${orient.rejected}</dd>
        <dt>Latest locked</dt><dd>${orient.latestLocked ? `${orient.latestLocked.number}. ${esc(orient.latestLocked.title)}` : "—"}</dd>
      </dl>
      <div class="s-stack">
        <button class="s-button" data-s="rename-project">Rename project</button>
        <button class="s-button" data-s="export-project">Export a full backup</button>
      </div>
    </section>`;
  return frame(project, { view: "overview" }, work, inspector);
}

/* ---------------------------------------------------------------- contract */

const AUTHORITY_CHOICES = ["OPEN", "WORKING", "APPROVED", "LOCKED_FACT", "DEFERRED"];

function renderContract(project) {
  const sections = CONTRACT_SECTIONS.map(([section, title, fields]) => `<fieldset class="s-contract-section">
      <legend>${esc(title)}</legend>
      ${fields.map(field => {
        const entry = project.contract[section][field];
        const locked = entry.authority === "LOCKED_FACT";
        return `<label class="s-field${locked ? " is-locked" : ""}">
          <span>${esc(fieldLabel(field))} ${authorityChip(entry.authority)}</span>
          <textarea rows="2" data-contract="${esc(section)}" data-field="${esc(field)}" ${locked ? "readonly" : ""}>${esc(entry.value)}</textarea>
          <select data-contract-authority="${esc(section)}" data-field="${esc(field)}" aria-label="Authority">
            ${AUTHORITY_CHOICES.map(choice => `<option value="${choice}"${choice === entry.authority ? " selected" : ""}>${esc(stateLabel(choice))}</option>`).join("")}
          </select>
        </label>`;
      }).join("")}
    </fieldset>`).join("");
  const work = `<header class="s-work-head"><span class="s-kicker">Project contract</span><h1>The rules this book is written by</h1>
      <p class="s-quiet">Fill in what you know. Anything left open stays open — the studio never blocks on it. A rule set to “Locked fact” can’t be reworded until you change its authority, with a reason.</p></header>
    <div class="s-contract">${sections}</div>`;
  const inspector = `<section class="s-inspect"><span class="s-kicker">Authority</span>
    <dl class="s-facts">
      <dt>Open</dt><dd>Not yet decided</dd>
      <dt>Working</dt><dd>Current direction</dd>
      <dt>Approved</dt><dd>Governing, not locked</dd>
      <dt>Locked fact</dt><dd>Holds until explicitly unlocked</dd>
      <dt>Deferred</dt><dd>Postponed on purpose</dd>
    </dl>
    <p class="s-quiet">Changes save when you leave a field, and every change is recorded in Canon &amp; decisions.</p></section>`;
  return frame(project, { view: "contract" }, work, inspector);
}

/* ---------------------------------------------------------------- chapter */

const TABS = [["proposal", "Proposal"], ["scenes", "Scenes"], ["draft", "Draft"], ["map", "Chapter map"], ["versions", "Versions"]];

function renderFields(fields, values, attribute, readonly) {
  return fields.map(([key, label]) => `<label class="s-field">
      <span>${esc(label)}</span>
      <textarea rows="${key === "what_happens" || key === "major_events" ? 5 : 2}" data-${attribute}="${esc(key)}" ${readonly ? "readonly" : ""}>${esc(values[key] || "")}</textarea>
    </label>`).join("");
}

function renderChapter(project, place) {
  const chapter = cache.chapter[place.cid];
  if (!chapter) return failed[`chapter:${place.cid}`] ? failureView(`chapter:${place.cid}`) : loadingView("Opening the chapter…");
  const locked = chapter.state === "LOCKED";
  const tabs = TABS.map(([id, label]) => `<button class="s-tab${place.tab === id ? " is-active" : ""}" data-s="go" data-to="${esc(path.chapter(project.id, chapter.id, id))}">${esc(label)}${id === "versions" && chapter.versions.length ? ` <small>${chapter.versions.length}</small>` : ""}${id === "scenes" && chapter.scenes.length ? ` <small>${chapter.scenes.length}</small>` : ""}</button>`).join("");

  let body = "";
  if (place.tab === "proposal") {
    body = `<p class="s-tab-note">The proposal is specific enough to correct direction before any prose exists. ${authorityChip(chapter.proposalAuthority)}</p>
      <div class="s-fields">${renderFields(PROPOSAL_FIELDS, chapter.proposal, "proposal", locked)}</div>`;
  } else if (place.tab === "map") {
    body = `<p class="s-tab-note">Working architecture — a chapter can be split, combined, moved or re-centred.</p>
      <div class="s-fields">${renderFields(MAP_FIELDS, chapter.map, "map", locked)}</div>`;
  } else if (place.tab === "scenes") {
    const scenes = chapter.scenes.map(scene => `<details class="s-scene" ${chapter.scenes.length === 1 ? "open" : ""}>
        <summary><b>Scene ${scene.number}</b> <span>${esc(scene.plan.purpose || "No purpose yet")}</span></summary>
        <div class="s-fields">${SCENE_FIELDS.map(([key, label]) => `<label class="s-field"><span>${esc(label)}</span>
          <textarea rows="2" data-scene="${esc(scene.id)}" data-field="${esc(key)}" ${locked ? "readonly" : ""}>${esc(scene.plan[key] || "")}</textarea></label>`).join("")}</div>
        ${locked ? "" : `<button class="s-link danger" data-s="remove-scene" data-scene="${esc(scene.id)}">Remove this scene</button>`}
      </details>`).join("");
    body = `<p class="s-tab-note">A scene plan is not prose. Include only what improves drafting and auditing. ${authorityChip(chapter.sceneAuthority)}</p>
      ${scenes || `<p class="s-quiet">No scenes planned yet.</p>`}
      ${locked ? "" : `<button class="s-button" data-s="add-scene">Add a scene</button>`}`;
  } else if (place.tab === "draft") {
    body = `<div class="s-draft">
        ${locked ? `<p class="s-locked-banner">Locked text. Reopen the chapter to change a word of it.</p>` : ""}
        <textarea class="s-manuscript-editor" data-draft spellcheck="true" ${locked ? "readonly" : ""} placeholder="Begin the chapter…">${esc(chapter.draft.body)}</textarea>
        <div class="s-draft-bar">
          <small data-draft-status>${chapter.draft.words.toLocaleString()} words · ${chapter.draft.updatedAt ? `saved ${esc(when(chapter.draft.updatedAt))}` : "not yet saved"}</small>
          <div class="s-row">
            ${locked ? "" : `<button class="s-button" data-s="save-version">Save a version</button>`}
            <button class="s-button" data-s="read-aloud">Read aloud</button>
            <button class="s-button" data-s="stop-reading" hidden>Stop</button>
          </div>
        </div>
      </div>`;
  } else if (place.tab === "versions") {
    const rows = chapter.versions.slice().reverse().map(version => `<li class="s-version kind-${esc(version.kind)}">
        <div><b>Version ${version.number}</b> ${version.kind === "locked" ? chip("Locked text", "auth-locked_text") : chip(VERSION_KINDS[version.kind] || stateLabel(version.kind))}
          <small>${esc(when(version.createdAt))} · ${version.words.toLocaleString()} words · at ${esc(stateLabel(version.state))}</small>
          ${version.note ? `<p>${esc(version.note)}</p>` : ""}</div>
        <div class="s-row">
          <button class="s-button" data-s="view-version" data-version="${esc(version.id)}">Read</button>
          ${locked ? "" : `<button class="s-button" data-s="restore-version" data-version="${esc(version.id)}" data-number="${version.number}">Restore</button>`}
        </div>
      </li>`).join("");
    body = `<p class="s-tab-note">Versions are written once and never edited. Restoring one brings its text back as the draft and keeps the draft it replaces.</p>
      ${rows ? `<ul class="s-versions">${rows}</ul>` : `<p class="s-quiet">No versions yet. Save one from the Draft tab, or lock the chapter.</p>`}`;
  }

  const work = `<header class="s-work-head">
      <span class="s-kicker">Chapter ${chapter.number} · ${esc(stateLabel(chapter.state))}</span>
      <input class="s-title-input" data-chapter-title value="${esc(chapter.title)}" ${locked ? "readonly" : ""} aria-label="Chapter title">
    </header>
    ${chapter.stale ? `<p class="s-stale-banner">Needs review: ${esc(chapter.stale.reason)}</p>` : ""}
    <nav class="s-tabs">${tabs}</nav>
    <section class="s-tab-body">${body}</section>`;

  return frame(project, { view: "chapter", cid: chapter.id }, work, chapterInspector(project, chapter));
}

function chapterInspector(project, chapter) {
  const index = CHAPTER_STATES.indexOf(chapter.state);
  const next = CHAPTER_STATES[index + 1];
  const orient = cache.orientation[project.id];
  const blocked = orient?.chapter?.id === chapter.id ? orient.blockedUntil : null;
  const track = CHAPTER_STATES.map((state, position) => `<li class="${position < index ? "done" : position === index ? "current" : ""}">${esc(stateLabel(state))}</li>`).join("");
  const facts = project.facts.filter(fact => fact.chapterId === chapter.id);

  let primary = "";
  if (chapter.state === "FINAL_REVIEW") primary = `<button class="s-button primary" data-s="lock">Lock chapter</button>`;
  else if (chapter.state !== "LOCKED" && next) primary = `<button class="s-button primary" data-s="advance" data-target="${esc(next)}">Move to ${esc(stateLabel(next).toLowerCase())}</button>`;

  return `<section class="s-inspect">
      <span class="s-kicker">Workflow</span>
      ${primary}
      ${blocked ? `<p class="s-blocked">${esc(blocked)}</p>` : ""}
      ${chapter.state === "LOCKED" ? `<p class="s-quiet">Locked ${esc(when(chapter.lock?.at))}.</p>` : ""}
      <ol class="s-track">${track}</ol>
      ${chapter.state !== "LOCKED" ? `<div class="s-stack">
        <button class="s-link" data-s="jump">Jump ahead (override)…</button>
        ${index > 0 ? `<button class="s-link" data-s="step-back">Step back…</button>` : ""}
      </div>` : ""}
    </section>

    <section class="s-inspect">
      <span class="s-kicker">Authority</span>
      <dl class="s-facts">
        <dt>Proposal</dt><dd>${authorityChip(chapter.proposalAuthority)}</dd>
        <dt>Scene plan</dt><dd>${authorityChip(chapter.sceneAuthority)}</dd>
        <dt>Text</dt><dd>${chapter.lock ? authorityChip("LOCKED_TEXT") : authorityChip("WORKING")}</dd>
      </dl>
      ${chapter.reopened ? `<p class="s-quiet">${chip("Reopened", "auth-reopened")} Work that was approved or locked is open again.</p>` : ""}
      ${chapter.lock ? `<p class="s-hash" title="${esc(chapter.lock.sha256)}">sha256 ${esc(chapter.lock.sha256.slice(0, 16))}…</p>
        <div class="s-stack">
          <button class="s-button" data-s="verify-lock">Verify the lock</button>
          <button class="s-button" data-s="reopen">Reopen chapter…</button>
        </div>` : ""}
    </section>

    <section class="s-inspect">
      <span class="s-kicker">Review</span>
      ${chapter.stale
        ? `<p class="s-stale-note">${esc(chapter.stale.reason)}</p><button class="s-button" data-s="clear-stale">Reviewed — clear flag</button>`
        : `<button class="s-link" data-s="mark-stale">Mark as needing review…</button>`}
    </section>

    <section class="s-inspect">
      <span class="s-kicker">Facts from this chapter</span>
      ${facts.length ? `<ul class="s-fact-list">${facts.map(fact => `<li>${authorityChip(fact.authority)} ${esc(fact.statement)}</li>`).join("")}</ul>` : `<p class="s-quiet">None recorded.</p>`}
      <div class="s-stack">
        <button class="s-link" data-s="add-fact" data-chapter="${esc(chapter.id)}">Record a fact…</button>
        <button class="s-link" data-s="reject-idea">Reject an idea…</button>
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- manuscript */

function renderManuscript(project, place) {
  const book = project.books.find(entry => entry.id === place.bookId) || project.books[0];
  if (!book) return frame(project, { view: "manuscript" }, `<p class="s-quiet">No book yet.</p>`, "");
  const key = `${book.id}:${includeUnlocked ? 1 : 0}`;
  const text = cache.manuscript[project.id]?.[key];
  if (!text) {
    load(`manuscript:${project.id}:${key}`, () => studio("manuscript", { project_id: project.id, book_id: book.id, include_unlocked: includeUnlocked }),
      value => { cache.manuscript[project.id] ||= {}; cache.manuscript[project.id][key] = value; });
  }
  const chapters = text ? text.chapters.map(part => part.excluded
    ? `<section class="s-ms-chapter is-excluded"><h2>${part.number}. ${esc(part.title)}</h2><p>Not locked — left out of the running manuscript (${esc(stateLabel(part.status))}).</p></section>`
    : `<section class="s-ms-chapter${part.unlocked ? " is-unlocked" : ""}">
        <h2>${part.number}. ${esc(part.title)}</h2>
        ${part.unlocked ? `<p class="s-ms-flag">Unlocked draft · ${esc(stateLabel(part.status))} — not canon yet</p>` : ""}
        ${String(part.body || "").split(/\n{2,}/).map(paragraph => paragraph.trim() ? `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>` : "").join("")}
      </section>`).join("") : `<p class="s-quiet">Assembling the manuscript…</p>`;
  const work = `<header class="s-work-head">
      <span class="s-kicker">Running manuscript</span><h1>${esc(book.title)}</h1>
      <p class="s-quiet">${text ? `${text.words.toLocaleString()} words` : ""} ${includeUnlocked ? "· including unlocked drafts" : "· locked text only"}</p>
      <label class="s-toggle"><input type="checkbox" data-s-toggle="unlocked" ${includeUnlocked ? "checked" : ""}> Include unlocked drafts</label>
    </header>
    <article class="s-manuscript">${chapters}</article>`;
  const inspector = `<section class="s-inspect"><span class="s-kicker">About this view</span>
    <p class="s-quiet">By default the running manuscript is locked text only — the book as it is actually settled. Unlocked drafts can be shown, clearly marked, but they aren’t canon.</p></section>`;
  return frame(project, { view: "manuscript" }, work, inspector);
}

/* ---------------------------------------------------------------- decisions */

/* One readable line for a history entry: what it was about, and what changed.
 * The log keeps full values (hashes, whole fact records); this is only how
 * they are shown. */
function describeDecision(entry, project) {
  const chapter = project.chapters.find(item => item.id === entry.objectId);
  const book = project.books.find(item => item.id === entry.objectId);
  const clip = (text, size = 140) => { const value = String(text ?? ""); return value.length > size ? `${value.slice(0, size - 1)}…` : value; };
  const subject = chapter ? `Chapter ${chapter.number} · ${chapter.title}`
    : book ? book.title
    : entry.objectType === "contract" ? `Contract · ${fieldLabel(String(entry.objectId).split(".").pop())}`
    : stateLabel(entry.objectType);
  const { old: before, new: after } = entry;
  switch (entry.kind) {
    case "PROJECT_CREATED": return `${after?.title ?? project.title} · ${after?.mode === "adaptation" ? "source adaptation" : "original novel"}`;
    case "RENAMED": return `${clip(before, 60)} → ${clip(after, 60)}`;
    case "STATE_ADVANCED": case "STATE_OVERRIDE": case "STATE_BACK":
      return `${subject} · ${stateLabel(before)} → ${stateLabel(after)}`;
    case "VERSION_RESTORED": return `${subject} · version ${after} back as the draft`;
    case "LOCKED": return `${subject} · text locked${after?.sha256 ? ` (sha256 ${after.sha256.slice(0, 10)}…)` : ""}`;
    case "REOPENED": return `${subject} · locked text kept on record`;
    case "FACT_ADDED": return `${stateLabel(after?.authority)} · ${clip(after?.statement)}`;
    case "FACT_CHANGED": {
      const moved = before?.authority !== after?.authority ? ` · ${stateLabel(before?.authority)} → ${stateLabel(after?.authority)}` : "";
      const reworded = before?.statement !== after?.statement ? ` · was “${clip(before?.statement, 80)}”` : "";
      return `${clip(after?.statement)}${moved}${reworded}`;
    }
    case "CONTRACT_CHANGED": {
      const value = item => item && typeof item === "object" ? `${clip(item.value, 60) || "(empty)"} · ${stateLabel(item.authority)}` : clip(item, 60) || "(empty)";
      return `${subject} · ${value(before)} → ${value(after)}`;
    }
    case "SCENE_REMOVED": return `Scene · ${clip(before?.purpose || "untitled scene", 80)}`;
    default: {
      const plain = value => value === null || value === undefined || typeof value === "object" ? "" : clip(value);
      // An added book or chapter already names itself in the subject.
      return [subject, subject.endsWith(plain(after)) ? "" : plain(after)].filter(Boolean).join(" · ");
    }
  }
}

function renderDecisions(project) {
  const log = cache.decisions[project.id];
  if (!log) load(`decisions:${project.id}`, () => studio("decisions", { project_id: project.id }), value => { cache.decisions[project.id] = value; });
  const facts = project.facts.slice().reverse().map(fact => `<li>
      ${authorityChip(fact.authority)} <span>${esc(fact.statement)}</span>
      <button class="s-link" data-s="change-fact" data-fact="${esc(fact.id)}" data-authority="${esc(fact.authority)}">Change…</button>
    </li>`).join("");
  const rejected = project.rejected.slice().reverse().map(entry => `<li>
      <b>${esc(entry.summary)}</b>${entry.why ? `<span> — ${esc(entry.why)}</span>` : ""}
      <small>${entry.mayReconsider ? "may be reconsidered" : "not to be reconsidered"} · ${esc(when(entry.at))}</small>
    </li>`).join("");
  const history = log ? log.map(entry => `<li>
      <time>${esc(when(entry.at))}</time>
      <b>${esc(stateLabel(entry.kind))}</b>
      <span>${esc(describeDecision(entry, project))}</span>
      ${entry.why ? `<p>${esc(entry.why)}</p>` : ""}
    </li>`).join("") : "";
  const work = `<header class="s-work-head"><span class="s-kicker">Canon &amp; decisions</span><h1>What is settled, and why</h1></header>
    <section class="s-panel"><header class="s-panel-head"><h3>Facts</h3><button class="s-button" data-s="add-fact">Record a fact</button></header>
      ${facts ? `<ul class="s-fact-list">${facts}</ul>` : `<p class="s-quiet">No facts recorded. A locked fact holds while the prose around it changes.</p>`}</section>
    <section class="s-panel"><header class="s-panel-head"><h3>Rejected</h3><button class="s-button" data-s="reject-idea">Reject an idea</button></header>
      ${rejected ? `<ul class="s-rejected">${rejected}</ul>` : `<p class="s-quiet">Nothing rejected yet. Rejected ideas are kept here so they can’t quietly return.</p>`}</section>
    <section class="s-panel"><h3>Decision history</h3>
      ${log ? (history ? `<ol class="s-history">${history}</ol>` : `<p class="s-quiet">No decisions yet.</p>`) : `<p class="s-quiet">Reading the history…</p>`}</section>`;
  const inspector = `<section class="s-inspect"><span class="s-kicker">Why this exists</span>
    <p class="s-quiet">Every approval, rejection, override, lock and reopening is appended here and never rewritten. Later decisions override older ones; nothing old returns silently.</p></section>`;
  return frame(project, { view: "decisions" }, work, inspector);
}

/* ---------------------------------------------------------------- public render */

export function renderWritingShell(content) {
  const place = where();
  const section = { library: "PROJECTS", overview: "OVERVIEW", contract: "CONTRACT", chapter: "CHAPTER", manuscript: "MANUSCRIPT", decisions: "CANON" }[place.view];
  return renderAtomicWingShell({ active: "writing", title: "NOVEL STUDIO", section, content, footer: "NOVEL STUDIO // SAVED TO DISK" });
}

export function renderWriting(nextSegments = []) {
  segments = nextSegments;
  const place = where();
  if (place.view === "library") return renderLibrary();
  need(place.pid, place.cid);
  const project = cache.project[place.pid];
  if (!project) return failed[`project:${place.pid}`] ? failureView(`project:${place.pid}`) : loadingView();
  if (place.view === "contract") return renderContract(project);
  if (place.view === "chapter") return renderChapter(project, place);
  if (place.view === "manuscript") return renderManuscript(project, place);
  if (place.view === "decisions") return renderDecisions(project);
  return renderOverview(project);
}

/* ---------------------------------------------------------------- dialogs */

function ask({ title, body, label, handler }) {
  openModal({
    title, body: `<div class="s-dialog">${body}</div>`,
    actions: [{ label, primary: true, handler: async dialog => {
      const button = dialog.querySelector("[data-action='0']");
      if (button) button.disabled = true;
      const closeIt = await handler(dialog);
      if (button) button.disabled = false;
      if (closeIt) closeModal();
    } }],
  });
}

const field = (dialog, name) => dialog.querySelector(`[name="${name}"]`)?.value ?? "";

function dialogs(place) {
  const project = cache.project[place.pid];
  const chapter = place.cid ? cache.chapter[place.cid] : null;
  return {
    "new-project": () => ask({
      title: "NEW PROJECT", label: "CREATE",
      body: `<label>Title<input name="title" autofocus></label>
        <fieldset class="s-choice"><legend>Mode</legend>
          <label><input type="radio" name="mode" value="adaptation" checked> Source adaptation — a campaign, transcripts, logs or older prose</label>
          <label><input type="radio" name="mode" value="original"> Original novel — built here from a premise</label></fieldset>
        <label>Premise<textarea name="premise" rows="3"></textarea></label>`,
      handler: async dialog => {
        const mode = dialog.querySelector("[name='mode']:checked")?.value || "original";
        const created = await act("create_project", { title: field(dialog, "title"), mode, premise: field(dialog, "premise") });
        if (!created) return false;
        cache.projects = null;
        navigate(path.project(created.id));
        return true;
      },
    }),
    "rename-project": () => ask({
      title: "RENAME PROJECT", label: "RENAME",
      body: `<label>Title<input name="title" value="${esc(project.title)}"></label><label>Why (optional)<input name="why"></label>`,
      handler: async dialog => Boolean(await act("rename_project", { project_id: project.id, title: field(dialog, "title"), why: field(dialog, "why") }, { pid: project.id })),
    }),
    "add-book": () => ask({
      title: "ADD BOOK", label: "ADD",
      body: `<label>Book title<input name="title" autofocus></label><label>Series (optional)<input name="series"></label>`,
      handler: async dialog => Boolean(await act("add_book", { project_id: project.id, title: field(dialog, "title"), series_title: field(dialog, "series") }, { pid: project.id })),
    }),
    "add-movement": button => ask({
      title: "ADD MOVEMENT", label: "ADD",
      body: `<p class="s-quiet">Movements group chapters by geography, emotional stage, relationship stage — whatever the book’s structure is. No three-act structure is imposed.</p>
        <label>Movement title<input name="title" autofocus></label><label>Purpose<textarea name="purpose" rows="3"></textarea></label>`,
      handler: async dialog => Boolean(await act("add_movement", { project_id: project.id, book_id: button.dataset.book, title: field(dialog, "title"), purpose: field(dialog, "purpose") }, { pid: project.id })),
    }),
    "add-chapter": button => {
      const book = project.books.find(entry => entry.id === button.dataset.book);
      ask({
        title: "ADD CHAPTER", label: "ADD",
        body: `<label>Working title<input name="title" autofocus></label>
          ${book?.movements.length ? `<label>Movement<select name="movement"><option value="">None</option>${book.movements.map(movement => `<option value="${esc(movement.id)}">${esc(movement.title)}</option>`).join("")}</select></label>` : ""}`,
        handler: async dialog => {
          const created = await act("add_chapter", { project_id: project.id, book_id: button.dataset.book, title: field(dialog, "title"), movement_id: field(dialog, "movement") || null }, { pid: project.id });
          if (!created) return false;
          navigate(path.chapter(project.id, created.id));
          return true;
        },
      });
    },
    "remove-scene": button => ask({
      title: "REMOVE SCENE", label: "REMOVE",
      body: `<p>The scene plan is kept in the decision history, not simply deleted.</p><label>Why (optional)<input name="why"></label>`,
      handler: async dialog => Boolean(await act("remove_scene", { project_id: project.id, chapter_id: chapter.id, scene_id: button.dataset.scene, why: field(dialog, "why") }, { pid: project.id, cid: chapter.id })),
    }),
    jump: () => {
      const index = CHAPTER_STATES.indexOf(chapter.state);
      const choices = CHAPTER_STATES.slice(index + 1, -1);
      ask({
        title: "JUMP AHEAD", label: "OVERRIDE AND JUMP",
        body: `<p>This skips workflow stages. It’s allowed — the author decides — but it goes on record with your reason.</p>
          <label>Jump to<select name="target">${choices.map(state => `<option value="${state}">${esc(stateLabel(state))}</option>`).join("")}</select></label>
          <label>Reason<textarea name="why" rows="2"></textarea></label>`,
        handler: async dialog => Boolean(await act("transition", { project_id: project.id, chapter_id: chapter.id, target: field(dialog, "target"), override: true, why: field(dialog, "why") }, { pid: project.id, cid: chapter.id })),
      });
    },
    "step-back": () => {
      const index = CHAPTER_STATES.indexOf(chapter.state);
      ask({
        title: "STEP BACK", label: "STEP BACK",
        body: `<p>Stepping back over approved work reopens it. Nothing is deleted.</p>
          <label>Back to<select name="target">${CHAPTER_STATES.slice(0, index).reverse().map(state => `<option value="${state}">${esc(stateLabel(state))}</option>`).join("")}</select></label>
          <label>Why<textarea name="why" rows="2"></textarea></label>`,
        handler: async dialog => Boolean(await act("transition", { project_id: project.id, chapter_id: chapter.id, target: field(dialog, "target"), why: field(dialog, "why") }, { pid: project.id, cid: chapter.id })),
      });
    },
    lock: () => ask({
      title: "LOCK CHAPTER", label: "LOCK THE TEXT",
      body: `<p>Locking freezes the chapter’s exact text as a version that can never be edited, and records a fingerprint so the lock can be proven intact later. Only this chapter is affected.</p>
        <label>Why (optional)<input name="why" value="Final"></label>
        <label>Locked facts this chapter establishes — one per line (optional)<textarea name="facts" rows="4"></textarea></label>`,
      handler: async dialog => {
        await flushDraft();
        const facts = field(dialog, "facts").split("\n").map(line => line.trim()).filter(Boolean);
        return Boolean(await act("lock_chapter", { project_id: project.id, chapter_id: chapter.id, why: field(dialog, "why"), facts }, { pid: project.id, cid: chapter.id, done: ["CHAPTER LOCKED", "The text is now Locked Text."] }));
      },
    }),
    reopen: () => ask({
      title: "REOPEN CHAPTER", label: "REOPEN",
      body: `<p>This chapter goes back to final review and becomes editable. Its locked version stays on record, and no other chapter is unlocked.</p>
        <label>Why is it being reopened?<textarea name="why" rows="3"></textarea></label>`,
      handler: async dialog => Boolean(await act("reopen_chapter", { project_id: project.id, chapter_id: chapter.id, why: field(dialog, "why") }, { pid: project.id, cid: chapter.id })),
    }),
    "mark-stale": () => ask({
      title: "NEEDS REVIEW", label: "MARK STALE",
      body: `<p>Stale means review required. It never deletes or regenerates anything.</p><label>What changed upstream?<textarea name="reason" rows="3"></textarea></label>`,
      handler: async dialog => Boolean(await act("mark_stale", { project_id: project.id, chapter_id: chapter.id, reason: field(dialog, "reason") }, { pid: project.id, cid: chapter.id })),
    }),
    "save-version": () => ask({
      title: "SAVE A VERSION", label: "SAVE",
      body: `<p>Freezes the current draft as a version that is never edited.</p><label>Note (optional)<input name="note"></label>`,
      handler: async dialog => {
        await flushDraft();
        return Boolean(await act("create_version", { project_id: project.id, chapter_id: chapter.id, note: field(dialog, "note") }, { pid: project.id, cid: chapter.id, done: ["VERSION SAVED", ""] }));
      },
    }),
    "restore-version": button => ask({
      title: `RESTORE VERSION ${button.dataset.number}`, label: "RESTORE",
      body: `<p>Its text becomes the draft. The current draft is kept as a version first, so nothing is lost.</p><label>Why (optional)<input name="why"></label>`,
      handler: async dialog => {
        await flushDraft();
        return Boolean(await act("restore_version", { project_id: project.id, chapter_id: chapter.id, version_id: button.dataset.version, why: field(dialog, "why") }, { pid: project.id, cid: chapter.id, done: ["VERSION RESTORED", ""] }));
      },
    }),
    "add-fact": button => ask({
      title: "RECORD A FACT", label: "RECORD",
      body: `<label>Fact<textarea name="statement" rows="3" autofocus></textarea></label>
        <label>Authority<select name="authority"><option value="APPROVED">Approved</option><option value="LOCKED_FACT">Locked fact — holds while prose changes</option><option value="WORKING">Working</option></select></label>`,
      handler: async dialog => Boolean(await act("add_fact", { project_id: project.id, statement: field(dialog, "statement"), authority: field(dialog, "authority"), chapter_id: button.dataset.chapter || null }, { pid: project.id, cid: place.cid })),
    }),
    "change-fact": button => ask({
      title: "CHANGE FACT", label: "CHANGE",
      body: `<p>Unlocking a locked fact needs a reason. Its statement can only be reworded once it is no longer locked.</p>
        <label>Authority<select name="authority">${["LOCKED_FACT", "APPROVED", "WORKING", "SUPERSEDED", "REJECTED"].map(choice => `<option value="${choice}"${choice === button.dataset.authority ? " selected" : ""}>${esc(stateLabel(choice))}</option>`).join("")}</select></label>
        <label>Why<textarea name="why" rows="2"></textarea></label>`,
      handler: async dialog => Boolean(await act("change_fact", { project_id: project.id, fact_id: button.dataset.fact, authority: field(dialog, "authority"), why: field(dialog, "why") }, { pid: project.id, cid: place.cid })),
    }),
    "reject-idea": () => ask({
      title: "REJECT AN IDEA", label: "REJECT",
      body: `<p>Rejected ideas are kept on record so they can’t quietly come back.</p>
        <label>What is being rejected<textarea name="summary" rows="2" autofocus></textarea></label>
        <label>Why<textarea name="why" rows="2"></textarea></label>
        <label class="s-check"><input type="checkbox" name="reconsider"> May be reconsidered later</label>`,
      handler: async dialog => Boolean(await act("reject", { project_id: project.id, summary: field(dialog, "summary"), why: field(dialog, "why"), may_reconsider: dialog.querySelector("[name='reconsider']")?.checked || false }, { pid: project.id, cid: place.cid })),
    }),
  };
}

/* ---------------------------------------------------------------- draft autosave */

async function flushDraft() {
  clearTimeout(draftTimer);
  if (!draftPending) return;
  const job = draftPending;
  draftPending = null;
  const status = root?.querySelector("[data-draft-status]");
  try {
    const saved = await studio("save_draft", job);
    const chapter = cache.chapter[job.chapter_id];
    if (chapter) chapter.draft = { body: job.body, updatedAt: new Date().toISOString(), words: saved.words };
    if (status?.isConnected) status.textContent = `${saved.words.toLocaleString()} words · saved`;
  } catch (error) {
    draftPending = draftPending || job;  // keep it to retry, never drop typed text
    if (status?.isConnected) status.textContent = `Not saved: ${error.message}`;
    toast("DRAFT NOT SAVED", error.message, 8000);
  }
}

window.addEventListener("beforeunload", event => {
  if (draftPending) { flushDraft(); event.preventDefault(); event.returnValue = ""; }
});

/* ---------------------------------------------------------------- read aloud */

function readAloud(textarea) {
  const synth = window.speechSynthesis;
  if (!synth) return toast("NO VOICE", "This browser has no speech voices.");
  const start = textarea.selectionStart, end = textarea.selectionEnd;
  const text = start !== end ? textarea.value.slice(start, end) : textarea.value.slice(start);
  if (!text.trim()) return toast("NOTHING TO READ", "Place the cursor, or select a passage.");
  stopSpeech();
  const voice = synth.getVoices().find(entry => entry.localService);
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  const stopButton = root?.querySelector("[data-s='stop-reading']");
  if (stopButton) stopButton.hidden = false;
  utterance.onend = utterance.onerror = () => { if (stopButton?.isConnected) stopButton.hidden = true; };
  stopSpeech = () => { synth.cancel(); if (stopButton?.isConnected) stopButton.hidden = true; stopSpeech = () => {}; };
  synth.speak(utterance);
}

export function stopWritingSpeech() {
  stopSpeech();
  flushDraft();
}

/* ---------------------------------------------------------------- binding */

export function bindWriting(target) {
  root = target;
  const container = target.querySelector(".studio");
  if (!container) return;
  const place = where();

  container.addEventListener("click", async event => {
    const button = event.target.closest("[data-s]");
    if (!button) return;
    const action = button.dataset.s;
    if (action === "go") { await flushDraft(); return navigate(button.dataset.to); }
    if (action === "open-project") return navigate(path.project(button.dataset.pid));
    if (action === "retry") { delete failed[button.dataset.key]; return redraw(); }
    const project = place.pid ? cache.project[place.pid] : null;
    const chapter = place.cid ? cache.chapter[place.cid] : null;

    if (action === "advance") {
      await flushDraft();
      return act("transition", { project_id: project.id, chapter_id: chapter.id, target: button.dataset.target }, { pid: project.id, cid: chapter.id });
    }
    if (action === "add-scene") return act("add_scene", { project_id: project.id, chapter_id: chapter.id }, { pid: project.id, cid: chapter.id });
    if (action === "clear-stale") return act("clear_stale", { project_id: project.id, chapter_id: chapter.id, why: "Reviewed" }, { pid: project.id, cid: chapter.id });
    if (action === "verify-lock") {
      const result = await act("verify_lock", { project_id: project.id, chapter_id: chapter.id });
      if (result) toast(result.intact ? "LOCK INTACT" : "LOCK BROKEN", result.intact ? "The text is exactly what was locked." : "The stored text no longer matches its lock fingerprint.", 7000);
      return;
    }
    if (action === "view-version") {
      const version = await act("get_version", { project_id: project.id, chapter_id: chapter.id, version_id: button.dataset.version });
      if (version) openModal({ title: `VERSION ${version.number}`, body: `<div class="s-dialog"><p class="s-quiet">${esc(when(version.createdAt))} · ${version.words.toLocaleString()} words · sha256 ${esc(version.sha256.slice(0, 16))}…</p><div class="s-version-text">${esc(version.body)}</div></div>` });
      return;
    }
    if (action === "export-project") {
      const bundle = await act("export_project", { project_id: project.id });
      if (!bundle) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 1)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.title.replace(/[<>:"/\\|?*]/g, "_")} — studio backup.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    if (action === "read-aloud") { const area = container.querySelector("[data-draft]"); if (area) readAloud(area); return; }
    if (action === "stop-reading") return stopSpeech();

    const open = dialogs(place)[action];
    if (open) open(button);
  });

  // Planning fields save when the author leaves them. They never redraw the
  // page mid-edit, so focus and scroll position stay where they were.
  container.addEventListener("change", async event => {
    const element = event.target;
    const project = place.pid ? cache.project[place.pid] : null;
    const chapter = place.cid ? cache.chapter[place.cid] : null;

    if (element.matches("[data-s-toggle='unlocked']")) { includeUnlocked = element.checked; return redraw(); }
    if (element.matches("[data-contract]")) {
      // Saved without redrawing: this fires as the author tabs to the next of
      // some fifty fields, and a redraw would pull focus away every time.
      const section = element.dataset.contract, key = element.dataset.field;
      const select = container.querySelector(`[data-contract-authority="${section}"][data-field="${key}"]`);
      const authority = select?.value || "WORKING";
      const next = authority === "OPEN" && element.value.trim() ? "WORKING" : authority;
      const saved = await act("set_contract", { project_id: project.id, section, field: key, value: element.value, authority: next });
      if (!saved) return;
      cache.project[project.id] = saved;
      if (select && select.value !== next) select.value = next;
      const badge = element.closest(".s-field")?.querySelector(".s-chip");
      if (badge) { badge.textContent = stateLabel(next); badge.className = `s-chip auth-${next.toLowerCase()}`; }
      studio("orientation", { project_id: project.id }).then(value => { cache.orientation[project.id] = value; }).catch(() => {});
      return;
    }
    if (element.matches("[data-contract-authority]")) {
      const section = element.dataset.contractAuthority, key = element.dataset.field;
      const value = container.querySelector(`[data-contract="${section}"][data-field="${key}"]`)?.value || "";
      const was = project.contract[section]?.[key]?.authority;
      if (was === "LOCKED_FACT" && element.value !== "LOCKED_FACT") {
        // Unlocking is a decision of its own, so it asks why. Closing the
        // dialog leaves the rule locked.
        const wanted = element.value;
        element.value = was;
        return openModal({
          title: `Unlock “${fieldLabel(key)}”`,
          body: `<p>This rule is locked. Once it is ${esc(stateLabel(wanted).toLowerCase())}, its wording can change.</p>
            <label>Why is it being unlocked?<textarea name="why" rows="3"></textarea></label>`,
          actions: [{ label: "Unlock", primary: true, handler: async dialog => {
            const why = dialog.querySelector("[name=why]").value;
            if (await act("set_contract", { project_id: project.id, section, field: key, value, authority: wanted, why }, { pid: project.id })) closeModal();
          } }],
        });
      }
      const why = element.value === "LOCKED_FACT" ? "Locked as a project rule" : "";
      return act("set_contract", { project_id: project.id, section, field: key, value, authority: element.value, why }, { pid: project.id });
    }
    if (element.matches("[data-proposal], [data-map]")) {
      const part = element.dataset.proposal !== undefined ? "proposal" : "map";
      const key = element.dataset.proposal ?? element.dataset.map;
      const result = await act("update_chapter_text", { project_id: project.id, chapter_id: chapter.id, part, fields: { [key]: element.value } });
      if (!result) return;
      // Editing approved words withdraws the approval — and that has to show,
      // in the outline as well as here, rather than leave a stale "approved".
      if (result.proposalAuthority !== chapter.proposalAuthority || result.reopened !== chapter.reopened) return refresh(project.id, chapter.id);
      cache.chapter[chapter.id] = result;
      return;
    }
    if (element.matches("[data-scene]")) {
      const saved = await act("update_scene", { project_id: project.id, chapter_id: chapter.id, scene_id: element.dataset.scene, fields: { [element.dataset.field]: element.value } });
      if (!saved) return;
      // Refetched quietly: a redraw would snap every open scene panel shut.
      const wasApproved = chapter.sceneAuthority === "APPROVED";
      const fresh = await studio("get_chapter", { project_id: project.id, chapter_id: chapter.id }).catch(() => null);
      if (fresh) cache.chapter[chapter.id] = fresh;
      if (element.dataset.field === "purpose") {
        const label = element.closest(".s-scene")?.querySelector("summary span");
        if (label) label.textContent = element.value || "No purpose yet";
      }
      if (wasApproved && fresh?.sceneAuthority !== "APPROVED") {
        toast("SCENE PLAN BACK TO WORKING", "It changed after approval, so it needs approving again.", 6000);
        const badge = container.querySelector(".s-tab-note .s-chip");
        if (badge) { badge.textContent = stateLabel(fresh.sceneAuthority); badge.className = `s-chip auth-${fresh.sceneAuthority.toLowerCase()}`; }
      }
      return;
    }
    if (element.matches("[data-chapter-title]")) {
      return act("update_chapter_text", { project_id: project.id, chapter_id: chapter.id, part: "title", fields: { title: element.value } }, { pid: project.id, cid: chapter.id });
    }
  });

  // The draft autosaves while typing, without redrawing anything.
  const draft = container.querySelector("[data-draft]");
  if (draft && !draft.readOnly) {
    const status = container.querySelector("[data-draft-status]");
    draft.addEventListener("input", () => {
      draftPending = { project_id: place.pid, chapter_id: place.cid, body: draft.value };
      // The cache is the source any redraw renders from, so it follows every
      // keystroke — not only completed saves.
      const cached = cache.chapter[place.cid];
      if (cached) cached.draft = { ...cached.draft, body: draft.value, words: words(draft.value) };
      if (status) status.textContent = `${words(draft.value).toLocaleString()} words · saving…`;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(flushDraft, 900);
    });
    draft.addEventListener("blur", flushDraft);
    draft.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); flushDraft(); }
    });
  }
}
