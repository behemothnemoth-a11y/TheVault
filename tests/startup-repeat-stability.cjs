const { chromium } = require("./playwright-runtime.cjs");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html";
const RUNS = 12;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const results = [];
  try {
    for (let index = 0; index < RUNS; index++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      const started = Date.now();
      try {
        await page.goto(`${BASE}?startupRepeat=${Date.now()}-${index}#/home`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true", null, { timeout: 30000 });
        const state = await page.evaluate(() => ({
          route: document.body.dataset.vaultRoute,
          content: Boolean(document.querySelector("#view")?.textContent.trim()),
          failure: document.querySelector("#view")?.textContent.includes("THE INTERFACE DID NOT FINISH OPENING"),
          rail: document.querySelectorAll(".atomic-rail").length
        }));
        results.push({ index, ms: Date.now() - started, errors, ...state });
      } catch (error) {
        results.push({ index, ms: Date.now() - started, errors, exception: String(error) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const failures = results.filter(result =>
    result.exception || result.errors.length || result.route !== "home" ||
    !result.content || result.failure || result.rail !== 1
  );
  console.log(JSON.stringify({ ok: failures.length === 0, runs: RUNS, failures, results }, null, 2));
  if (failures.length) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
