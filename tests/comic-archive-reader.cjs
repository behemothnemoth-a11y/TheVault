const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CBR = "D:\\Unsorted\\Crossed v1 (000 - 009) (2008 - 2010) (Digital)\\Crossed 000 (2008) (Digital) (Nahga-Empire).cbr";
const BASE=process.env.VAULT_TEST_URL||"http://127.0.0.1:4173/index.html";
const assert = (value, message) => { if (!value) throw new Error(message); };

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  try{
    await page.goto(`${BASE}?comicReaderTest=${Date.now()}#/manga`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    await page.evaluate(async path=>{
      const store=await import("./js/core/store.js");
      store.update(save=>{save.items.__comic_reader_test__={id:"__comic_reader_test__",wing:"manga",type:"comic",title:"Crossed",creator:"Garth Ennis",sourcePath:path,comicMeta:{format:"comic",readingStatus:"reading",sourcePath:path,readerProgress:0,volumes:[{number:0,title:"Issue 0",sourcePath:path,fileFormat:"CBR",owned:true,read:false}]}}},{persist:false});
      const reader=await import(`./js/systems/embeddedReader.js?comicTest=${Date.now()}`);await reader.openEmbeddedReader("__comic_reader_test__");
    },CBR);
    await page.waitForSelector(".vault-reader-image",{timeout:30000});
    const state=()=>page.evaluate(()=>{const src=document.querySelector(".vault-reader-image")?.getAttribute("src")||"";return{count:document.querySelector("[data-reader-count]")?.textContent?.trim(),imageEmbedded:src.startsWith("data:image/"),imageBytes:src.length,reader:Boolean(document.querySelector(".vault-reader")),screenHeight:document.querySelector(".vault-reader__book")?.clientHeight||0}});
    const initial=await state();assert(initial.count==="1 / 14","CBR did not open at page 1 of 14.");assert(initial.imageEmbedded,"CBR first page did not render as an embedded image.");assert(initial.screenHeight>500,"Comic page viewport is too small.");
    await page.click("[data-reader-next]");await page.waitForFunction(()=>document.querySelector("[data-reader-count]")?.textContent?.trim()==="2 / 14"&&document.querySelector(".vault-reader-image")?.complete,null,{timeout:15000});
    const advanced=await state();assert(advanced.reader&&advanced.imageEmbedded,"CBR page 2 did not remain inside the Vault reader.");
    await page.click("[data-reader-prev]");await page.waitForFunction(()=>document.querySelector("[data-reader-count]")?.textContent?.trim()==="1 / 14"&&document.querySelector(".vault-reader-image")?.complete,null,{timeout:15000});
    assert(!errors.length,`Comic reader runtime errors: ${JSON.stringify(errors)}`);
    await page.screenshot({path:"D:/Vault/tests/comic-archive-reader.png",fullPage:false});
    console.log(JSON.stringify({ok:true,initial,advanced},null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
