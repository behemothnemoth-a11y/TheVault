const { chromium } = require("./playwright-runtime.cjs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ROOT = process.env.VAULT_TEST_ROOT || "http://127.0.0.1:4199/index.html#/";
const assert = (value,message) => { if(!value) throw new Error(message); };

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:EDGE});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  const token=Date.now(),trip=`Trip Test ${token}`,project=`Writing Test ${token}`;
  try{
    await page.goto(ROOT+"trips",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.vaultReady==="true");
    await page.locator("[data-trip-add]").first().click();
    await page.locator("[data-trip-title]").fill(trip);await page.locator("[data-trip-destination]").fill("Redfield Test Route");
    await page.locator("[data-trip-type]").fill("ROAD TRIP");await page.locator("[data-trip-budget]").fill("$500");
    await page.locator("[data-trip-itinerary]").fill("Day one route");await page.locator("[data-trip-checklist]").fill("Pack charger");
    await page.getByRole("button",{name:"ADD TO TRIPS"}).click();await page.waitForSelector(".trip-detail");
    const detail=await page.locator(".trip-detail").textContent();assert(detail.includes("ROAD TRIP")&&detail.includes("Day one route")&&detail.includes("Pack charger"),"Structured trip fields were not saved.");
    await page.locator("[data-trip-favorite]").click();assert((await page.locator(".trip-detail").textContent()).includes("FAVORITE"),"Trip favorite did not persist.");
    await page.locator("[data-trip-remove]").click();await page.getByRole("button",{name:"REMOVE",exact:true}).click();

    await page.goto(ROOT+"writing",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.body.dataset.vaultRoute==="writing");
    await page.locator("[data-w-new-project]").first().click();await page.locator("[data-w-create-title]").fill(project);await page.locator("[data-w-create-summary]").fill("Acceptance project");await page.getByRole("button",{name:"CREATE PROJECT"}).click();
    await page.locator("[data-w-new-document]").first().click();await page.locator("[data-w-create-document-title]").fill("Chapter One");await page.locator("[data-w-create-document-kind]").selectOption({label:"CHAPTER"});await page.getByRole("button",{name:"CREATE DOCUMENT"}).click();
    await page.locator("[data-w-body]").fill("These words verify local autosave and document handling.");await page.waitForTimeout(300);
    await page.locator("[data-w-duplicate]").click();assert((await page.locator("[data-w-title]").inputValue()).includes("Copy"),"Document copy did not open.");
    await page.locator("[data-w-remove-current]").click();await page.locator("#modal-root").getByRole("button",{name:"REMOVE",exact:true}).click();await page.waitForSelector(".writing-project-controls");
    await page.locator("[data-w-remove-project]").click();await page.locator("#modal-root").getByRole("button",{name:"REMOVE PROJECT"}).click();await page.waitForSelector(".writing-library");
    assert(!(await page.locator(".writing-library").textContent()).includes(project),"Removed writing project remained visible.");
    assert(!errors.length,`Runtime errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ok:true,trips:true,writing:true,shellPreserved:await page.locator(".atomic-rail").count()===1},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
