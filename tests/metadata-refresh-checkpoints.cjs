const { chromium } = require("./playwright-runtime.cjs");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/home";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = { books: 0, comics: 0, tvSearch: 0, tvEpisodes: 0 };
  await page.route("**/__vault/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path.endsWith("/books/search")) {
      requests.books++;
      body = { candidates: [{ title: "Checkpoint Book", authors: ["Test Author"], publisher: "Test Press", publishedDate: "2024", categories: ["Fiction"], description: "Verified.", pageCount: 320, isbn: "TEST-ISBN", externalId: "book-external", sourceName: "Test catalog", sourceUrl: "https://example.com/book" }] };
    } else if (path.endsWith("/comics/search")) {
      requests.comics++;
      body = { candidates: [{ title: "Checkpoint Comic", creator: "Test Creator", publisher: "Test Press", startYear: 2024, genres: ["Adventure"], description: "Verified.", format: "comic", publicationStatus: "ongoing", unitType: "issues", releaseLane: "comic_issues", totalUnits: 4, externalId: "comic-external", sourceName: "Test catalog", sourceUrl: "https://example.com/comic" }] };
    } else if (path.endsWith("/tv/search")) {
      requests.tvSearch++;
      body = { candidates: [{ title: "Checkpoint Show", startYear: 2024, genres: ["Drama"], description: "Verified.", seasons: [{ number: 1, episodeCount: 1 }], externalId: "tv-external", sourceName: "Test catalog", sourceUrl: "https://example.com/tv" }] };
    } else if (path.endsWith("/tv/episodes")) {
      requests.tvEpisodes++;
      body = { episodes: [{ season: 1, number: 1, title: "Pilot", description: "Verified episode.", airDate: "2024-01-01", runtimeMinutes: 42, externalId: "episode-external" }], sourceName: "Test episodes", sourceUrl: "https://example.com/episodes" };
    } else {
      return route.continue();
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 30000 });
    const first = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const books = await import("./js/wings/books.js");
      const comics = await import("./js/wings/comicsManga.js");
      const tv = await import("./js/wings/tv.js");
      store.update(save => {
        save.items = {
          checkpoint_book: { id: "checkpoint_book", wing: "books", type: "book", title: "Checkpoint Book", authors: ["Test Author"], owned: true, bookMeta: { curated: true, isbn: "TEST-ISBN", status: "planned" } },
          checkpoint_comic: { id: "checkpoint_comic", wing: "manga", type: "comic", title: "Checkpoint Comic", creator: "Test Creator", publisher: "Test Press", year: 2024, comicMeta: { format: "comic", publicationStatus: "ongoing", readingStatus: "planned", progressUnit: "issues" } },
          checkpoint_tv: { id: "checkpoint_tv", wing: "tv", type: "tv", title: "Checkpoint Show", year: 2024, owned: true, episodes: {}, tvMeta: {} }
        };
        save.metadata.books = {};
        save.metadata.comicsManga = {};
        save.metadata.tv = {};
      }, { persist: false });
      return {
        books: await books.correctAllBookMetadata(),
        comics: await comics.correctAllComicMetadata(),
        tv: await tv.refreshTvMetadata()
      };
    });
    const afterFirst = { ...requests };
    const second = await page.evaluate(async () => {
      const books = await import("./js/wings/books.js");
      const comics = await import("./js/wings/comicsManga.js");
      const tv = await import("./js/wings/tv.js");
      return {
        books: await books.correctAllBookMetadata(),
        comics: await comics.correctAllComicMetadata(),
        tv: await tv.refreshTvMetadata()
      };
    });
    const state = await page.evaluate(async () => (await import("./js/core/store.js")).getState());
    assert(first.books.total === 1 && first.comics.total === 1 && first.tv.total === 1, "The first refresh did not check each eligible record.");
    assert(afterFirst.books === 1 && afterFirst.comics === 1 && afterFirst.tvSearch === 1 && afterFirst.tvEpisodes === 1, "The first refresh made unexpected lookup calls.");
    assert(second.books.total === 0 && second.comics.total === 0 && second.tv.total === 0, "The second refresh did not stop on an empty eligible queue.");
    assert(second.books.skipped === 1 && second.comics.skipped === 1 && second.tv.skipped === 1, "The second refresh did not report current records as skipped.");
    assert(JSON.stringify(requests) === JSON.stringify(afterFirst), "The second refresh repeated network metadata work.");
    assert(state.metadata.books.metadataRefresh.items.checkpoint_book, "Book checkpoint was not stored.");
    assert(state.metadata.comicsManga.metadataRefresh.items.checkpoint_comic, "Comics checkpoint was not stored.");
    assert(state.metadata.tv.metadataRefresh.items.checkpoint_tv, "TV checkpoint was not stored.");
    console.log(JSON.stringify({ ok: true, first, second, requests }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
