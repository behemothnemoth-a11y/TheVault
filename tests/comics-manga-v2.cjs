const { chromium } = require("./playwright-runtime.cjs");
const EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE=process.env.VAULT_TEST_URL||"http://127.0.0.1:4201/index.html#/manga";
const assert=(value,message)=>{if(!value)throw new Error(message)};

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  try{
    await page.goto(BASE,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    await page.locator("#boot:not(.dismissed)").click().catch(()=>{});
    const result=await page.evaluate(async()=>{
      const store=await import("./js/core/store.js"),v2=await import("./js/wings/comicsMangaV2.js");
      const now=new Date().toISOString();
      store.update(save=>{for(let index=0;index<6;index++){const id=`__comic_v2_${index}`;save.items[id]={id,wing:"manga",type:"manga",title:`V2 Test ${index+1}`,creator:"V2 Creator",publisher:"V2 Publisher",genres:["Adventure"],status:index===0?"in_progress":"backlog",owned:index===1,favorite:index===2,sourcePath:index===0?"D:/test.cbz":"",artwork:"",addedAt:now,comicMeta:{format:index===3?"comic":"manga",readingStatus:index===0?"reading":index===4?"cooking":"planned",publicationStatus:"ongoing",progressUnit:"chapters",readThrough:index===0?4:0,latestKnown:index===0?8:0,readerPercent:index===0?42:0,sourcePath:index===0?"D:/test.cbz":"",monitoring:index===0,releases:[]}}}},{persist:false});
      v2.ensureComicsMangaV2();
      const state=store.getState(),first=state.items.__comic_v2_0;
      v2.setComicOwnershipType(first.id,"kindle",true);v2.setComicStructure(first.id,"seasons_chapters");
      return{version:state.metadata.comicsManga.version,structure:store.getState().items[first.id].comicMeta.structure.mode,kindle:store.getState().items[first.id].comicMeta.ownership.kindle,eligible:v2.comicMonitoringEligible(first)};
    });
    await page.evaluate(async()=>{const comics=await import(`./js/wings/comicsManga.js?editTest=${Date.now()}`);comics.openComicEditDialog("__comic_v2_0")});
    await page.fill('[data-comic-edit-field="title"]',"V2 Manually Edited");
    await page.getByRole("button",{name:"SAVE MANUAL EDITS"}).click();
    const manual=await page.evaluate(async()=>{const {getState}=await import("./js/core/store.js");const item=getState().items.__comic_v2_0;return{title:item.title,fields:item.comicMeta.metadataAuthority.manualFields,source:item.comicMeta.metadataAuthority.fieldSources.title?.source}});
    await page.reload({waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    const ui=await page.evaluate(()=>({shelves:document.querySelectorAll(".comic-v2-shelf").length,continueCards:document.querySelectorAll(".comic-v2-shelf:nth-of-type(2) .comic-v2-shelf-card").length,collections:document.querySelectorAll(".comic-v2-collection-card").length,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert(result.version>=5&&result.structure==="seasons_chapters"&&result.kindle&&result.eligible,"V2 compatibility model failed.");
    assert(manual.title==="V2 Manually Edited"&&manual.fields.includes("title")&&manual.source==="manual","Manual metadata authority was not recorded.");
    assert(ui.shelves>=5,"Operational shelves are missing.");assert(!ui.overflow,"Comics/Manga V2 overflows horizontally.");assert(!errors.length,`Runtime errors: ${errors.join(" | ")}`);
    await page.screenshot({path:"D:/Vault/tests/comics-manga-v2.png",fullPage:true});
    console.log(JSON.stringify({ok:true,result,manual,ui,errors},null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
