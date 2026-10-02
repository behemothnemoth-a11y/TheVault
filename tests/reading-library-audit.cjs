const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
(async()=>{
  const context=await chromium.launchPersistentContext("D:/Vault/tests/edge-profile-reading-audit-20260828",{headless:true,executablePath:EDGE,args:["--profile-directory=Default"]});
  try{
    const pages=context.pages(),page=pages[0]||await context.newPage();
    await page.goto("http://127.0.0.1:4173/index.html?libraryAudit=1#/books",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true",null,{timeout:90000});
    const audit=await page.evaluate(async()=>{
      const {getState}=await import("./js/core/store.js"),state=getState(),items=Object.values(state.items||{}).filter(item=>["books","manga"].includes(item.wing));
      return{schemaVersion:state.schemaVersion,total:items.length,books:items.filter(item=>item.wing==="books"),comics:items.filter(item=>item.wing==="manga"),collections:Object.values(state.collections||{}).filter(c=>["books","manga"].includes(c.wing))};
    });
    console.log(JSON.stringify(audit));
  }finally{await context.close()}
})().catch(error=>{console.error(error);process.exit(1)});
