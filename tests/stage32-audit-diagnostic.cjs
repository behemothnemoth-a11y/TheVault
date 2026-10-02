const { chromium } = require("./playwright-runtime.cjs");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:4173/index.html#/audit", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#schema-version")?.textContent === "42", null, { timeout: 45000 });
    await page.waitForTimeout(800);
    const output = await page.evaluate(async () => {
      const store = await import("./js/core/store.js");
      const health = await import("./js/systems/health.js");
      const state = store.getState();
      return {
        latest: state.metadata.stage32.audits.at(-1),
        health: health.runHealthCheck(state),
        title: document.querySelector("#view-title")?.textContent,
        seal: document.querySelector(".final-seal")?.textContent,
        checkCards: document.querySelectorAll(".final-check").length
      };
    });
    console.log(JSON.stringify({ output, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
