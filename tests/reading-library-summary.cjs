const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const norm=value=>String(value||"").trim();
const countBy=(items,key)=>Object.entries(items.reduce((map,item)=>{const values=Array.isArray(key(item))?key(item):[key(item)];for(const raw of values){const value=norm(raw);if(value)map[value]=(map[value]||0)+1}return map},{})).filter(([,count])=>count>=5).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
(async()=>{
  const profile=process.argv[2]||"D:/Vault/tests/edge-profile-reading-audit-20260828";
  const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:EDGE,args:["--profile-directory=Default"]});
  try{
    const page=context.pages()[0]||await context.newPage();await page.goto("http://127.0.0.1:4173/index.html?librarySummary=1#/books",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    const items=await page.evaluate(async()=>Object.values((await import("./js/core/store.js")).getState().items||{}).filter(item=>["books","manga"].includes(item.wing)));
    const books=items.filter(i=>i.wing==="books"),comics=items.filter(i=>i.wing==="manga"),missing=(list,field)=>list.filter(field).length;
    const cleanup=await page.evaluate(async()=>{const state=(await import("./js/core/store.js")).getState();return state.metadata?.readingLibraryCleanup||null});
    const summary={total:items.length,books:books.length,comics:comics.length,owned:items.filter(i=>i.owned).length,planned:items.filter(i=>(i.bookMeta?.status||i.comicMeta?.readingStatus||i.status)==="planned").length,cleanup,missing:{bookAuthor:missing(books,i=>!(i.authors||[]).length),bookDescription:missing(books,i=>!norm(i.description)),bookGenres:missing(books,i=>!(i.genres||[]).length),bookPublisher:missing(books,i=>!norm(i.publisher)),bookYear:missing(books,i=>!i.year),bookPages:missing(books,i=>!i.bookMeta?.pageCount),comicCreator:missing(comics,i=>!norm(i.creator)),comicDescription:missing(comics,i=>!norm(i.description)),comicGenres:missing(comics,i=>!(i.genres||[]).length),comicPublisher:missing(comics,i=>!norm(i.publisher)),comicYear:missing(comics,i=>!i.year)},groups:{bookSeries:countBy(books,i=>i.bookMeta?.seriesName),bookAuthors:countBy(books,i=>i.authors||[]),comicCreators:countBy(comics,i=>String(i.creator||"").split(/,|&| and /i).map(v=>v.trim())),types:countBy(items,i=>i.wing==="books"?(i.format||i.type||"Book"):(i.comicMeta?.format||i.type||"Comic"))}};
    console.log(JSON.stringify(summary,null,2));
  }finally{await context.close()}
})().catch(error=>{console.error(error);process.exit(1)});
