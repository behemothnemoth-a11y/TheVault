import { emit } from "../core/events.js";
import { getState } from "../core/store.js";

// The shape of the Games wing: what's playing, what you own and can start right
// now, what you own but would have to download, and what you only want. Cards for
// games in the same franchise collapse into one series card.

const WORKSHOP_KINDS = new Set(["workshop", "project"]);
export const meta = item => item.gameMeta || {};
export const isGame = item => item?.wing === "games" && !WORKSHOP_KINDS.has(meta(item).kind);

export const steamSource = item => (meta(item).sources || []).find(source => source.source === "steam") || null;
export const appIdOf = item => {
  const source = steamSource(item);
  const fromSource = String(source?.appId || "").trim();
  if (/^\d+$/.test(fromSource)) return fromSource;
  const fromId = /^game_steam_(\d+)$/.exec(String(item.id || ""));
  return fromId ? fromId[1] : "";
};
export const isInstalled = item => Boolean(steamSource(item)?.installed);
export const installSizeGb = item => Number(steamSource(item)?.sizeGb || 0);

// Sequel numbers, roman numerals and edition words are not part of a franchise name.
const EDITION = /\b(?:\d{1,2}|i{1,3}|iv|vi{0,3}|ix|x{1,3}|remastered?|remake|definitive|enhanced|goty|game of the year|complete|collection|edition|hd|deluxe|ultimate|redux|reloaded|director'?s? cut|anniversary)\b/gi;
export function franchiseKey(title) {
  const head = String(title || "").replace(/[™®©]/g, "").split(/[:\-–—(]/)[0];
  return head.replace(EDITION, " ").replace(/[^A-Za-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

const recordedMinutes = item => Number(meta(item).recordedMinutes || 0);
const trackedMinutes = item => Math.round(Number(meta(item).trackedSeconds || 0) / 60);
export const playMinutes = item => Math.max(recordedMinutes(item), trackedMinutes(item));
export const lastPlayed = item => {
  const value = Date.parse(meta(item).lastPlayedAt || "");
  return Number.isFinite(value) ? value : 0;
};

// A franchise the reader named by hand wins over anything derived from the title.
const groupKey = item => String(meta(item).franchise || "").trim().toLowerCase() || franchiseKey(item.title);

export function groupIntoSeries(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = groupKey(item);
    if (!key) { buckets.set(`solo:${item.id}`, [item]); continue; }
    buckets.set(key, [...(buckets.get(key) || []), item]);
  }
  const entries = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) { entries.push({ kind: "game", item: group[0], sort: group[0].title }); continue; }
    const ordered = [...group].sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
    entries.push({
      kind: "series",
      key,
      title: seriesTitle(ordered),
      games: ordered,
      minutes: ordered.reduce((total, item) => total + playMinutes(item), 0),
      installed: ordered.filter(isInstalled).length,
      artwork: ordered.find(item => artworkOf(item)) || ordered[0],
      sort: seriesTitle(ordered)
    });
  }
  return entries.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
}

// Name the series from what the titles share rather than from the derived key,
// so it reads "Borderlands", not "borderlands".
function seriesTitle(games) {
  const named = games.map(item => String(meta(item).franchise || "").trim()).find(Boolean);
  if (named) return named;
  const head = games[0].title.replace(/[™®©]/g, "").split(/[:\-–—(]/)[0].trim();
  const stripped = head.replace(EDITION, " ").replace(/\s+/g, " ").trim();
  return stripped || head;
}

export const artworkOf = item =>
  typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url || "";

// Sections, in the order they appear on Home. Wishlist is last by design.
export const SECTIONS = [
  { id: "playing", label: "PLAYING NOW", blurb: "Pick up where you stopped." },
  { id: "installed", label: "OWNED · INSTALLED", blurb: "Ready to start right now." },
  { id: "notInstalled", label: "OWNED · NOT INSTALLED", blurb: "Yours — needs a download first." },
  { id: "playedNotOwned", label: "PLAYED · NOT OWNED", blurb: "Played somewhere else." },
  { id: "wishlist", label: "WISHLIST", blurb: "Wanted, not owned." }
];

export function sectionOf(item) {
  const data = meta(item);
  if (data.playStatus === "playing") return "playing";
  if (data.relationship === "owned") return isInstalled(item) ? "installed" : "notInstalled";
  if (data.relationship === "wishlist" || data.relationship === "upcoming") return "wishlist";
  if (data.playStatus === "played" || data.relationship === "played_not_owned") return "playedNotOwned";
  return "notInstalled";
}

export function buildGamesHome(state = getState(), search = "") {
  const query = String(search || "").trim().toLowerCase();
  const games = Object.values(state.items || {}).filter(isGame).filter(item => !query
    || `${item.title} ${(item.genres || []).join(" ")} ${meta(item).franchise || ""}`.toLowerCase().includes(query));
  const sections = SECTIONS.map(section => {
    const members = games.filter(item => sectionOf(item) === section.id);
    // Playing now is the short list you act on, so it stays as individual games.
    const entries = section.id === "playing"
      ? members.sort((a, b) => lastPlayed(b) - lastPlayed(a)).map(item => ({ kind: "game", item }))
      : groupIntoSeries(members);
    return { ...section, entries, count: members.length };
  });
  return {
    sections: sections.filter(section => section.count),
    total: games.length,
    installed: games.filter(isInstalled).length,
    installedGb: Math.round(games.filter(isInstalled).reduce((sum, item) => sum + installSizeGb(item), 0) * 10) / 10,
    recordedHours: Math.round(games.reduce((sum, item) => sum + playMinutes(item), 0) / 60)
  };
}

export async function launchGame(item, action = "") {
  const appId = appIdOf(item);
  if (!appId) throw new Error("This game has no Steam app id to launch.");
  const response = await fetch("./__vault/games/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "launch-game" },
    body: JSON.stringify({ appId, action: action || (isInstalled(item) ? "run" : "install") })
  });
  if (!response.ok) throw new Error("Steam could not be reached.");
  // Installing is not playing, so only a run is worth journalling. A game with
  // hours already on it is being picked back up rather than started.
  if ((action || (isInstalled(item) ? "run" : "install")) === "run") {
    emit("GAME_LAUNCHED", { itemId: item.id, wing: "games", resumed: Number(item.playtimeMinutes || item.gameMeta?.playtimeMinutes || 0) > 0, meta: { title: item.title } });
  }
  return response.json().catch(() => ({}));
}
