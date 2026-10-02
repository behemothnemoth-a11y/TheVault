const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CBR = "D:\\Unsorted\\Crossed v1 (000 - 009) (2008 - 2010) (Digital)\\Crossed 000 (2008) (Digital) (Nahga-Empire).cbr";
const assert=(value,message)=>{if(!value)throw new Error(message)};

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  try{
    await page.goto(`http://127.0.0.1:4201/index.html?readerV2=${Date.now()}#/manga`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    await page.evaluate(async path=>{
      const store=await import("./js/core/store.js");
      store.update(save=>{save.items.__reader_v2__={id:"__reader_v2__",wing:"manga",type:"comic",title:"Reader V2 Test",sourcePath:path,comicMeta:{readingStatus:"reading",sourcePath:path,readerProgress:0}}},{persist:false});
      const reader=await import(`./js/systems/embeddedReader.js?v2test=${Date.now()}`);
      await reader.openEmbeddedReader("__reader_v2__");
    },CBR);
    await page.waitForSelector(".vault-reader-image");
    await page.click("[data-reader-text]");
    await page.click('[data-reader-mode="spread"]');
    await page.waitForSelector(".vault-reader-image-spread.is-spread");
    await page.click("[data-reader-direction-toggle]");
    const spread=await page.evaluate(()=>({direction:document.querySelector(".vault-reader")?.dataset.readerDirection,flex:getComputedStyle(document.querySelector(".vault-reader-image-spread")).flexDirection,images:document.querySelectorAll(".vault-reader-image-spread img").length}));
    assert(spread.direction==="rtl"&&spread.flex==="row-reverse"&&spread.images===2,"RTL spread order was not applied.");
    await page.click('[data-reader-mode="continuous"]');
    await page.waitForSelector(".vault-comic-strip--continuous");
    await page.waitForFunction(()=>document.querySelectorAll(".vault-comic-strip__image").length>=2,null,{timeout:30000});
    await page.click("[data-reader-next]");
    await page.waitForFunction(()=>document.querySelector("[data-reader-count]")?.textContent?.trim().startsWith("2 "),null,{timeout:10000});
    await page.fill("[data-reader-range]","7");
    await page.dispatchEvent("[data-reader-range]","input");
    await page.waitForFunction(()=>document.querySelector("[data-reader-count]")?.textContent?.trim().startsWith("8 "),null,{timeout:10000});
    await page.click('[data-reader-mode="webtoon"]');
    await page.waitForSelector(".vault-comic-strip--webtoon");
    await page.waitForTimeout(1200);
    const webtoon=await page.evaluate(()=>{const scroller=document.querySelector(".vault-comic-strip"),target=document.querySelector('[data-comic-page="7"]');return{pages:document.querySelectorAll(".vault-comic-strip__page").length,loaded:document.querySelectorAll(".vault-comic-strip__image").length,label:document.querySelector("[data-reader-spread-label]")?.textContent?.trim(),overflow:scroller?.scrollHeight>scroller?.clientHeight,scrollTop:scroller?.scrollTop,targetOffset:target?.offsetTop,targetTop:target?.getBoundingClientRect().top,scrollerTop:scroller?.getBoundingClientRect().top}});
    assert(webtoon.pages===14&&webtoon.loaded>=1&&webtoon.label==="WEBTOON SCROLL"&&webtoon.overflow,`Webtoon strip did not mount correctly: ${JSON.stringify(webtoon)}`);
    assert(!errors.length,`Reader runtime errors: ${JSON.stringify(errors)}`);
    await page.screenshot({path:"D:/Vault/tests/comics-v2-reader-modes.png",fullPage:false});
    console.log(JSON.stringify({ok:true,spread,webtoon,errors},null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
