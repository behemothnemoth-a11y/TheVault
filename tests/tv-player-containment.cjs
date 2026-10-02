const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const assert = (value, message) => { if (!value) throw new Error(message); };
(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:EDGE });
  const page = await browser.newPage({ viewport:{width:1200,height:800} });
  try {
    await page.goto(process.env.VAULT_TEST_URL || "http://127.0.0.1:4173/index.html#/tv", {waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => document.documentElement.dataset.vaultReady === "true");
    await page.evaluate(() => {
      document.querySelector("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal" data-tv-size="large"><h2>PLAYER</h2><div class="modal__body"><div class="vault-tv-terminal"><div class="vault-tv-terminal__lights"><span>TEST</span></div><div class="vault-tv-terminal__screen"><video width="3840" height="2160"></video></div><div class="vault-tv-terminal__footer"><span>LOCAL</span></div></div><p class="muted">Test</p></div><div class="button-row"><button>CLOSE</button></div></section></div>`;
    });
    const check = async label => {
      const boxes = await page.evaluate(() => {
        const rect = selector => { const value=document.querySelector(selector).getBoundingClientRect(); return {left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height}; };
        return {modal:rect(".modal"),terminal:rect(".vault-tv-terminal"),screen:rect(".vault-tv-terminal__screen"),video:rect("video")};
      });
      assert(boxes.video.left >= boxes.screen.left-.5 && boxes.video.right <= boxes.screen.right+.5, `${label}: video escaped screen horizontally`);
      assert(boxes.video.top >= boxes.screen.top-.5 && boxes.video.bottom <= boxes.screen.bottom+.5, `${label}: video escaped screen vertically`);
      assert(boxes.terminal.right <= boxes.modal.right+.5 && boxes.terminal.bottom <= boxes.modal.bottom+.5, `${label}: terminal escaped modal`);
    };
    await check("large");
    await page.evaluate(() => { const modal=document.querySelector(".modal"); modal.dataset.tvSize="custom"; modal.style.width="760px"; modal.style.height="560px"; });
    await check("custom");
    await page.setViewportSize({width:900,height:680});
    await page.evaluate(() => { const modal=document.querySelector(".modal"); modal.style.width="min(96vw,760px)"; modal.style.height="min(94vh,560px)"; });
    await check("narrow");
    console.log(JSON.stringify({ok:true,sizes:["large","custom","narrow"]}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
