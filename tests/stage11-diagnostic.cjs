const { chromium } = require("./playwright-runtime.cjs");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:4173/index.html#/voice", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(5000);
    console.log(JSON.stringify(await page.evaluate(() => ({
      schema: document.querySelector("#schema-version")?.textContent,
      title: document.querySelector("#view-title")?.textContent,
      code: document.querySelector("#view-code")?.textContent,
      view: document.querySelector("#view")?.textContent?.slice(0, 500),
      nav: [...document.querySelectorAll("[data-route]")].map(node => node.dataset.route),
      boot: document.querySelector("#boot")?.className
    })), null, 2));
    console.log(JSON.stringify({ errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
