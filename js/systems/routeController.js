import { initRouter, navigate } from "../core/router.js";
import { wings } from "../ui/navigation.js?v=20260913-life-v1";

export { navigate };

export function initVaultNavigation(onRoute) {
  const routes = [...wings.map(wing => wing.id), "relink", "record", "calibrate", "timeline", "host", "sentinel"];
  initRouter(routes, (next, context) => {
    onRoute(next, context);
  });
}

export function resolveVaultRoute(next, context = { segments: [] }, items = {}) {
  const segments = context.segments || [];
  const resolved = {
    tvScreen: "catalog", activeShow: null, activeSeason: null,
    movieScreen: "library", activeMovie: null, activeMovieCollection: "",
    gamesScreen: "home", activeGame: null,
    comicScreen: "catalog", activeComic: null,
    youtubeScreen: "catalog", activeYouTubeChannel: null, youtubeHistoryMode: "month", youtubeHistoryPeriod: "",
    booksScreen: "catalog", activeBook: null, activeBookSeries: "",
    musicScreen: "catalog", activeMusicArtist: "", activeMusicAlbum: "",
    tripScreen: "catalog", activeTrip: null
  };

  if (next === "tv") {
    const requested = segments[0];
    if (requested === "review") resolved.tvScreen = "review";
    else if (["genres", "recommendations"].includes(requested)) resolved.tvScreen = requested;
    else if (requested && items[requested]?.wing === "tv") {
      resolved.activeSeason = segments[1] === "season" && Number.isFinite(Number(segments[2])) ? Number(segments[2]) : null;
      resolved.tvScreen = resolved.activeSeason === null ? "series" : "season";
      resolved.activeShow = requested;
    }
  }

  if (next === "manga") {
    const requested = segments[0];
    if (requested && (items[requested]?.wing === "manga" || requested.startsWith("__group__:"))) {
      resolved.comicScreen = "series";
      resolved.activeComic = requested;
    }
  }

  if (next === "movies") {
    const requested = segments[0];
    if(requested==="collection"&&segments[1]){
      resolved.movieScreen="collection";
      resolved.activeMovieCollection=decodeURIComponent(segments[1]);
    } else if (requested && items[requested]?.wing === "movies") {
      resolved.movieScreen = "detail";
      resolved.activeMovie = requested;
    } else if (["genres", "shelves", "planned", "recommendations"].includes(requested)) resolved.movieScreen = requested;
  }

  if (next === "games") {
    const requested = segments[0];
    if (requested && items[requested]?.wing === "games") {
      resolved.gamesScreen = "detail";
      resolved.activeGame = requested;
    } else resolved.gamesScreen = ["library", "timeline", "stats", "future", "workshop"].includes(requested) ? requested : "home";
  }

  if (next === "youtube") {
    const requested = segments[0];
    if (requested === "history") {
      resolved.youtubeScreen = "history";
      resolved.youtubeHistoryMode = segments[1] === "year" ? "year" : "month";
      resolved.youtubeHistoryPeriod = segments[2] || "";
    } else if (requested && items[requested]?.youtubeMeta) {
      resolved.youtubeScreen = "channel";
      resolved.activeYouTubeChannel = requested;
    }
  }

  if (next === "books") {
    const requested = segments[0];
    if (requested === "series" && segments[1]) {
      resolved.booksScreen = "series";
      resolved.activeBookSeries = decodeURIComponent(segments[1]);
    } else if (requested && items[requested]?.bookMeta?.curated) {
      resolved.booksScreen = "book";
      resolved.activeBook = requested;
    }
  }

  if (next === "music" && segments[0] === "artist" && segments[1]) {
    resolved.musicScreen = "artist";
    resolved.activeMusicArtist = segments[1];
  } else if (next === "music" && segments[0] === "album" && segments[1] && segments[2]) {
    resolved.musicScreen = "album";
    resolved.activeMusicArtist = segments[1];
    resolved.activeMusicAlbum = segments[2];
  }
  if (next === "trips" && segments[0] && items[segments[0]]?.wing === "trips") {
    resolved.tripScreen = "detail";
    resolved.activeTrip = segments[0];
  }
  return resolved;
}
