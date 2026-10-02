const WING_MAP = {
  mov: { wing: "movies", type: "movie" }, tv: { wing: "tv", type: "tv" },
  gam: { wing: "games", type: "game" }, bok: { wing: "books", type: "book" },
  mus: { wing: "music", type: "music" }, yt: { wing: "youtube", type: "youtube" },
  pod: { wing: "podcasts", type: "podcast" }, man: { wing: "manga", type: "manga" },
  fud: { wing: "food", type: "food" }, trv: { wing: "trips", type: "trip" }
};
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const slug = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "").slice(0, 150) || "untitled";

function extractJson(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return {};
  const valueStart = start + startMarker.length;
  const end = source.indexOf(endMarker, valueStart);
  if (end < 0) return {};
  try { return JSON.parse(source.slice(valueStart, end)); } catch { return {}; }
}
function titleWithoutCounters(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll(".epcount, .rbadge, .disc").forEach(node => node.remove());
  return clean(clone.textContent);
}
function parseYear(title) {
  const matches = [...title.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}
function legacyRating(note) {
  const value = Number(note?.r);
  return value ? Math.min(10, value * 2) : null;
}

export function parseLegacyVault(html, progress = {}) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const eps = extractJson(html, "EPS=", ",PRESET=");
  const items = {}, collections = {}, warnings = [];
  const checks = progress.checks || {}, notes = progress.notes || {};

  for (const card of document.querySelectorAll(".card[data-view]")) {
    const code = card.dataset.view, mapping = WING_MAP[code];
    if (!mapping || code.includes("+")) continue;
    const collectionTitle = clean(card.querySelector(".ttl")?.textContent || card.dataset.cat || "Legacy Collection");
    const collectionId = `collection_legacy_${code}_${slug(collectionTitle)}`;
    const memberIds = [];
    if (code === "tv") {
      for (const show of card.querySelectorAll(".stitle[data-slug]")) {
        const legacySlug = show.dataset.slug, title = titleWithoutCounters(show);
        if (!legacySlug || !title) continue;
        const id = `tv_legacy_${slug(legacySlug)}`;
        if (items[id]) continue;
        const episodes = {};
        const seasonData = { ...(eps[legacySlug] || {}), ...(progress.custom?.[legacySlug] || {}) };
        for (const [season, sourceEpisodes] of Object.entries(seasonData)) {
          const numbers = Array.isArray(sourceEpisodes) ? sourceEpisodes : Array.from({ length: Number(sourceEpisodes) || 0 }, (_, i) => i + 1);
          for (const number of numbers) {
            const legacyKey = `e|${legacySlug}|${season}|${number}`;
            const episodeId = `tv_legacy_${slug(legacySlug)}_s${String(season).padStart(2, "0")}e${String(number).padStart(2, "0")}`;
            const legacyNote = notes[legacyKey];
            episodes[episodeId] = {
              id: episodeId, season: Number(season), number: Number(number),
              status: checks[legacyKey] ? "completed" : "backlog",
              rating: legacyRating(legacyNote), note: clean(legacyNote?.n),
              rewatches: Number(legacyNote?.w || 0), legacyKey
            };
          }
        }
        const episodeValues = Object.values(episodes);
        const completed = episodeValues.filter(ep => ep.status === "completed").length;
        items[id] = {
          id, type: "tv", wing: "tv", title, year: parseYear(title),
          genres: [card.dataset.cat || "Legacy Import"],
          status: completed && completed === episodeValues.length ? "completed" : completed ? "in_progress" : "backlog",
          rating: null, note: "", addedAt: null, progress: { completed, total: episodeValues.length },
          episodes, legacy: { source: "vault.v1", slug: legacySlug, collectionId }
        };
        memberIds.push(id);
      }
    } else {
      for (const input of card.querySelectorAll('input[data-k][type="checkbox"]')) {
        const legacyKey = input.dataset.k;
        if (!legacyKey || legacyKey.includes("+")) continue;
        const label = input.closest("label");
        const title = titleWithoutCounters(label?.querySelector(".txt") || label);
        if (!title) continue;
        const id = `${mapping.type}_legacy_${slug(legacyKey)}`;
        if (items[id]) { warnings.push(`Duplicate legacy key skipped: ${legacyKey}`); continue; }
        const legacyNote = notes[legacyKey];
        items[id] = {
          id, type: mapping.type, wing: mapping.wing, title, year: parseYear(title),
          genres: [card.dataset.cat || "Legacy Import"], status: checks[legacyKey] ? "completed" : "backlog",
          rating: legacyRating(legacyNote), note: clean(legacyNote?.n || label?.dataset.tip || ""),
          rewatches: Number(legacyNote?.w || 0), owned: input.dataset.owned === "1", addedAt: null,
          legacy: { source: "vault.v1", key: legacyKey, collectionId }
        };
        memberIds.push(id);
      }
    }
    if (memberIds.length) collections[collectionId] = {
      id: collectionId, title: collectionTitle, wing: mapping.wing, itemIds: memberIds,
      legacy: { source: "vault.v1", category: card.dataset.cat || null }
    };
  }
  const values = Object.values(items);
  const episodes = values.flatMap(item => Object.values(item.episodes || {}));
  return {
    items, collections, warnings,
    report: {
      records: values.length, episodes: episodes.length, collections: Object.keys(collections).length,
      completed: values.filter(item => item.status === "completed").length,
      ratings: values.filter(item => item.rating).length + episodes.filter(ep => ep.rating).length,
      notes: values.filter(item => item.note).length + episodes.filter(ep => ep.note).length
    }
  };
}

export function mergeLegacyImport(save, parsed, { removeSampleData = true } = {}) {
  if (removeSampleData && save.metadata.sampleData) save.items = {};
  const conflicts = [];
  for (const [id, item] of Object.entries(parsed.items)) {
    if (save.items[id]) conflicts.push(id); else save.items[id] = item;
  }
  save.collections = { ...(save.collections || {}) };
  for (const [id, collection] of Object.entries(parsed.collections)) {
    if (!save.collections[id]) save.collections[id] = collection;
  }
  save.metadata.sampleData = false;
  save.metadata.legacyImports = [...(save.metadata.legacyImports || []), {
    source: "vault.v1", importedAt: new Date().toISOString(), report: parsed.report, conflicts
  }];
  return conflicts;
}
