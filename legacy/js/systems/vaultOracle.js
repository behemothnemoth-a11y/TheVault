import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { connectionsForNode } from "./relationshipGraph.js";

const WING_ALIASES = {
  movies: ["movie", "movies", "film", "films"],
  tv: ["tv", "television", "series", "show", "shows"],
  games: ["game", "games", "gaming"],
  books: ["book", "books", "novel", "novels"],
  youtube: ["youtube", "video", "videos"],
  music: ["music", "song", "songs", "track", "tracks"],
  podcasts: ["podcast", "podcasts"],
  manga: ["manga"],
  food: ["food", "meal", "meals", "restaurant", "restaurants"],
  trips: ["trip", "trips", "travel", "place", "places"],
  calendar: ["calendar", "event", "events"]
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalized = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const visibleItems = state => Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
const citation = (type, id, label, path, detail = {}) => ({ type, id, label, path, detail });

function includesPhrase(question, phrase) {
  return ` ${normalized(question)} `.includes(` ${normalized(phrase)} `);
}

function detectWing(question) {
  for (const [wing, aliases] of Object.entries(WING_ALIASES)) {
    if (aliases.some(alias => includesPhrase(question, alias))) return wing;
  }
  return null;
}

function detectGenre(question, state) {
  const genres = [...new Set(visibleItems(state).flatMap(item => item.genres || []).filter(Boolean))]
    .sort((a, b) => normalized(b).length - normalized(a).length);
  return genres.find(genre => includesPhrase(question, genre) ||
    (normalized(genre) === "science fiction" && includesPhrase(question, "sci fi")) ||
    (normalized(genre) === "sci fi" && includesPhrase(question, "science fiction"))) || null;
}

function bestItemMatch(question, state, wing = null) {
  const target = normalized(question).replace(/\b(19|20)\d{2}\b/g, " ");
  const items = visibleItems(state).filter(item => !wing || item.wing === wing);
  const embedded = items.filter(item => {
    const title = normalized(item.title);
    return title.length >= 3 && ` ${target} `.includes(` ${title} `);
  }).sort((a, b) => normalized(b.title).length - normalized(a.title).length);
  if (embedded[0]) return embedded[0];
  const quoted = clean(question).match(/["“](.+?)["”]/)?.[1];
  if (!quoted) return null;
  return items.find(item => normalized(item.title) === normalized(quoted)) ||
    items.find(item => normalized(item.title).includes(normalized(quoted))) || null;
}

function recordCitation(item) {
  return citation("record", item.id, item.title, `items.${item.id}`, {
    wing: item.wing,
    year: item.year || null,
    genres: item.genres || [],
    owned: Boolean(item.owned),
    status: item.status || null,
    rating: item.rating || null
  });
}

function eventCitation(event) {
  return citation("event", event.id, event.meta?.title || event.type, `events.${event.id}`, {
    type: event.type,
    timestamp: event.timestamp,
    itemId: event.itemId || null,
    episodeId: event.episodeId || null
  });
}

function result(status, intent, answer, citations = [], facts = [], confidence = 1, coverage = null) {
  return { status, intent, answer, citations, facts, confidence, coverage };
}

function askRelationships(question, state) {
  if (!/\b(connect|connected|connection|relationship|related)\w*\b/i.test(question)) return null;
  const item = bestItemMatch(question, state);
  if (!item) return result("insufficient", "relationships",
    "I can trace a connection only after I can identify one exact Vault record. Include the full title, preferably in quotation marks.", [], [], 0.45);
  const links = connectionsForNode("item", item.id, state);
  const citations = [recordCitation(item), ...links.slice(0, 60).map(link => citation(
    "relationship", link.id, `${link.kind.replaceAll("_", " ")} → ${link.to.label}`,
    link.derived ? `derived.${link.id}` : `relationships.${link.id}`,
    { source: link.source, derived: Boolean(link.derived), evidence: link.evidence, targetType: link.to.type, targetId: link.to.id }
  ))];
  if (!links.length) return result("answered", "relationships", `${item.title} has no filed or derived connections yet.`, citations, [{ label: "Connections", value: 0 }], 1, { matched: 0, cited: 0, complete: true });
  const names = links.slice(0, 8).map(link => `${link.to.label} (${link.kind.replaceAll("_", " ")})`);
  return result("answered", "relationships", `${item.title} has ${links.length} evidence-backed connection${links.length === 1 ? "" : "s"}: ${names.join(", ")}${links.length > names.length ? ", and more" : ""}.`, citations,
    [{ label: "Connections", value: links.length }, { label: "Record", value: item.title }], 1,
    { matched: links.length, cited: Math.min(links.length, 60), complete: links.length <= 60 });
}

function askEpisodes(question, state) {
  if (!includesPhrase(question, "episode") && !includesPhrase(question, "episodes")) return null;
  const show = bestItemMatch(question, state, "tv");
  let rows = (show ? [show] : visibleItems(state).filter(item => item.wing === "tv")).flatMap(item =>
    Object.values(item.episodes || {}).map(episode => ({ item, episode })));
  const q = normalized(question);
  if (/\b(unwatched|unfinished|incomplete|backlog)\b/.test(q)) rows = rows.filter(row => row.episode.status !== "completed");
  if (/\b(watched|completed|finished)\b/.test(q) && !/\bunwatched\b/.test(q)) rows = rows.filter(row => row.episode.status === "completed");
  if (/\b(missing file|missing files|no file|unlinked)\b/.test(q)) rows = rows.filter(row => !row.episode.sourcePath);
  if (/\b(with file|with files|linked|playable)\b/.test(q)) rows = rows.filter(row => Boolean(row.episode.sourcePath));
  const rating = Number(q.match(/rated\s+(?:above|over)\s+(\d+)/)?.[1] || 0);
  if (rating) rows = rows.filter(row => Number(row.episode.rating || 0) > rating);
  const isCount = /\b(how many|count|number of)\b/.test(q);
  const sample = rows.slice(0, 60);
  const citations = sample.map(({ item, episode }) => citation("episode", episode.id,
    `${item.title} S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`,
    `items.${item.id}.episodes.${episode.id}`, {
      recordId: item.id, status: episode.status || null, rating: episode.rating || null,
      sourceLinked: Boolean(episode.sourcePath)
    }));
  const scope = show ? ` in ${show.title}` : " across the TV archive";
  const answer = isCount
    ? `There are ${rows.length.toLocaleString()} matching episode${rows.length === 1 ? "" : "s"}${scope}.`
    : rows.length ? `I found ${rows.length.toLocaleString()} matching episode${rows.length === 1 ? "" : "s"}${scope}. The citation list shows the first ${Math.min(rows.length, 60).toLocaleString()}.`
      : `No episodes match that evidence filter${scope}.`;
  return result("answered", "episodes", answer, citations, [
    { label: "Matching episodes", value: rows.length }, { label: "Scope", value: show?.title || "All television" }
  ], 1, { matched: rows.length, cited: citations.length, complete: rows.length <= 60 });
}

function askCollections(question, state) {
  if (!/\b(collection|shelf)\b/i.test(question)) return null;
  const collections = Object.values(state.collections || {});
  const match = collections.filter(entry => ` ${normalized(question)} `.includes(` ${normalized(entry.title)} `))
    .sort((a, b) => normalized(b.title).length - normalized(a.title).length)[0];
  if (!match) return null;
  const items = (match.itemIds || []).map(id => state.items[id]).filter(Boolean);
  const citations = [citation("collection", match.id, match.title, `collections.${match.id}`, {
    status: match.status, itemCount: items.length
  }), ...items.slice(0, 59).map(recordCitation)];
  return result("answered", "collection", `${match.title} contains ${items.length} record${items.length === 1 ? "" : "s"}${items.length ? `: ${items.slice(0, 8).map(item => item.title).join(", ")}${items.length > 8 ? ", and more" : ""}` : ""}.`, citations,
    [{ label: "Collection records", value: items.length }, { label: "Collection status", value: match.status }], 1,
    { matched: items.length, cited: Math.min(items.length, 59), complete: items.length <= 59 });
}

function askImports(question, state) {
  if (!/\b(import|imported|export batch|intake)\b/i.test(question)) return null;
  const batches = [...(state.metadata?.stage28?.batches || [])].filter(batch => batch.status === "applied")
    .sort((a, b) => Date.parse(b.importedAt) - Date.parse(a.importedAt));
  const recordCount = batches.reduce((sum, batch) => sum + batch.itemIds.length, 0);
  const citations = batches.slice(0, 60).map(batch => citation("import_batch", batch.id,
    `${batch.source} import`, `metadata.stage28.batches.${batch.id}`, {
      source: batch.source, importedAt: batch.importedAt, records: batch.itemIds.length,
      relationships: batch.relationshipIds.length, rawRetained: batch.rawRetained
    }));
  return result("answered", "imports", batches.length
    ? `${batches.length} active import batch${batches.length === 1 ? "" : "es"} added ${recordCount} record${recordCount === 1 ? "" : "s"}. The newest is a ${batches[0].source} batch from ${new Date(batches[0].importedAt).toLocaleString()}.`
    : "There are no active real-data import batches yet.", citations,
    [{ label: "Active batches", value: batches.length }, { label: "Imported records", value: recordCount }], 1,
    { matched: batches.length, cited: citations.length, complete: batches.length <= 60 });
}

function askEvents(question, state) {
  const q = normalized(question);
  if (!/\b(when|recent|recently|timeline|history|happened|activity)\b/.test(q)) return null;
  const item = bestItemMatch(question, state);
  let events = [...(state.events || [])];
  if (item) events = events.filter(event => event.itemId === item.id || normalized(event.meta?.title).includes(normalized(item.title)));
  if (/\brate|rated|rating\b/.test(q)) events = events.filter(event => event.type.includes("RATED") || event.type.includes("RATING"));
  if (/\bwatch|watched|episode\b/.test(q)) events = events.filter(event => event.type.includes("EPISODE") || event.type.includes("WATCH"));
  events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const selected = events.slice(0, /\bwhen\b/.test(q) ? 1 : 20);
  const citations = [...(item ? [recordCitation(item)] : []), ...selected.map(eventCitation)];
  if (!selected.length) return result("answered", "events", `No canonical event${item ? ` for ${item.title}` : ""} matches that question. I will not infer a date from imported metadata.`, citations, [{ label: "Matching events", value: 0 }], 1, { matched: 0, cited: 0, complete: true });
  const newest = selected[0];
  return result("answered", "events", /\bwhen\b/.test(q)
    ? `The newest matching canonical record is ${new Date(newest.timestamp).toLocaleString()}: ${newest.meta?.title || newest.type}.`
    : `I found ${events.length} matching canonical event${events.length === 1 ? "" : "s"}. The newest is ${new Date(newest.timestamp).toLocaleString()}: ${newest.meta?.title || newest.type}.`, citations,
    [{ label: "Matching events", value: events.length }, { label: "Newest timestamp", value: newest.timestamp }], 1,
    { matched: events.length, cited: selected.length, complete: events.length <= selected.length });
}

function askItems(question, state) {
  const q = normalized(question);
  const queryLanguage = /\b(how many|count|number of|find|show|list|which|what)\b/.test(q);
  if (!queryLanguage) return null;
  const wing = detectWing(question);
  const genre = detectGenre(question, state);
  const owned = /\b(do i have|i own|owned|in my collection)\b/.test(q);
  const unfinished = /\b(unfinished|incomplete|backlog|not finished)\b/.test(q);
  const completed = !unfinished && /\b(completed|finished)\b/.test(q);
  const before = Number(q.match(/before\s+((?:19|20)\d{2})/)?.[1] || 0);
  const after = Number(q.match(/after\s+((?:19|20)\d{2})/)?.[1] || 0);
  const ratedOver = Number(q.match(/rated\s+(?:above|over)\s+(\d+)/)?.[1] || 0);
  let items = visibleItems(state).filter(item =>
    (!wing || item.wing === wing) &&
    (!genre || (item.genres || []).some(value => normalized(value) === normalized(genre))) &&
    (!owned || item.owned === true) &&
    (!unfinished || item.status !== "completed") &&
    (!completed || item.status === "completed") &&
    (!before || Number(item.year) < before) &&
    (!after || Number(item.year) > after) &&
    (!ratedOver || Number(item.rating || 0) > ratedOver)
  );
  const hasFilter = Boolean(wing || genre || owned || unfinished || completed || before || after || ratedOver);
  if (!hasFilter && !/\b(all records|archive records|everything)\b/.test(q)) return null;
  items = items.sort((a, b) => a.title.localeCompare(b.title));
  const citations = items.slice(0, 60).map(recordCitation);
  const scope = [owned && "owned", unfinished && "unfinished", completed && "completed", genre, wing, before && `before ${before}`, after && `after ${after}`, ratedOver && `rated over ${ratedOver}`].filter(Boolean).join(" ") || "archive";
  const isCount = /\b(how many|count|number of)\b/.test(q);
  const answer = isCount
    ? `There are ${items.length.toLocaleString()} matching Vault record${items.length === 1 ? "" : "s"} (${scope}).`
    : items.length ? `I found ${items.length.toLocaleString()} matching Vault record${items.length === 1 ? "" : "s"} (${scope}): ${items.slice(0, 10).map(item => item.title).join(", ")}${items.length > 10 ? ", and more" : ""}.`
      : `No Vault records match these filters (${scope}).`;
  return result("answered", "records", answer, citations, [
    { label: "Matching records", value: items.length }, { label: "Evidence scope", value: scope }
  ], 1, { matched: items.length, cited: citations.length, complete: items.length <= 60 });
}

export function askVault(question, state = getState()) {
  const prompt = clean(question);
  if (!prompt) return result("insufficient", "none", "Ask a question about records, episodes, events, imports, collections, or relationships.", [], [], 0);
  const handlers = [askRelationships, askEpisodes, askCollections, askImports, askEvents, askItems];
  for (const handler of handlers) {
    const answer = handler(prompt, state);
    if (answer) return answer;
  }
  return result("unsupported", "unsupported",
    "That question is outside the facts I can prove locally. Try a count or list by wing, genre, ownership, status, year, or rating; ask about episodes, an exact title’s connections, a named collection, imports, or canonical history.", [], [], 0.2);
}

export function recordOracleAnswer(question, answer) {
  const entry = {
    id: createId("oracle"), question: clean(question), askedAt: new Date().toISOString(),
    status: answer.status, intent: answer.intent, answer: answer.answer,
    confidence: answer.confidence, facts: structuredClone(answer.facts || []),
    citations: structuredClone((answer.citations || []).slice(0, 60)), coverage: structuredClone(answer.coverage)
  };
  update(save => {
    save.metadata.stage30 ||= {
      startedAt: entry.askedAt, history: [], localOnly: true, evidenceRequired: true,
      externalInference: false, citationLimit: 60
    };
    save.metadata.stage30.history.push(entry);
    save.metadata.stage30.history = save.metadata.stage30.history.slice(-120);
  });
  emit("ORACLE_QUERY_RECORDED", { meta: { title: entry.question, answerId: entry.id, status: entry.status } });
  return entry.id;
}

let currentAnswer = null;
let currentQuestion = "";

function answerMarkup(answer) {
  if (!answer) return `<section class="panel oracle-empty"><b>ASK THE ARCHIVE, NOT THE INTERNET.</b><p>The Oracle answers only from the records already inside this Vault. Unsupported questions are refused instead of guessed.</p></section>`;
  const coverage = answer.coverage ? `<small class="oracle-coverage">EVIDENCE COVERAGE: ${answer.coverage.cited}/${answer.coverage.matched}${answer.coverage.complete ? " COMPLETE" : " VISIBLE SAMPLE"}</small>` : "";
  return `<section class="panel oracle-answer ${answer.status}"><header><span>${esc(answer.status.toUpperCase())} / ${esc(answer.intent.toUpperCase())}</span><b>${Math.round(answer.confidence * 100)}% GROUNDED</b></header><h3>${esc(answer.answer)}</h3>${coverage}
    <div class="oracle-facts">${(answer.facts || []).map(fact => `<article><b>${esc(fact.value)}</b><span>${esc(fact.label)}</span></article>`).join("")}</div></section>
    <section class="panel oracle-citations"><h3>VISIBLE EVIDENCE</h3>${answer.citations?.length ? answer.citations.map(source => `<article><span>${esc(source.type.replaceAll("_", " ").toUpperCase())}</span><div><b>${esc(source.label)}</b><small>${esc(source.id)} / ${esc(source.path)}</small></div><details><summary>PROVEN FIELDS</summary><pre>${esc(JSON.stringify(source.detail, null, 2))}</pre></details></article>`).join("") : `<p>NO RECORD OR EVENT CITATIONS WERE AVAILABLE FOR THIS RESPONSE.</p>`}</section>`;
}

export function renderVaultOracle() {
  if (location.hash !== "#/oracle") return;
  const history = [...(getState().metadata.stage30?.history || [])].reverse().slice(0, 12);
  document.querySelector("#view").innerHTML = `<section class="oracle-hero panel"><div><span class="eyebrow">STAGE 30 // GROUNDED LOCAL QUERY ENGINE</span><h2>VAULT ORACLE</h2><p>Ask plain-language questions. Every supported answer points back to the exact records, episode files, relationships, import batches, or canonical events that prove it.</p></div><div class="oracle-seal">NO GUESSING</div></section>
    <section class="panel oracle-query"><label for="oracle-question">QUESTION FOR THE ARCHIVE</label><div><input id="oracle-question" data-oracle-question aria-label="Question for the archive" value="${esc(currentQuestion)}" placeholder="HOW MANY HORROR MOVIES DO I HAVE?"><button class="button primary" data-oracle-ask>ASK ORACLE</button></div><nav>${[
      "How many horror movies are in the archive?", "How many TV episodes are missing files?",
      "What happened recently?", "What have I imported?"
    ].map(prompt => `<button data-oracle-sample="${esc(prompt)}">${esc(prompt)}</button>`).join("")}</nav></section>
    ${answerMarkup(currentAnswer)}
    <section class="panel oracle-history"><h3>QUESTION LEDGER</h3>${history.map(entry => `<article><time>${new Date(entry.askedAt).toLocaleString()}</time><b>${esc(entry.question)}</b><span>${esc(entry.status.toUpperCase())} / ${entry.citations.length} CITATIONS</span></article>`).join("") || "<p>NO QUESTIONS RECORDED YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Vault Oracle";
  document.querySelector("#view-code").textContent = "VAULT://ORACLE";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-oracle-supervision-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/oracle-supervision.css"; link.dataset.oracleSupervisionStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage30) update(save => {
    save.metadata.stage30 = {
      startedAt: new Date().toISOString(), history: [], localOnly: true,
      evidenceRequired: true, externalInference: false, citationLimit: 60
    };
  });
  document.addEventListener("click", event => {
    const ask = event.target.closest("[data-oracle-ask]");
    const sample = event.target.closest("[data-oracle-sample]");
    if (!ask && !sample) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const input = document.querySelector("[data-oracle-question]");
    if (sample) input.value = sample.dataset.oracleSample;
    currentQuestion = input.value.trim();
    currentAnswer = askVault(currentQuestion);
    recordOracleAnswer(currentQuestion, currentAnswer);
    renderVaultOracle();
    toast(currentAnswer.status === "answered" ? "ORACLE ANSWER GROUNDED" : "ORACLE REFUSED TO GUESS", `${currentAnswer.citations.length} visible citations`, 5500);
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !event.target.matches("[data-oracle-question]")) return;
    event.preventDefault(); document.querySelector("[data-oracle-ask]")?.click();
  }, true);
  on("WING_VISITED", event => { if (event.wing === "oracle") setTimeout(renderVaultOracle, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderVaultOracle, 0));
  setTimeout(renderVaultOracle, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
