import { initStore,createArchiveSnapshot,getState,update,flushPersistence } from "../core/store.js";
import { correctAllBookMetadata,refreshBookSeries } from "../wings/books.js";
import { correctAllComicMetadata } from "../wings/comicsManga.js";

const $=selector=>document.querySelector(selector),phase=$("#phase"),bar=$("#bar"),log=$("#log"),run=$("#run"),stats={processed:$("#processed"),updated:$("#updated"),review:$("#review"),groups:$("#groups")};
let processed=0,updated=0,review=0,total=1;
const write=text=>{log.textContent+=`${new Date().toLocaleTimeString()}  ${text}\n`;log.scrollTop=log.scrollHeight};
const show=(label,value={})=>{phase.textContent=label;processed=Number(value.processed??processed);updated=Number(value.updated??updated);review=Number(value.failed??review);for(const [key,node] of Object.entries(stats))if(key!=="groups")node.textContent=key==="processed"?processed:key==="updated"?updated:review;bar.style.width=`${Math.min(100,Math.round(processed/Math.max(1,total)*100))}%`};
const clean=value=>String(value||"").trim(),slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function buildGroups(){let groups=[];update(save=>{const reading=Object.values(save.items||{}).filter(item=>["books","manga"].includes(item.wing)),make=(wing,kind,label,items)=>{if(items.length<5)return;groups.push({id:`${wing}-${kind}-${slug(label)}`,wing,kind,label,itemIds:items.map(item=>item.id),count:items.length,updatedAt:new Date().toISOString()})};
  const books=reading.filter(item=>item.wing==="books"),comics=reading.filter(item=>item.wing==="manga");
  const bucket=(list,values)=>{const map=new Map();for(const item of list)for(const value of values(item)){const key=clean(value);if(!key)continue;if(!map.has(key))map.set(key,[]);map.get(key).push(item)}return map};
  for(const [name,items] of bucket(books,item=>[item.bookMeta?.seriesName]).entries())make("books","series",name,items);
  for(const [name,items] of bucket(books,item=>item.authors||[]).entries())make("books","author",name,items);
  for(const [name,items] of bucket(books,item=>[item.format||item.type||"Book"]).entries())make("books","type",String(name).toUpperCase(),items);
  for(const [name,items] of bucket(comics,item=>String(item.creator||"").split(/,|&| and /i)).entries())make("manga","creator",name,items);
  for(const [name,items] of bucket(comics,item=>[item.comicMeta?.format||item.type||"comic"]).entries())make("manga","type",String(name).replaceAll("_"," ").toUpperCase(),items);
  save.metadata.readingLibraryGroups={version:1,threshold:5,groups,generatedAt:new Date().toISOString()};
});stats.groups.textContent=groups.length;return groups}

async function start(){run.disabled=true;try{await initStore({});const state=getState(),books=Object.values(state.items||{}).filter(item=>item.wing==="books"&&item.bookMeta?.curated),comics=Object.values(state.items||{}).filter(item=>item.wing==="manga"&&item.comicMeta);total=books.length+comics.length;write(`Found ${books.length} books and ${comics.length} comics/manga.`);show("CREATING PROTECTED ROLLBACK SNAPSHOT…");const snapshot=await createArchiveSnapshot("Before full Books + Comics metadata cleanup",{kind:"reading_cleanup",protected:true});write(`Protected snapshot created: ${snapshot?.id||"saved"}.`);
  show("VERIFYING EVERY BOOK AGAINST BOOK CATALOGS…");const bookResult=await correctAllBookMetadata({onProgress:value=>{show(`BOOKS · ${value.title}`,value);if(value.processed%10===0)write(`${value.processed}/${value.total} books checked · ${value.updated} updated.`)}});write(`Books complete: ${bookResult.updated} updated · ${bookResult.failed} uncertain.`);
  try{await refreshBookSeries({onProgress:value=>write(`${value.grouped} books assigned to verified series.`)})}catch(error){write(`Series verification paused: ${error.message}`)}
  const bookOffset=books.length;show("VERIFYING EVERY COMIC / MANGA SERIES…",{processed:bookOffset,updated:bookResult.updated,failed:bookResult.failed});const comicResult=await correctAllComicMetadata({onProgress:value=>{show(`COMICS / MANGA · ${value.title}`,{processed:bookOffset+value.processed,updated:bookResult.updated+value.updated,failed:bookResult.failed+value.failed});if(value.processed%5===0)write(`${value.processed}/${value.total} comic series checked · ${value.updated} updated.`)}});write(`Comics/Manga complete: ${comicResult.updated} updated · ${comicResult.failed} uncertain.`);
  const groups=buildGroups();write(`${groups.length} group cards prepared at the five-title threshold.`);update(save=>{save.metadata.readingLibraryCleanup={completedAt:new Date().toISOString(),books:bookResult,comics:{total:comicResult.total,updated:comicResult.updated,failed:comicResult.failed},groupCount:groups.length,snapshotId:snapshot?.id||""}});await flushPersistence();show("CLEANUP COMPLETE — YOUR LIBRARY IS SAFE",{processed:total,updated:bookResult.updated+comicResult.updated,failed:bookResult.failed+comicResult.failed});bar.style.width="100%";write("Done. Reopen or refresh the Vault to see the cleaned library.");run.textContent="COMPLETE"}catch(error){phase.textContent="CLEANUP PAUSED — EXISTING LIBRARY UNCHANGED OR PARTIALLY ENRICHED";write(error.stack||error.message);run.disabled=false;run.textContent="RESUME CLEANUP"}}
run.onclick=start;
if(new URLSearchParams(location.search).get("run")==="1")start();
