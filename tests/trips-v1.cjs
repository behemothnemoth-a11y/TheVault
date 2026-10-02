const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/trips";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true" && document.body.dataset.vaultRoute === "trips");
    assert(await page.locator(".trip-command").count() === 1, "Trips still shows a waiting screen.");
    assert(await page.locator(".trip-card").count() === 0, "Trips did not begin empty.");
    assert(await page.locator(".trip-recommendations.locked").count() === 1, "Recommendations should be locked before a completed trip exists.");
    await page.locator("[data-trip-add]").first().click();
    await page.locator("[data-trip-title]").fill("Acceptance Test Journey");
    await page.locator("[data-trip-destination]").fill("Test City");
    await page.locator("[data-trip-start]").fill("2027-05-10");
    await page.locator("[data-trip-end]").fill("2027-05-14");
    await page.locator("[data-trip-status-field]").selectOption("upcoming");
    await page.getByRole("button", { name: "ADD TO TRIPS" }).click();
    await page.waitForSelector(".trip-detail");
    assert((await page.locator(".trip-detail").textContent()).includes("Acceptance Test Journey"), "Added trip did not open its detail page.");
    await page.locator("[data-trip-edit]").click();
    await page.locator("[data-trip-companions]").fill("Vault Test Crew");
    await page.getByRole("button", { name: "SAVE CHANGES" }).click();
    assert((await page.locator(".trip-detail").textContent()).includes("Vault Test Crew"), "Trip edit was not saved.");
    await page.locator("[data-trip-back]").click();
    await page.waitForSelector(".trip-library");
    await page.locator('[data-trip-filter="upcoming"]').click();
    assert((await page.locator(".trip-library").textContent()).includes("Acceptance Test Journey"), "Upcoming filter did not retain the trip.");
    assert(await page.locator(".trip-recommendations.locked").count() === 1, "An upcoming trip incorrectly unlocked recommendations.");
    await page.locator('.trip-card__open[data-open-trip]').filter({ hasText: "Acceptance Test Journey" }).click();
    await page.locator('[data-trip-status="completed"]').click();
    await page.locator("[data-trip-back]").click();
    await page.waitForSelector(".trip-recommendations.ready");
    assert(await page.locator(".trip-recommendations.ready").count() === 1, "A completed trip did not unlock recommendation learning.");
    await page.locator('[data-trip-filter="completed"]').click();
    await page.locator('.trip-card__open[data-open-trip]').filter({ hasText: "Acceptance Test Journey" }).click();
    await page.locator("[data-trip-remove]").click();
    await page.getByRole("button", { name: "REMOVE", exact: true }).click();
    await page.waitForSelector(".trip-library");
    assert(!(await page.locator(".trip-library").textContent()).includes("Acceptance Test Journey"), "Removed trip remained visible.");
    assert(!errors.length, `Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ ok: true, emptyStart: true, recommendationEvidence: "completed-only", lifecycle: ["add", "open", "edit", "filter", "complete", "remove"] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
