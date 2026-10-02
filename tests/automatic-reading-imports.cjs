const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EPUB = "D:\\Unsorted\\All Dune books + short stories + extras ePUB\\Dune Chronicles (Dune 7)\\Dune Chronicles 1 - Hunters of Dune.epub";
const CBR0 = "D:\\Unsorted\\Crossed v1 (000 - 009) (2008 - 2010) (Digital)\\Crossed 000 (2008) (Digital) (Nahga-Empire).cbr";
const CBR1 = "D:\\Unsorted\\Crossed v1 (000 - 009) (2008 - 2010) (Digital)\\Crossed 001 (2008) (Digital) (Nahga-Empire).cbr";
const CROSSED_FOLDER = "D:\\Unsorted\\Crossed v1 (000 - 009) (2008 - 2010) (Digital)";
const CBZ = "D:\\Unsorted\\The Comic Book Story of Video Games by Jonathan Hennessey .. CBZ\\The Comic Book Story of Video Games by Jonathan Hennessey .. .cbz";
const assert = (value,message)=>{if(!value)throw new Error(message)};
const BASE=process.env.VAULT_TEST_URL||"http://127.0.0.1:4173/index.html";

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  try{
    await page.goto(`${BASE}?automaticImportTest=${Date.now()}#/books`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    const folderScan=await page.evaluate(async path=>{
      const response=await fetch("./__vault/folder-scan",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"scan-selected-folder"},body:JSON.stringify({wing:"manga",path})});
      return{ok:response.ok,payload:await response.json()};
    },CROSSED_FOLDER);
    assert(folderScan.ok,"Full-path folder scan endpoint failed.");
    assert(folderScan.payload.folder===CROSSED_FOLDER,"Full-path folder scan returned the wrong folder.");
    assert(folderScan.payload.fileCount===10,"Full-path folder scan did not find all ten Crossed archives.");
    const outcome=await page.evaluate(async paths=>{
      const store=await import("./js/core/store.js"),scan=await import(`./js/systems/readingDriveScan.js?test=${Date.now()}`);
      const file=(id,path,extension,folder)=>({id,path,name:path.split("\\").pop(),titleHint:path.split("\\").pop().replace(/\.[^.]+$/, ""),extension,status:"pending",selectedFolder:folder});
      store.update(save=>{save.items={};save.metadata.readingDriveScan={scanned:true,files:[file("epub",paths.epub,"EPUB","BOOKS"),file("cbr0",paths.cbr0,"CBR","COMICS"),file("cbr1",paths.cbr1,"CBR","COMICS"),file("cbz",paths.cbz,"CBZ","COMICS")]};},{persist:false});
      const books=await scan.autoImportReadingFiles({folder:"BOOKS",wing:"books"}),comics=await scan.autoImportReadingFiles({folder:"COMICS",wing:"manga"});
      store.update(save=>save.metadata.readingDriveScan.files.push(file("duplicate",paths.cbr0,"CBR","COMICS")),{persist:false});
      const duplicate=await scan.autoImportReadingFiles({folder:"COMICS",wing:"manga"}),state=store.getState(),crossed=Object.values(state.items).find(item=>item.title==="Crossed");
      return{books,comics,duplicate,itemCount:Object.keys(state.items).length,book:Object.values(state.items).find(item=>item.wing==="books"),crossed:{title:crossed?.title,volumes:crossed?.comicMeta?.volumes?.map(volume=>({number:volume.number,title:volume.title}))},pending:state.metadata.readingDriveScan.files.filter(file=>file.status==="pending").length};
    },{epub:EPUB,cbr0:CBR0,cbr1:CBR1,cbz:CBZ});
    assert(outcome.books.books===1&&outcome.books.review===0,"EPUB was not imported automatically.");
    assert(outcome.comics.comics===3&&outcome.comics.review===0,"Comic archives were not imported automatically.");
    assert(outcome.crossed.volumes.length===2,"Crossed issues were not grouped into one series.");
    assert(outcome.crossed.volumes[0].number===0&&outcome.crossed.volumes[1].number===1,"Comic issue order is incorrect.");
    assert(outcome.duplicate.duplicates===1,"Duplicate path was not skipped automatically.");
    assert(outcome.pending===0,"Routine reading files were left in review.");
    assert(!errors.length,`Runtime errors: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify({ok:true,folderScan:{folder:folderScan.payload.folder,fileCount:folderScan.payload.fileCount},outcome},null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
