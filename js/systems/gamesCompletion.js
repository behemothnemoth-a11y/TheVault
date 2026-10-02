import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";
import { queueArtworkApproval } from "./artworkApproval.js";

// One-time Games repair from local Steam evidence: links what you own and play, imports
// the games that were missing, files mod lists and personal projects into the Workshop,
// and merges duplicates. Recorded Steam time is kept separate from Vault-tracked time,
// and cover art is queued for approval rather than applied, as the games rules require.
const PLAN_URL = "./data/repair/games-plan.json";
const FLAG = "gamesRepair20260912";

const filled = value => value !== undefined && value !== null && String(value).trim() !== "";
const blankModel = () => ({ versions: [], addons: [], memories: [], playthroughs: [], sessions: [], milestones: [], opinionHistory: [], history: [], sources: [], manualFields: {}, pauseSuggestionEnabled: true });

function applySteamEvidence(item, entry, { isNew }) {
  const data = (item.gameMeta ||= { ...blankModel() });
  for (const [key, value] of Object.entries(blankModel())) if (data[key] === undefined) data[key] = value;
  // Manual edits win: only fields you have not set yourself are touched.
  const manual = data.manualFields || {};
  if (!manual.relationship && data.relationship !== "owned") data.relationship = entry.relationship || "owned";
  if (!manual.playStatus && (isNew || data.playStatus === "unplayed" || !data.playStatus)) data.playStatus = entry.playStatus || "unplayed";
  item.owned = data.relationship === "owned";
  if (entry.minutes > 0) {
    data.recordedMinutes = Math.max(Number(data.recordedMinutes || 0), Number(entry.minutes));
    data.recordedSource = "Steam";
  }
  if (entry.lastPlayed) {
    const played = new Date(entry.lastPlayed * 1000).toISOString();
    if (!data.lastPlayedAt || Date.parse(data.lastPlayedAt) < Date.parse(played)) data.lastPlayedAt = played;
  }
  data.sources = [...(data.sources || []).filter(source => source.key !== `steam:${entry.appId}`),
                  { source: "steam", key: `steam:${entry.appId}`, appId: entry.appId, title: entry.title,
                    installed: Boolean(entry.installed), path: entry.installPath || "", sizeGb: entry.sizeGb || 0,
                    linkedAt: new Date().toISOString() }];
  data.externalId ||= entry.appId;
  data.metadataSource ||= "Steam";
  if (entry.developers?.length) data.developers = data.developers?.length ? data.developers : entry.developers;
  if (entry.publishers?.length) data.publishers = data.publishers?.length ? data.publishers : entry.publishers;
  if (!data.platforms?.length) data.platforms = ["PC"];
  if (!filled(item.year) && entry.year) item.year = entry.year;
  if (!item.genres?.length && entry.genres?.length) item.genres = entry.genres.slice(0, 8);
  if (!filled(item.description) && entry.description) item.description = entry.description;
  if (!filled(item.creator) && entry.developers?.length) item.creator = entry.developers.join(", ");
  item.status = data.playStatus === "playing" ? "in_progress" : item.status || "backlog";
}

export async function runGamesRepair() {
  if (getState().metadata?.maintenance?.[FLAG]) return null;
  let plan = null;
  try {
    const response = await fetch(PLAN_URL, { cache: "no-store" });
    if (!response.ok) return null;
    plan = await response.json();
  } catch { return null; }
  if (!plan?.link || !plan?.create) return null;

  await createArchiveSnapshot("Protected backup before the Games repair", { kind: "games_repair", protected: true });
  const summary = { workshopFiled: 0, projectsFiled: 0, duplicatesMerged: 0, gamesLinked: 0, gamesAdded: 0, hoursImported: 0, artworkQueued: 0 };
  const artwork = [];

  update(save => {
    for (const entry of plan.classify || []) {
      const item = save.items[entry.id];
      if (item?.wing !== "games") continue;
      item.gameMeta ||= { ...blankModel() };
      item.gameMeta.kind = entry.kind;
      if (entry.kind === "workshop") summary.workshopFiled++; else summary.projectsFiled++;
    }

    for (const group of plan.merges || []) {
      const keep = save.items[group.keepId];
      if (!keep) continue;
      for (const id of group.mergeIds || []) {
        const duplicate = save.items[id];
        if (!duplicate || id === group.keepId) continue;
        if (!filled(keep.description) && filled(duplicate.description)) keep.description = duplicate.description;
        if (!filled(keep.year) && filled(duplicate.year)) keep.year = duplicate.year;
        if (!keep.genres?.length && duplicate.genres?.length) keep.genres = duplicate.genres;
        if (!filled(keep.artwork) && filled(duplicate.artwork)) keep.artwork = duplicate.artwork;
        save.metadata.removedCards ||= [];
        save.metadata.removedCards.push({ id, item: JSON.parse(JSON.stringify(duplicate)), title: duplicate.title, wing: "games", removedAt: new Date().toISOString(), reason: `merged into ${keep.title}` });
        delete save.items[id];
        summary.duplicatesMerged++;
      }
    }

    for (const entry of plan.link || []) {
      const item = save.items[entry.id];
      if (item?.wing !== "games") continue;
      applySteamEvidence(item, entry, { isNew: false });
      summary.gamesLinked++;
      summary.hoursImported += Math.round((entry.minutes || 0) / 60);
      if (entry.art && !filled(item.artwork)) artwork.push({ itemId: entry.id, title: entry.title, art: entry.art, appId: entry.appId });
    }

    for (const entry of plan.create || []) {
      if (save.items[entry.id]) continue;
      save.items[entry.id] = { id: entry.id, wing: "games", type: "game", title: entry.title, owned: true,
                               favorite: false, status: "backlog", rating: null, artwork: "", genres: [],
                               addedAt: new Date().toISOString(), scanSource: "Steam library",
                               gameMeta: { ...blankModel(), relationship: "owned", playStatus: "unplayed", explicitBacklog: false, recordedMinutes: 0, trackedSeconds: 0 } };
      const item = save.items[entry.id];
      applySteamEvidence(item, entry, { isNew: true });
      item.gameMeta.history = [{ id: `game_event_${entry.appId}`, kind: "import", label: "IMPORTED FROM THE LOCAL STEAM LIBRARY", at: new Date().toISOString(), datePrecision: "exact", referenceOnly: false }];
      summary.gamesAdded++;
      summary.hoursImported += Math.round((entry.minutes || 0) / 60);
      if (entry.art) artwork.push({ itemId: entry.id, title: entry.title, art: entry.art, appId: entry.appId });
    }

    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = { completedAt: new Date().toISOString(), source: plan.source, ...summary };
  });

  // Cover art waits in Artwork Review; nothing lands on a card without you seeing it.
  for (const entry of artwork) {
    if (queueArtworkApproval({ kind: "game", itemId: entry.itemId, key: `game:${entry.itemId}:main`,
                               title: entry.title, subtitle: "Steam cover art", path: entry.art,
                               sourceName: "Steam", sourceUrl: `https://store.steampowered.com/app/${entry.appId}/` })) summary.artworkQueued++;
  }
  update(save => { save.metadata.maintenance[FLAG].artworkQueued = summary.artworkQueued; });
  await flushPersistence();
  return summary;
}
