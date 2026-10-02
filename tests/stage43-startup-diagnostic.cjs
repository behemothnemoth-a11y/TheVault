const { chromium } = require("./playwright-runtime.cjs");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  const page = await browser.newPage();
  const errors = [], consoleErrors = [], responses = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", response => { if (response.url().includes("127.0.0.1")) responses.push([response.status(), response.url()]); });
  try {
    await page.goto(process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/home", { waitUntil: "commit", timeout: 15000 });
    await page.waitForTimeout(25000);
    const dom = await page.evaluate(() => ({
      url: location.href, ready: document.readyState, schema: document.querySelector("#schema-version")?.textContent,
      notice: document.querySelector("[data-stage0-load-error]")?.textContent,
      view: document.querySelector("#view")?.textContent?.slice(0, 500),
      localBytes: localStorage.getItem("vault_reconstruction_v1")?.length || 0
    })).catch(error => ({ evaluateError: String(error) }));
    console.log(JSON.stringify({ dom, errors, consoleErrors, responses: responses.slice(-30) }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
