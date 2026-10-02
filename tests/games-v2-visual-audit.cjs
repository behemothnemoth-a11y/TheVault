const { chromium } = require("./playwright-runtime.cjs");
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4199/index.html#/games";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], badResponses = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400 && !response.url().includes("favicon")) badResponses.push(`${response.status()} ${response.url()}`); });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "43", null, { timeout: 90000 });
    await page.locator("#boot:not(.dismissed)").click().catch(() => {});
    await page.waitForSelector(".games-v2");
    const sections = ["home", "library", "timeline", "stats", "future", "workshop"];
    const report = {};
    for (const section of sections) {
      await page.goto(section === "home" ? BASE : `${BASE}/${section}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".games-v2");
      report[section] = await page.evaluate(() => {
        const root = document.querySelector(".games-v2"), textNodes = [...root.querySelectorAll("button,small,span,p,h2,h3")].filter(node => node.textContent.trim());
        const sizes = textNodes.map(node => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
        return { cards: root.querySelectorAll(".games2-card").length, nav: root.querySelectorAll(".games2-nav button").length, minText: sizes.length ? Math.min(...sizes) : 0, pageOverflow: document.documentElement.scrollWidth > innerWidth, rootOverflow: root.scrollWidth > root.clientWidth + 2, height: document.documentElement.scrollHeight };
      });
      await page.screenshot({ path: `D:/Vault/tests/games-v2-${section}.png`, fullPage: true });
    }
    console.log(JSON.stringify({ report, errors, badResponses }, null, 2));
    assert(Object.values(report).every(value => value.nav === 6), "Permanent Games navigation is missing on a page.");
    assert(Object.values(report).every(value => !value.pageOverflow && !value.rootOverflow), "A Games page overflows horizontally.");
    assert(Object.values(report).every(value => value.minText >= 12), "Games contains text smaller than 12px.");
    assert(!errors.length && !badResponses.length, `Runtime failures: ${JSON.stringify({ errors, badResponses })}`);
    console.log(JSON.stringify({ ok: true, report, errors, badResponses }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
