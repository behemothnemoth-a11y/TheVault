const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EPUB = "D:\\Unsorted\\All Dune books + short stories + extras ePUB\\Original Dune series\\1 - Dune - Frank Herbert (1965).epub";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(`${process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html"}?readerTest=${Date.now()}#/books`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 90000 });
    await page.evaluate(async path => {
      const store = await import("./js/core/store.js");
      store.update(save => { save.items.__reader_test__ = { id: "__reader_test__", wing: "books", type: "book", title: "Dune", authors: ["Frank Herbert"], sourcePath: path, bookMeta: { curated: true, status: "reading", sourcePath: path, readerProgress: 5 } }; }, { persist: false });
      const reader = await import(`./js/systems/embeddedReader.js?test=${Date.now()}`);
      await reader.openEmbeddedReader("__reader_test__");
    }, EPUB);
    await page.waitForSelector(".vault-reader-epub", { state: "attached", timeout: 30000 });
    await page.waitForTimeout(1000);
    const state = () => page.evaluate(() => {
      const frame = document.querySelector(".vault-reader-epub"), doc = frame?.contentDocument, body = frame?.shadowRoot?.querySelector(".vault-epub-flow")||doc?.body, scroller = frame?.shadowRoot?.querySelector(".vault-epub-viewport")||doc?.scrollingElement;
      const style = body ? getComputedStyle(body) : null;
      const bottom=document.querySelector(".vault-reader__bottom"),reader=document.querySelector(".vault-reader"); if(frame&&!frame.dataset.testToken)frame.dataset.testToken=Math.random().toString(36); return { token:frame?.dataset.testToken, ready:frame?.dataset.readerReady, measured:frame?.dataset.readerContentWidth, mappedSpreads:frame?.dataset.readerSpreads, mappedSpread:frame?.dataset.readerSpread, lastTurn:reader?.dataset.readerLastTurn, lastAction:reader?.dataset.readerLastAction, text: body?.innerText?.trim().length || 0, scrollLeft:scroller?.scrollLeft||0, scrollWidth: scroller?.scrollWidth || 0, clientWidth: scroller?.clientWidth || 0, count: document.querySelector("[data-reader-count]")?.textContent?.trim(), spread:document.querySelector("[data-reader-spread-label]")?.textContent?.trim(), color: style?.color, background: style?.backgroundColor, frameHeight: frame?.clientHeight || 0, bookHeight: document.querySelector(".vault-reader__book")?.clientHeight || 0, screenHeight: document.querySelector(".vault-reader__screen")?.clientHeight || 0, topHeight: document.querySelector(".vault-reader__top")?.clientHeight || 0, bottomHeight: bottom?.clientHeight || 0, readerHeight: reader?.clientHeight || 0 };
    });
    const initial = await state();
    assert(initial.text > 500, `Dune text is missing (${initial.text} characters).`);
    assert(initial.color !== initial.background, "Reader text and paper colors are identical.");
    assert(initial.scrollWidth > initial.clientWidth * 2, "Long Dune chapter did not paginate into multiple spreads.");
    await page.click("[data-reader-next]");
    await page.waitForTimeout(500);
    const advanced = await state();
    assert(advanced.scrollLeft > initial.scrollLeft && advanced.spread.includes("SPREAD 2 OF") && advanced.count === initial.count, "Next Page did not advance exactly one spread inside the chapter.");
    await page.click("[data-reader-prev]");
    await page.waitForFunction(() => document.querySelector("[data-reader-spread-label]")?.textContent?.includes("SPREAD 1 OF"), null, { timeout: 10000 });
    await page.waitForTimeout(250);
    const returned = await state();
    assert(returned.scrollLeft < advanced.scrollLeft && returned.spread.includes("SPREAD 1 OF") && returned.count === advanced.count, "Previous Page did not return exactly one spread.");
    await page.click("[data-reader-text]"); await page.click("button[data-reader-theme='night']");
    // Switching theme rebuilds the reader frame; wait for the rebuilt frame instead of a fixed delay.
    await page.waitForFunction(() => { const frame = document.querySelector(".vault-reader-epub"), body = frame?.shadowRoot?.querySelector(".vault-epub-flow") || frame?.contentDocument?.body; if (!body || frame.dataset.readerReady !== "true" || (body.innerText?.trim().length || 0) <= 500) return false; const style = getComputedStyle(body); return style.color !== style.backgroundColor; }, null, { timeout: 10000 }).catch(() => {});
    const night = await state();
    assert(night.text > 500 && night.color !== night.background, "Night mode hid the EPUB text.");
    await page.click(".vault-reader__tools [data-reader-toc]");
    assert(await page.locator("[data-reader-drawer]").isVisible(), "Contents drawer did not open.");
    assert(!errors.length, `Reader runtime errors: ${JSON.stringify(errors)}`);
    await page.screenshot({ path: "D:/Vault/tests/epub-open-book-reader.png", fullPage: false });
    console.log(JSON.stringify({ ok: true, initial, advanced, returned, night }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

