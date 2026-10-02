import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

/* Four cards that answer one question: what should I do with the time I have.
 *
 * TONIGHT supplies the constraint — when you are next due somewhere.
 * CONTINUE supplies the options — the 291 things already part-finished.
 * DAYBOOK closes the loop — what the archive recorded today.
 * AGAIN reaches past the front of the shelf for something long untouched.
 */

const CALENDAR_TTL_MS = 30 * 60 * 1000;
const COLD_AFTER_DAYS = 180;

// Wings whose half-finished records mean "come back to this". A part-watched
// YouTube video usually means it was closed, not that it is waiting.
const CONTINUE_WEIGHT = { tv: 100, manga: 90, books: 90, movies: 85, games: 80, podcasts: 40, youtube: 25 };
const REDISCOVERY_WINGS = new Set(["tv", "movies", "books", "manga", "games"]);

let calendarState = { events: [], fetchedAt: 0, ready: false, failed: false };
let daybookState = { posts: [], fetchedAt: 0, ready: false };
let redraw = () => {};

const asDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const minutesBetween = (from, to) => Math.round((to - from) / 60000);

function describeGap(minutes) {
  if (minutes < 1) return "now";
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/* What fits in the window, said in the archive's own terms rather than as a
 * number of minutes the reader has to translate. */
function fitsIn(minutes) {
  if (minutes >= 150) return "room for a film";
  if (minutes >= 75) return "room for a few episodes";
  if (minutes >= 40) return "room for an episode or two";
  if (minutes >= 20) return "time for one episode";
  return "not much time";
}

function nextCommitment(now = new Date()) {
  const upcoming = calendarState.events
    .map(event => ({ ...event, startsAt: asDate(event.start), endsAt: asDate(event.end) }))
    .filter(event => event.startsAt && event.endsAt)
    .sort((left, right) => left.startsAt - right.startsAt);
  const current = upcoming.find(event => event.startsAt <= now && event.endsAt > now);
  const next = upcoming.find(event => event.startsAt > now);
  return { current, next };
}

function renderTonight() {
  const now = new Date();
  if (!calendarState.ready) {
    return card("TONIGHT", calendarState.failed
      ? `<p class="home-card__quiet">The calendar could not be reached. Connect it in the Calendar room.</p>`
      : `<p class="home-card__quiet">Checking your calendar…</p>`);
  }
  const { current, next } = nextCommitment(now);
  if (current) {
    const left = minutesBetween(now, current.endsAt);
    return card("TONIGHT", `
      <p class="home-card__lead">You're on <b>${esc(current.title)}</b></p>
      <p class="home-card__note">Until ${current.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${esc(describeGap(left))} to go</p>`);
  }
  if (!next) {
    return card("TONIGHT", `
      <p class="home-card__lead">Nothing on the calendar</p>
      <p class="home-card__note">The evening is yours.</p>`);
  }
  const free = minutesBetween(now, next.startsAt);
  const sameDay = next.startsAt.toDateString() === now.toDateString();
  const when = sameDay
    ? next.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : next.startsAt.toLocaleDateString([], { weekday: "long" }) + " " + next.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Past a couple of days the countdown stops being useful and the gap itself is the news.
  const body = free > 60 * 36
    ? `<p class="home-card__note">Nothing until then — ${esc(describeGap(free))} free.</p>`
    : `<p class="home-card__note">${esc(describeGap(free))} free · ${esc(fitsIn(free))}</p>`;
  return card("TONIGHT", `
    <p class="home-card__lead">Next: <b>${esc(next.title)}</b> at ${esc(when)}</p>
    ${body}`);
}

/* When this record was last actually touched.
 *
 * A series carries no timestamp of its own — the watching happens on its
 * episodes — so reading only the top level makes every show look equally stale
 * and the list falls back to alphabetical. */
export function lastTouched(item) {
  let newest = asDate(item.lastPlayedAt || item.lastSourceAt || item.updatedAt);
  for (const episode of Object.values(item.episodes || {})) {
    const at = asDate(episode.lastPlayedAt || episode.completedAt);
    if (at && (!newest || at > newest)) newest = at;
  }
  return newest;
}

export function continueItems(state, limit = 6) {
  return Object.values(state.items || {})
    .filter(item => item.status === "in_progress" && item.title)
    .map(item => {
      const touched = lastTouched(item);
      const age = touched ? (Date.now() - touched.getTime()) / 86400000 : 9999;
      // Recent and meaningful first; a video abandoned in March is not waiting.
      // Something never touched at all sinks below everything that was.
      const score = (CONTINUE_WEIGHT[item.wing] || 20) - (touched ? Math.min(60, age) : 90);
      return { item, touched, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function progressOf(item) {
  if (item.progress?.total) return `${item.progress.completed}/${item.progress.total}`;
  const percent = Number(item.playbackPercent || 0);
  if (percent > 0) return `${Math.min(99, Math.round(percent))}%`;
  return "";
}

function renderContinue() {
  const state = getState();
  const rows = continueItems(state);
  const total = Object.values(state.items || {}).filter(item => item.status === "in_progress").length;
  if (!rows.length) {
    return card("CONTINUE", `<p class="home-card__quiet">Nothing part-finished. Unusual.</p>`);
  }
  const list = rows.map(({ item }) => {
    const mark = progressOf(item);
    return `<li><button data-home-continue="${esc(item.id)}" data-wing="${esc(item.wing)}">
      <b>${esc(item.title)}</b>
      <span>${esc(item.wing)}${mark ? ` · ${esc(mark)}` : ""}</span>
    </button></li>`;
  }).join("");
  return card("CONTINUE", `<ul class="home-card__list">${list}</ul>`, `${total} in progress`);
}

function renderDaybook() {
  if (!daybookState.ready) return card("TODAY", `<p class="home-card__quiet">Reading the journal…</p>`);
  const today = new Date().toLocaleDateString("en-CA");
  const posts = daybookState.posts.filter(post => String(post.occurredAt || "").slice(0, 10) === today);
  if (!posts.length) {
    return card("TODAY", `<p class="home-card__quiet">Nothing recorded yet today.</p>`);
  }
  const list = posts.slice(0, 6).map(post => {
    const at = asDate(post.occurredAt);
    const clock = at ? at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    return `<li><span class="home-card__time">${esc(clock)}</span><b>${esc(post.title || "")}</b>${post.subtitle ? `<span>${esc(post.subtitle)}</span>` : ""}</li>`;
  }).join("");
  return card("TODAY", `<ul class="home-card__log">${list}</ul>`, `${posts.length} recorded`);
}

/* Something to reach for that is not at the front of the shelf.
 *
 * The obvious version of this — "you loved it and have not touched it in a
 * year" — cannot be built yet: the archive was bulk imported and only the 46
 * records watched through the Vault carry a date at all. So the fallback is the
 * thing that IS known, and is arguably better against 520 unread books: owned,
 * never opened. As the journal accumulates real history the first branch starts
 * finding candidates and takes over on its own.
 */
function shelfPick(state) {
  const cutoff = Date.now() - COLD_AFTER_DAYS * 86400000;
  const everything = Object.values(state.items || {}).filter(item =>
    item.title && item.status !== "in_progress" && REDISCOVERY_WINGS.has(item.wing));

  const cold = everything.filter(item => {
    const touched = lastTouched(item);
    if (!touched || touched.getTime() > cutoff) return false;
    // Evidence of having liked it, read from behaviour rather than ratings —
    // there are two ratings in the whole archive.
    return item.favorite || Number(item.rating || 0) >= 7
      || Number(item.watchSeconds || 0) > 1800
      || Number(item.playtimeMinutes || item.gameMeta?.playtimeMinutes || 0) > 60
      || (item.status === "completed" && (item.progress?.total || 0) > 1);
  });

  const unopened = everything.filter(item =>
    item.owned && item.status !== "completed" && !lastTouched(item));

  const pool = cold.length ? cold : unopened;
  if (!pool.length) return null;
  // Stable for the day, so it does not change under you on every redraw.
  const seed = Number(new Date().toLocaleDateString("en-CA").split("-").join(""));
  return { item: pool[seed % pool.length], reason: cold.length ? "cold" : "unopened", pool: pool.length };
}

function renderAgain() {
  const picked = shelfPick(getState());
  if (!picked) return card("ON THE SHELF", `<p class="home-card__quiet">Nothing waiting that the Vault can see.</p>`);
  const { item, reason, pool } = picked;
  let note = esc(item.wing);
  if (reason === "cold") {
    const touched = lastTouched(item);
    const months = touched ? Math.round((Date.now() - touched.getTime()) / 86400000 / 30) : 0;
    if (months) note += ` · untouched ${months} month${months === 1 ? "" : "s"}`;
  } else {
    note += " · owned, never opened";
  }
  return card("ON THE SHELF", `
    <p class="home-card__lead"><b>${esc(item.title)}</b></p>
    <p class="home-card__note">${note}</p>
    <button class="home-card__open" data-home-continue="${esc(item.id)}" data-wing="${esc(item.wing)}">OPEN</button>`,
    `${pool} waiting`);
}

/* Genres only get a vote when there is no evidence from actual watching.
 * A tie falls to "in order", because showing a random episode of a serial is a
 * spoiler and showing episode one of a sitcom costs nothing. */
const EPISODIC_GENRES = new Set(["Animation", "Comedy", "Sitcom", "Adult Animation", "Dark Comedy",
  "Teen sitcom", "Children", "Family", "Reality", "Talk Show", "Game Show", "Documentary", "Variety"]);
const SERIAL_GENRES = new Set(["Drama", "Crime", "Thriller", "Science Fiction", "Mystery", "Fantasy",
  "Horror", "Action", "Adventure", "War", "Western", "Supernatural", "Anime", "Espionage", "Medical", "Legal"]);

const episodeOrder = episode => (Number(episode.season) || 0) * 1000 + (Number(episode.number) || 0);

/* Does this show get dipped into, or followed in order?
 *
 * Read from how it has actually been watched wherever there is enough history:
 * finishing S03E07 while S03E02 sits unwatched is someone treating a show as
 * dippable, and that is a far better answer than anything a genre list gives.
 * Genres decide only for shows never started. */
export function watchStyle(show) {
  const manual = show.tvMeta?.watchStyle;
  if (manual === "episodic" || manual === "order") return { style: manual, why: "you set this" };

  const episodes = Object.values(show.episodes || {}).filter(episode => episode.season && episode.number);
  const done = episodes.filter(episode => episode.status === "completed").map(episodeOrder).sort((a, b) => a - b);
  if (done.length >= 8) {
    const furthest = done[done.length - 1];
    const before = episodes.filter(episode => episodeOrder(episode) <= furthest).length;
    const gaps = before - done.length;
    return gaps > before * 0.15
      ? { style: "episodic", why: "you dip in and out of this" }
      : { style: "order", why: "you watch this in order" };
  }

  const genres = show.genres || [];
  const episodic = genres.filter(genre => EPISODIC_GENRES.has(genre)).length;
  const serial = genres.filter(genre => SERIAL_GENRES.has(genre)).length;
  if (episodic > serial) return { style: "episodic", why: "episodic by genre" };
  return { style: "order", why: serial ? "serialised by genre" : "in order to be safe" };
}

const playable = episode => Boolean(episode.sourcePath) && episode.status !== "completed";

/* Watched at all, not necessarily finished.
 *
 * `status` only becomes "completed" at 90%, so an episode put on and left still
 * reads as unwatched — and judging a show only by completions sends someone who
 * watched S02E12 an hour ago back to S01E01.
 *
 * `lastPlayedAt` is deliberately NOT enough on its own: handing a file to an
 * external player stamps it without a second of playback ever being measured,
 * which would make a show nobody has seen look started. Real measured time, or
 * a completion, or it does not count. */
const WATCHED_SECONDS = 300;
const touchedEpisode = episode => episode.status === "completed"
  || Number(episode.playbackSeconds || 0) > WATCHED_SECONDS
  || Number(episode.totalWatchSeconds || 0) > WATCHED_SECONDS;

/* The episode to put on. In precedence order: a show never started begins at
 * the beginning; a dippable show takes any unwatched episode; anything else
 * carries on from the furthest point actually reached. */
export function pickEpisode(show, seed = Date.now()) {
  const episodes = Object.values(show.episodes || {}).filter(episode => episode.season && episode.number);
  if (!episodes.length) return null;
  const unwatched = episodes.filter(playable).sort((left, right) => episodeOrder(left) - episodeOrder(right));
  if (!unwatched.length) return null;

  const touched = episodes.filter(touchedEpisode);
  if (!touched.length) return { episode: unwatched[0], reason: "from the beginning" };

  const { style, why } = watchStyle(show);
  if (style === "episodic") return { episode: unwatched[Math.floor(seed) % unwatched.length], reason: why };

  // Carry on from the furthest point reached rather than the earliest gap, so
  // skipping a season does not drag the next pick back to the start of it.
  const furthest = Math.max(...touched.map(episodeOrder));
  const ahead = unwatched.find(episode => episodeOrder(episode) > furthest);
  const current = unwatched.find(episode => episodeOrder(episode) === furthest);
  if (current) return { episode: current, reason: "picking this back up" };
  return { episode: ahead || unwatched[0], reason: ahead ? why : "back for what was skipped" };
}

function playSomething(state, seed) {
  const started = [], rest = [];
  for (const item of Object.values(state.items || {})) {
    if (item.wing !== "tv" || !item.episodes) continue;
    if (!Object.values(item.episodes).some(playable)) continue;
    (Object.values(item.episodes).some(touchedEpisode) ? started : rest).push(item);
  }
  // Shows already in flight first — that is what "put something on" usually means.
  const pool = started.length ? started : rest;
  if (!pool.length) return null;
  const show = pool[Math.floor(seed) % pool.length];
  const picked = pickEpisode(show, seed * 7);
  return picked ? { show, ...picked, pool: pool.length } : null;
}

let playSeed = Date.now();
export function rerollPlaySomething() { playSeed = Date.now() + Math.floor(Math.random() * 100000); }

function renderPlaySomething() {
  const picked = playSomething(getState(), playSeed);
  if (!picked) return card("PLAY SOMETHING", `<p class="home-card__quiet">Nothing playable and unwatched.</p>`);
  const { show, episode, reason, pool } = picked;
  const code = `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`;
  return card("PLAY SOMETHING", `
    <p class="home-card__lead"><b>${esc(show.title)}</b></p>
    <p class="home-card__note">${esc(code)}${episode.title ? ` — ${esc(episode.title)}` : ""}</p>
    <p class="home-card__quiet">${esc(reason)}</p>
    <div class="card-actions">
      <button class="home-card__open" data-play-episode data-show-id="${esc(show.id)}" data-episode-id="${esc(episode.id)}">PLAY</button>
      <button class="home-card__open ghost" data-play-reroll>SOMETHING ELSE</button>
    </div>`, `${pool} shows`);
}

/* Seasons within touching distance of done. One episode from finishing is the
 * easiest yes there is on a night with twenty-five minutes in it. */
export function nearlyDone(state, limit = 5) {
  const rows = [];
  for (const show of Object.values(state.items || {})) {
    if (show.wing !== "tv" || !show.episodes) continue;
    const seasons = new Map();
    for (const episode of Object.values(show.episodes)) {
      if (!episode.season) continue;
      if (!seasons.has(episode.season)) seasons.set(episode.season, []);
      seasons.get(episode.season).push(episode);
    }
    for (const [season, episodes] of seasons) {
      if (episodes.length < 3) continue;
      // Completions only here: "one episode left" has to mean actually finished,
      // not merely opened.
      const done = episodes.filter(episode => episode.status === "completed").length;
      const left = episodes.length - done;
      if (!done || left < 1 || left > 3) continue;
      const next = episodes.filter(playable).sort((a, b) => episodeOrder(a) - episodeOrder(b))[0];
      rows.push({ show, season, left, done, total: episodes.length, next });
    }
  }
  return rows.sort((left, right) => left.left - right.left || right.done - left.done).slice(0, limit);
}

function renderFinishThis() {
  const rows = nearlyDone(getState());
  if (!rows.length) return card("FINISH THIS", `<p class="home-card__quiet">Nothing close to done.</p>`);
  const list = rows.map(row => `<li><button ${row.next
    ? `data-play-episode data-show-id="${esc(row.show.id)}" data-episode-id="${esc(row.next.id)}"`
    : `data-home-continue="${esc(row.show.id)}" data-wing="tv"`}>
      <b>${esc(row.show.title)}</b>
      <span>S${String(row.season).padStart(2, "0")} · ${row.left} episode${row.left === 1 ? "" : "s"} left</span>
    </button></li>`).join("");
  return card("FINISH THIS", `<ul class="home-card__list">${list}</ul>`);
}

/* Consecutive days with something recorded, counted back from today. */
export function streakFrom(posts) {
  const days = new Set(posts.map(post => String(post.occurredAt || "").slice(0, 10)).filter(Boolean));
  if (!days.size) return { days: 0, today: false };
  const today = new Date().toLocaleDateString("en-CA");
  const cursor = new Date();
  // A streak survives today being empty until the day is over; yesterday is the
  // last day that can still be counted from.
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  for (;;) {
    const key = cursor.toLocaleDateString("en-CA");
    if (!days.has(key)) break;
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days: count, today: days.has(today), total: days.size };
}

function renderStreak() {
  if (!daybookState.ready) return card("STREAK", `<p class="home-card__quiet">Reading the journal…</p>`);
  const streak = streakFrom(daybookState.posts);
  if (!streak.days) {
    return card("STREAK", `<p class="home-card__quiet">Nothing recorded yet. Watch something and it starts.</p>`);
  }
  return card("STREAK", `
    <p class="home-card__lead streak-count"><b>${streak.days}</b> day${streak.days === 1 ? "" : "s"} running</p>
    <p class="home-card__note">${streak.today ? "Today is counted." : "Nothing yet today — it holds until midnight."}</p>`,
    `${streak.total} recorded`);
}

/* An honest to-do list rather than a status light. Every line is a real count
 * and every line is something that can actually be acted on. */
export function attentionItems(state) {
  const items = Object.values(state.items || {});
  const shows = items.filter(item => item.wing === "tv");
  const episodes = shows.flatMap(show => Object.values(show.episodes || {}));
  return [
    { label: "records with no artwork", count: items.filter(item => ["tv", "movies", "books", "games"].includes(item.wing) && !item.artwork).length, hook: "data-artwork-review" },
    { label: "episodes with no file", count: episodes.filter(episode => !episode.sourcePath).length, hook: "data-master-scan" },
    { label: "episodes with no air date", count: episodes.filter(episode => !episode.airDate).length, hook: "" },
    { label: "episodes with no title", count: episodes.filter(episode => !episode.title).length, hook: "" },
    { label: "podcasts holding no episodes", count: items.filter(item => item.wing === "podcasts" && !Object.keys(item.episodes || {}).length).length, hook: "" },
    { label: "channels with no videos", count: items.filter(item => item.wing === "youtube" && !Object.keys(item.uploads || item.videos || {}).length).length, hook: "" },
  ].filter(row => row.count > 0);
}

function renderAttention() {
  const rows = attentionItems(getState());
  if (!rows.length) return card("NEEDS ATTENTION", `<p class="home-card__quiet">Nothing outstanding. Remarkable.</p>`);
  const list = rows.map(row => `<li><b>${row.count.toLocaleString()}</b><span>${esc(row.label)}</span></li>`).join("");
  return card("NEEDS ATTENTION", `<ul class="attention-list">${list}</ul>`);
}

const card = (label, body, badge = "") => `<article class="home-card">
  <header><span class="eyebrow">${esc(label)}</span>${badge ? `<small>${esc(badge)}</small>` : ""}</header>
  ${body}
</article>`;

export function renderHomeArchiveCards({ cinema = false } = {}) {
  if (cinema) return `<details class="cinema-extra cinema-archive-extra"><summary><b>More from your archive</b><span>Rediscover, finish, and review</span></summary><section class="home-cards">
    ${renderAgain()}${renderPlaySomething()}${renderFinishThis()}${renderDaybook()}${renderStreak()}${renderAttention()}
  </section></details>`;
  return `<section class="home-cards" aria-label="Your archive right now">
    ${renderTonight()}
    ${renderPlaySomething()}
    ${renderFinishThis()}
    ${renderContinue()}
    ${renderDaybook()}
    ${renderStreak()}
    ${renderAgain()}
    ${renderAttention()}
  </section>`;
}

async function loadCalendar() {
  if (Date.now() - calendarState.fetchedAt < CALENDAR_TTL_MS) return;
  calendarState.fetchedAt = Date.now();
  const now = new Date(), horizon = new Date(now.getTime() + 8 * 86400000);
  try {
    const response = await fetch("./__vault/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "calendar-events" },
      body: JSON.stringify({ timeMin: now.toISOString(), timeMax: horizon.toISOString() }),
    });
    if (!response.ok) throw new Error("calendar unavailable");
    const payload = await response.json();
    calendarState = { events: payload.events || [], fetchedAt: Date.now(), ready: true, failed: false };
  } catch {
    calendarState = { ...calendarState, ready: true, failed: true };
  }
  redraw();
}

async function loadDaybook() {
  try {
    const response = await fetch("./__vault/daybook/recent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "daybook-recent" },
      body: JSON.stringify({ limit: 40 }),
    });
    if (!response.ok) throw new Error("journal unavailable");
    const payload = await response.json();
    daybookState = { posts: payload.posts || [], fetchedAt: Date.now(), ready: true };
  } catch {
    daybookState = { posts: [], fetchedAt: Date.now(), ready: true };
  }
  redraw();
}

/* Both reads happen after the first paint, so Home draws immediately from the
 * archive it already has and fills these in when the answers arrive. */
export function ensureHomeArchiveCards(onChanged = () => {}) {
  redraw = onChanged;
  loadCalendar();
  loadDaybook();
}

export function refreshHomeArchiveCards() {
  calendarState.fetchedAt = 0;
  loadCalendar();
  loadDaybook();
}
