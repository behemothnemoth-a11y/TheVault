import { getState, update } from "../core/store.js";
import { appIdOf, isGame } from "./gamesLibrary.js?v=20260913-daybook-v3";

// The full Steam library, including games never installed on this machine.
//
// Local files only know what this PC has seen. Steam's own account API knows
// everything you own. The key is entered once in the Vault's setup dialog and
// stored in data/private; it never passes through the interface again, and every
// call here is something the reader pressed a button to start.

async function post(url, body, request) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": request },
    body: JSON.stringify(body || {})
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

export async function saveSteamKey(key, steamId = "") {
  const { ok, status, payload } = await post("./__vault/games/steam/configure",
    { key: String(key || "").trim(), steamId: String(steamId || "").trim() }, "steam-configure");
  if (ok) return payload;
  if (status === 401) throw new Error("Steam rejected that key.");
  if (status === 503) throw new Error("Steam could not be reached, or the account could not be identified. Add your SteamID64 and try again.");
  throw new Error("That key could not be saved.");
}

// Fetch the owned library and stage anything new in Import Review. Nothing is
// added to the archive here — the reader confirms each game, as the games rules require.
export async function importSteamLibrary({ onProgress = () => {} } = {}) {
  onProgress({ phase: "ASKING STEAM WHAT YOU OWN…" });
  const { ok, status, payload } = await post("./__vault/games/steam/owned", {}, "steam-owned");
  if (!ok) {
    if (status === 409) throw new Error("No Steam key is saved yet. Use CONNECT STEAM ACCOUNT first.");
    if (status === 401) throw new Error("Steam rejected the saved key. Save it again.");
    throw new Error("Steam could not be reached.");
  }

  const owned = payload.games || [];
  const state = getState();
  const known = new Map();
  for (const item of Object.values(state.items || {})) {
    if (!isGame(item)) continue;
    const appId = appIdOf(item);
    if (appId) known.set(appId, item);
  }

  const result = { total: owned.length, alreadyHere: 0, staged: 0, playtimeUpdated: 0 };
  const fresh = [];
  for (const game of owned) {
    const existing = known.get(game.appId);
    if (existing) { result.alreadyHere++; continue; }
    fresh.push(game);
  }

  onProgress({ phase: "UPDATING RECORDED TIME…", total: owned.length });
  // Steam's totals are authoritative for recorded time; Vault-tracked time is separate
  // and never touched here.
  update(save => {
    for (const game of owned) {
      const existing = known.get(game.appId);
      if (!existing) continue;
      const record = save.items[existing.id];
      const data = record?.gameMeta;
      if (!data || !game.minutes) continue;
      if (Number(data.recordedMinutes || 0) >= game.minutes) continue;
      data.recordedMinutes = game.minutes;
      data.recordedSource = "Steam account library";
      if (game.lastPlayed) data.lastPlayedAt = new Date(game.lastPlayed * 1000).toISOString();
      result.playtimeUpdated++;
    }
  });

  onProgress({ phase: "STAGING NEW GAMES FOR REVIEW…", total: fresh.length });
  update(save => {
    save.metadata.games ||= {};
    const review = save.metadata.games.importReview || [];
    const seen = new Set(review.map(entry => entry.key));
    for (const game of fresh) {
      const key = `steam:${game.appId}`;
      if (seen.has(key)) continue;
      review.push({
        key, source: "steam", appId: game.appId, title: game.title,
        minutes: game.minutes, lastPlayed: game.lastPlayed, installed: false,
        path: "", sizeGb: 0, status: "pending",
        discoveredAt: payload.checkedAt, discoveredVia: "Steam account library"
      });
      seen.add(key);
      result.staged++;
    }
    save.metadata.games.importReview = review;
    save.metadata.games.steamLibrary = {
      steamId: payload.steamId, count: payload.count, checkedAt: payload.checkedAt
    };
  });

  onProgress({ phase: "STEAM LIBRARY READ", detail: `${result.staged} new · ${result.alreadyHere} already here` });
  return result;
}

export const steamLibraryStatus = (state = getState()) => state.metadata?.games?.steamLibrary || null;
