import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

/* The Vault's outbound journal.
 *
 * Archive activity becomes a short post — what it was, and when it actually
 * happened — which is written to a local journal on this machine and delivered
 * to Daybook when an endpoint is configured. Nothing is lost while it is not:
 * posts wait in an outbox and go out on the next flush.
 *
 * Adding a wing is one entry in POST_BUILDERS. Television is wired; movies,
 * books and comics slot in beside it without touching anything else here.
 */

// One post per thing per window. The television player fires `play` on every
// unpause, and a single evening should not become nine identical posts.
const DEDUPE_MS = 4 * 60 * 60 * 1000;

/* Local wall-clock time with its offset, e.g. 2026-09-12T20:15:00-05:00.
 *
 * toISOString() is UTC, which from early evening onward names tomorrow and puts
 * the post on the wrong day. Daybook is a diary, so the day has to be the day it
 * was here, not in Greenwich. */
export function localStamp(date = new Date()) {
  const pad = value => String(Math.floor(Math.abs(value))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(offset / 60)}:${pad(Math.abs(offset) % 60)}`;
}

const localZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
};

const episodeCode = episode =>
  `S${String(episode?.season ?? 0).padStart(2, "0")}E${String(episode?.number ?? 0).padStart(2, "0")}`;

/* A deterministic id, so a post that is retried after a lost response is
 * recognised as the same post rather than filed twice. */
const stableId = text => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0;
  return `dbk_${(hash >>> 0).toString(36)}`;
};

/* The verb a post leads with. A plain start says nothing — the archive already
 * records that — so it carries no verb at all. Everything else is explicit. */
const verbFor = (kind, resumed) => {
  if (resumed) return "Resumed";
  if (kind.endsWith("_finished") || kind.endsWith("_completed")) return "Finished";
  if (kind.endsWith("_stopped")) return "Stopped";
  return "";
};

const plainItem = (state, itemId) => {
  const item = state.items?.[itemId];
  return item ? { item, name: item.title || "" } : null;
};

const POST_BUILDERS = {
  tv(state, { itemId, episodeId, kind, resumed }) {
    const show = state.items?.[itemId], episode = show?.episodes?.[episodeId];
    if (!show || !episode) return null;
    const code = episodeCode(episode);
    const verb = verbFor(kind, resumed);
    return {
      wing: "tv", category: "Show",
      title: show.title || "Television",
      code,
      name: episode.title || "",
      // Kept for anything reading older entries, which only ever had this.
      subtitle: episode.title ? `${code}, “${episode.title}”` : code,
      verb,
      text: `${verb} ${show.title || "an episode"} ${code}${episode.title ? ` — ${episode.title}` : ""}`.trim(),
    };
  },
  movies(state, { itemId, kind, resumed }) {
    const found = plainItem(state, itemId);
    if (!found) return null;
    const year = found.item.year ? ` (${found.item.year})` : "";
    const verb = verbFor(kind, resumed);
    return { wing: "movies", category: "Movie", title: `${found.name}${year}`, verb, text: `${verb} ${found.name}${year}`.trim() };
  },
  books(state, { itemId, kind, resumed }) {
    const found = plainItem(state, itemId);
    if (!found) return null;
    const author = (found.item.authors || [])[0];
    const by = author ? ` — ${author}` : "";
    const verb = verbFor(kind, resumed);
    return { wing: "books", category: "Book", title: `${found.name}${by}`, verb, text: `${verb} ${found.name}${by}`.trim() };
  },
  manga(state, { itemId, kind, resumed }) {
    const found = plainItem(state, itemId);
    if (!found) return null;
    const verb = verbFor(kind, resumed);
    return { wing: "manga", category: "Book", title: found.name, verb, text: `${verb} ${found.name}`.trim() };
  },
  games(state, { itemId, kind, resumed }) {
    const found = plainItem(state, itemId);
    if (!found) return null;
    const verb = verbFor(kind, resumed);
    return { wing: "games", category: "Game", title: found.name, verb, text: `${verb} ${found.name}`.trim() };
  },
  youtube(state, { itemId, kind, resumed, videoTitle }) {
    const found = plainItem(state, itemId);
    if (!found) return null;
    const what = bounded(videoTitle) || found.name;
    const channel = videoTitle && found.name ? ` — ${found.name}` : "";
    const verb = verbFor(kind, resumed);
    return { wing: "youtube", category: "Video", title: `${what}${channel}`, verb, text: `${verb} ${what}${channel}`.trim() };
  },
};

const bounded = value => String(value ?? "").trim().slice(0, 300);

function buildPost(kind, wing, details) {
  const builder = POST_BUILDERS[wing];
  if (!builder) return null;
  const now = new Date();
  const shaped = builder(getState(), { ...details, kind });
  if (!shaped) return null;
  const bucket = Math.floor(now.getTime() / DEDUPE_MS);
  return {
    id: stableId(`${kind}|${details.itemId}|${details.episodeId || ""}|${bucket}`),
    kind,
    resumed: Boolean(details.resumed),
    occurredAt: localStamp(now),
    timeZone: localZone(),
    itemId: details.itemId || "",
    episodeId: details.episodeId || "",
    ...shaped,
  };
}

/* Has this exact thing already been posted inside the window? The record lives
 * in the archive so it survives a reload, not just this page view. */
function alreadyPosted(key) {
  const posted = getState().metadata?.daybook?.posted || {};
  const last = Number(posted[key] || 0);
  return last > 0 && Date.now() - last < DEDUPE_MS;
}

function rememberPosted(key) {
  update(save => {
    save.metadata.daybook ||= {};
    const posted = save.metadata.daybook.posted || {};
    posted[key] = Date.now();
    // Keep the ledger from growing without bound; anything past the window is inert.
    const fresh = {};
    for (const [name, when] of Object.entries(posted)) {
      if (Date.now() - Number(when || 0) < DEDUPE_MS * 12) fresh[name] = when;
    }
    save.metadata.daybook.posted = fresh;
  });
}

async function deliver(posts) {
  try {
    const response = await fetch("./__vault/daybook/post", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "daybook-post" },
      body: JSON.stringify({ posts }),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/* Record one piece of archive activity. Safe to call more than once for the
 * same thing — the window decides whether it becomes a post. */
export async function postToDaybook(kind, wing, details = {}) {
  if (!details.itemId) return null;
  const key = `${kind}|${details.itemId}|${details.episodeId || ""}|${details.resumed ? "r" : ""}`;
  if (alreadyPosted(key)) return null;
  const post = buildPost(kind, wing, details);
  if (!post) return null;
  rememberPosted(key);
  return deliver([post]);
}

export async function daybookStatus() {
  try {
    const response = await fetch("./__vault/daybook/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "daybook-status" },
      body: JSON.stringify({}),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function flushDaybook() {
  try {
    const response = await fetch("./__vault/daybook/flush", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "daybook-flush" },
      body: JSON.stringify({}),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/* Google Drive is how Daybook reads this archive: the Vault publishes its feed
 * to one file it created itself, and nothing is exposed to the network. */
export async function driveStatus() {
  try {
    const response = await fetch("./__vault/drive/oauth/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "drive-oauth-status" },
      body: JSON.stringify({}),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function connectDrive() {
  const response = await fetch("./__vault/drive/oauth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "drive-oauth-start" },
    body: JSON.stringify({}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.authUrl) throw new Error("Google Drive could not be connected. Check the OAuth client.");
  window.open(result.authUrl, "_blank", "noopener");
  return result;
}

export async function publishToDrive() {
  const response = await fetch("./__vault/daybook/drive/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "daybook-drive-publish" },
    body: JSON.stringify({}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The feed could not be published to Drive.");
  return result;
}

export async function configureDaybook({ endpoint, headers = {}, method = "POST", enabled = true }) {
  const response = await fetch("./__vault/daybook/configure", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "daybook-configure" },
    body: JSON.stringify({ endpoint, headers, method, enabled }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Daybook could not be configured.");
  return response.json();
}

const EVENT_POSTS = {
  PLAYBACK_SESSION_STARTED: "episode_started",
  PLAYBACK_CONFIRMED_FINISHED: "episode_finished",
  EPISODE_COMPLETED: "episode_finished",
  READING_OPENED: "reading_started",
  GAME_LAUNCHED: "game_started",
  MOVIE_PLAYBACK_STARTED: "movie_started",
  YOUTUBE_VIDEO_OPENED: "video_started",
  COMIC_READER_OPENED: "reading_started",
};

let wired = false;

export function ensureDaybook() {
  if (wired) return;
  wired = true;
  // Until Daybook has a card of its own, this is how it is set up:
  //   vaultDaybook.connectDrive()   — authorise Google Drive, once
  //   vaultDaybook.publishToDrive() — push the feed up by hand
  //   vaultDaybook.driveStatus()    — check the connection and the file id
  globalThis.vaultDaybook = {
    configure: configureDaybook, status: daybookStatus, flush: flushDaybook, post: postToDaybook,
    connectDrive, driveStatus, publishToDrive,
  };
  on("*", event => {
    const kind = EVENT_POSTS[event?.type];
    if (!kind || !event.itemId) return;
    const wing = event.wing || getState().items?.[event.itemId]?.wing;
    if (!wing) return;
    postToDaybook(kind, wing, { itemId: event.itemId, episodeId: event.episodeId });
  });
  // Anything that could not be delivered earlier goes out now.
  flushDaybook();
}
