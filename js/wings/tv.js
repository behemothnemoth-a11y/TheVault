import { getState, update } from "../core/store.js";
import { queueArtworkApproval } from "../systems/artworkApproval.js";
import { createId } from "../core/ids.js";
import { getReviewQueue, getReviewQueueStats } from "../systems/reviewQueue.js";
import { generatedTvCatalog } from "../systems/generatedTvCatalog.js";
import { getRecommendationReadiness } from "../systems/adaptiveEditorial.js";
import { fillTitlesFromFiles } from "../systems/tvEpisodeDetails.js?v=20260911-episode-details-v1";
import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { setEpisodeWatched, refreshTvProgress } from "../systems/tvPlaybackState.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hue=t=>[...t].reduce((s,c)=>s+c.charCodeAt(0),0)%360;
const norm=t=>String(t||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(?:the|a|an)\b/g," ").replace(/[^a-z0-9]+/g," ").trim();
const fileUrl=path=>`file:///${String(path).replace(/\\/g,"/").split("/").map((part,i)=>i?encodeURIComponent(part):part).join("/")}`;
const pathFor=file=>file.sourcePath||(/^[a-z]:\\/i.test(file.path)?file.path:`D:\\TV Shows\\${file.path}`);
let reconciled=false;
let tvPage=1;
// The television wing is a browsable wall of cases. Keep the full owned
// collection in one vertical flow instead of interrupting it with pagination.
const TV_PAGE_SIZE=240;
const dailyDefaults={tvScope:"owned",tvGenre:"all",tvSort:"title",tvEpisodeOrder:"desc"};
const artFor=show=>typeof show.artwork==="string"?show.artwork:show.artwork?.localPath||show.artwork?.url||"";
const safeUrl=value=>{const raw=String(value||"");if(/^\.\/assets\/artwork\/[a-z0-9_.-]+$/i.test(raw))return raw;try{const url=new URL(raw);return["http:","https:"].includes(url.protocol)?url.href:""}catch{return""}};
const allTv=(state=getState())=>Object.values(state.items||{}).filter(item=>item.wing==="tv"&&!item.id.startsWith("tv_drive_"));
const episodesFor=show=>Object.values(makeEpisodes(show)).sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.number)-Number(b.number));
const tvPrefs=(state=getState())=>({...dailyDefaults,...(state.preferences?.dailyDriver||{})});
const progressFor=show=>{const episodes=episodesFor(show),done=episodes.filter(episode=>episode.status==="completed").length;return{episodes,done,total:episodes.length,percent:episodes.length?Math.round(done/episodes.length*100):0}};
const coverageFor=show=>{const episodes=episodesFor(show),playable=episodes.filter(isPlayable).length;if(show.tvMeta?.catalogEnriched){const total=episodes.length,owned=show.owned?playable:0,missing=Math.max(0,total-owned),label=show.owned?(missing?"PARTIAL":"CURRENT"):"DISCOVERY",tone=show.owned?(missing?"partial":"complete"):"cataloged";return{local:owned,total,missing,playable,label,tone,summary:show.owned?`${owned}/${total} OWNED · ${missing} NOT OWNED · ${playable} PLAYABLE`:`${total} CURRENT EPISODES · TRACKED`}}const local=episodes.length,reference=generatedTvCatalog[show.id];if(!reference)return{local,total:local,missing:null,playable,label:"CATALOGED",tone:"cataloged",summary:`${local} CATALOGED · ${playable} DIRECT`};const total=Number(reference.regularEpisodes||reference.totalEpisodes||local),missing=Math.max(0,total-local),extras=Math.max(0,local-total),label=missing?"PARTIAL":extras||reference.specials?"COMPLETE + SPECIALS":"COMPLETE",tone=missing?"partial":"complete";return{local,total,missing,playable,extras,specials:Number(reference.specials||0),label,tone,summary:`${Math.min(local,total)}/${total} CATALOGED · ${playable} DIRECT${missing?` · ${missing} NOT CATALOGED`:""}`}};
const isPlayable=episode=>Boolean(episode?.sourcePath)&&(episode.linkStatus!=="missing"||Boolean(episode.alternatePaths?.length));
const nextFor=show=>{const pending=episodesFor(show).filter(episode=>episode.status!=="completed");return pending.find(isPlayable)||pending[0]||null};
const episodeCode=episode=>episode?`S${String(episode.season).padStart(2,"0")}E${String(episode.number).padStart(2,"0")}`:"COMPLETE";
const hasLocalTvContent=show=>Boolean(show?.owned||(show?.sourcePaths||[]).length||episodesFor(show).some(episode=>episode.sourcePath));
const isPlannedTv=show=>Boolean(show?.tvMeta?.planned||show?.status==="planned");
const tvSectionTabs=active=>`<nav class="tv-section-tabs" aria-label="Television sections"><button class="${active==="library"?"active":""}" data-tv-section="library">LIBRARY</button><button class="${active==="genres"?"active":""}" data-tv-section="genres">GENRES</button><button class="${active==="recommendations"?"active":""}" data-tv-section="recommendations">RECOMMENDED</button></nav>`;

export function clearCurrentTvRecommendations(){
  const state=getState();if(state.metadata?.tv?.recommendationResetVersion>=1)return{removed:0,alreadyComplete:true};
  const targets=allTv(state).filter(show=>!hasLocalTvContent(show)),ids=new Set(targets.map(show=>show.id)),removed=targets.map(show=>({id:show.id,title:show.title,removedAt:new Date().toISOString()}));
  update(save=>{for(const id of ids)delete save.items[id];save.metadata.tv||={};save.metadata.tv.recommendationResetVersion=1;save.metadata.tv.recommendationResetAt=new Date().toISOString();save.metadata.tv.removedRecommendationLog=[...(save.metadata.tv.removedRecommendationLog||[]),...removed];save.metadata.tv.recommendations=[];const prefs={...dailyDefaults,...(save.preferences.dailyDriver||{})};prefs.dismissedRecommendations=[];prefs.recommendationsHidden=false;prefs.hiddenCards=(prefs.hiddenCards||[]).filter(id=>!ids.has(id));if(prefs.tvScope==="unowned")prefs.tvScope="owned";save.preferences.dailyDriver=prefs;if(Array.isArray(save.metadata.artworkApprovals))save.metadata.artworkApprovals=save.metadata.artworkApprovals.filter(entry=>!ids.has(entry.itemId))});
  return{removed:removed.length,alreadyComplete:false};
}

export function setTvPreference(key,value){
  const field={scope:"tvScope",genre:"tvGenre",sort:"tvSort",episodeOrder:"tvEpisodeOrder"}[key];
  if(!field)return;
  tvPage=1;
  update(save=>{save.preferences.dailyDriver={...dailyDefaults,...(save.preferences.dailyDriver||{}),[field]:value}});
}

export function resetTvPreferences(){
  tvPage=1;
  update(save=>{
    const existing=save.preferences.dailyDriver||{};
    save.preferences.dailyDriver={
      ...dailyDefaults,
      hiddenCards:[...(existing.hiddenCards||[])],
      dismissedRecommendations:[...(existing.dismissedRecommendations||[])],
      recommendationsHidden:Boolean(existing.recommendationsHidden)
    };
  });
}

export function setTvPage(value){
  tvPage=Math.max(1,Number(value)||1);
}

export function setTvRating(showId,rating){
  const value=Math.max(0,Math.min(10,Number(rating)||0));
  if(!getState().items[showId])return 0;
  update(save=>{const show=save.items[showId];if(!show)return;show.rating=show.rating===value?0:value});
  return Number(getState().items[showId]?.rating||0);
}

export function toggleTvFavorite(showId){
  if(!getState().items[showId])return false;
  update(save=>{save.items[showId].favorite=!save.items[showId].favorite});
  return Boolean(getState().items[showId].favorite);
}

export function hideTvCard(showId){
  if(!getState().items[showId])return false;
  update(save=>{
    const prefs={...dailyDefaults,...(save.preferences.dailyDriver||{})};
    prefs.hiddenCards=[...new Set([...(prefs.hiddenCards||[]),showId])];
    save.preferences.dailyDriver=prefs;
  });
  return true;
}

export function restoreTvCard(showId){
  if(!getState().items[showId])return false;
  update(save=>{
    const prefs={...dailyDefaults,...(save.preferences.dailyDriver||{})};
    prefs.hiddenCards=(prefs.hiddenCards||[]).filter(id=>id!==showId);
    save.preferences.dailyDriver=prefs;
  });
  return true;
}

export function setTvRecommendationsHidden(hidden){
  update(save=>{save.preferences.dailyDriver={...dailyDefaults,...(save.preferences.dailyDriver||{}),recommendationsHidden:Boolean(hidden)}});
}

export function dismissTvRecommendation(showId){
  update(save=>{
    const prefs={...dailyDefaults,...(save.preferences.dailyDriver||{})};
    prefs.dismissedRecommendations=[...new Set([...(prefs.dismissedRecommendations||[]),showId])];
    save.preferences.dailyDriver=prefs;
  });
}

export function recordSeriesOpened(showId){
  if(!getState().items[showId])return;
  const openedAt=new Date().toISOString();
  update(save=>{
    const recent=(save.metadata.stage33.recentTv||[]).filter(entry=>entry.showId!==showId);
    save.metadata.stage33.recentTv=[{showId,openedAt},...recent].slice(0,24);
  });
}

export function recordEpisodePlayback(showId,episodeId){
  const playedAt=new Date().toISOString();
  update(save=>{
    const show=save.items[showId],episode=show?.episodes?.[episodeId];
    if(!episode)return;
    episode.lastPlayedAt=playedAt;
    save.metadata.stage33.playbackHistory=[{showId,episodeId,playedAt},...(save.metadata.stage33.playbackHistory||[])].slice(0,250);
  });
}

export function quickCompleteEpisode(showId,episodeId){
  let completed=false;
  update(save=>{
    const show=save.items[showId],episode=show?.episodes?.[episodeId];
    if(!episode)return;
    setEpisodeWatched(episode,true);completed=true;
    const episodes=Object.values(show.episodes||{}),done=episodes.filter(item=>item.status==="completed").length;
    show.progress={completed:done,total:episodes.length};
    refreshTvProgress(show);
  });
  return completed;
}

export function setTvSeasonWatched(showId,season,watched){let changed=0;update(save=>{const show=save.items[showId];if(!show)return;for(const episode of Object.values(show.episodes||{})){if(Number(episode.season)!==Number(season))continue;const next=watched?"completed":"backlog";if(episode.status!==next){episode.status=next;changed++}setEpisodeWatched(episode,watched)}const episodes=Object.values(show.episodes||{}),done=episodes.filter(episode=>episode.status==="completed").length;show.progress={completed:done,total:episodes.length};show.status=done===episodes.length&&done?"completed":done?"in_progress":"backlog"});return changed}

function dailyShows(limit=6){
  const state=getState(),recent=new Map((state.metadata.stage33?.recentTv||[]).map((entry,index)=>[entry.showId,index]));
  const hidden=new Set(tvPrefs(state).hiddenCards||[]),visible=allTv(state).filter(show=>!hidden.has(show.id));
  const owned=visible.filter(show=>show.owned),base=owned.length?owned:visible;
  const priority=base.filter(show=>show.favorite||show.status==="in_progress"||recent.has(show.id)).sort((a,b)=>
    Number(Boolean(b.favorite))-Number(Boolean(a.favorite))||
    Number(b.status==="in_progress")-Number(a.status==="in_progress")||
    (recent.get(a.id)??999)-(recent.get(b.id)??999)||a.title.localeCompare(b.title)
  );
  if(priority.length)return priority.slice(0,limit);
  return base.filter(show=>nextFor(show)?.sourcePath).sort((a,b)=>
    Number(Boolean(b.owned))-Number(Boolean(a.owned))||a.title.localeCompare(b.title)
  ).slice(0,limit);
}

function ownershipRecommendations(limit=8){
  const state=getState(),prefs=tvPrefs(state),dismissed=new Set(prefs.dismissedRecommendations||[]),hidden=new Set(prefs.hiddenCards||[]),owned=allTv(state).filter(show=>show.owned),genreSignals=new Map();
  for(const show of owned){
    const progress=progressFor(show),weight=1+Math.min(6,progress.done/10)+(show.favorite?5:0)+Number(show.rating||0)/2;
    for(const genre of show.genres||[])genreSignals.set(genre,(genreSignals.get(genre)||0)+weight);
  }
  return allTv(state).filter(show=>!show.owned&&!dismissed.has(show.id)&&!hidden.has(show.id)).map(show=>{
    const progress=progressFor(show),genres=(show.genres||[]).map(genre=>({genre,score:genreSignals.get(genre)||0})).sort((a,b)=>b.score-a.score);
    let score=Math.min(120,progress.done*5)+(show.favorite?80:0)+Number(show.rating||0)*6+(show.status==="in_progress"?45:0)+(genres[0]?.score||0);
    const reasons=[];
    if(progress.done)reasons.push(`You watched ${progress.done} episode${progress.done===1?"":"s"} in the original Vault`);
    if(show.favorite)reasons.push("You explicitly marked this as a favorite");
    if(Number(show.rating)>0)reasons.push(`You rated the series ${show.rating}/10`);
    if(genres[0]?.score)reasons.push(`It matches your owned ${genres[0].genre} shelf`);
    if(!reasons.length)reasons.push("It broadens a genre already represented in your archive");
    return{show,score,reasons,progress};
  }).sort((a,b)=>b.score-a.score||a.show.title.localeCompare(b.show.title)).slice(0,limit);
}

function ensureOwnershipFirst(){
  const state=getState();
  if(state.metadata?.tvOwnershipFirst?.version===1)return;
  update(save=>{
    save.preferences.dailyDriver={...dailyDefaults,...(save.preferences.dailyDriver||{}),tvScope:"owned"};
    save.metadata.tvOwnershipFirst={version:1,enabledAt:new Date().toISOString(),defaultShelf:"owned"};
  });
}

export function renderTvHomeShelf(){
  const shows=dailyShows(6);
  if(!shows.length)return`<section class="panel span-12 daily-home-shelf"><div class="panel__header"><h2>YOUR TELEVISION SHELF</h2><span class="panel__code">READY</span></div><p class="muted">Open a series or mark a favorite in the TV wing and it will stay close at hand here.</p><button class="button primary" data-route="tv">OPEN TELEVISION</button></section>`;
  return`<section class="panel span-12 daily-home-shelf"><div class="panel__header"><h2>CONTINUE IN TELEVISION</h2><button class="button" data-route="tv">ALL SERIES</button></div><div class="daily-tv-strip">${shows.map(show=>{const progress=progressFor(show),next=nextFor(show),art=artFor(show);return`<button class="daily-tv-card" data-open-series="${show.id}" style="--h:${hue(show.title)}"><i>${art?`<img src="${esc(art)}" alt="">`:esc(show.title.slice(0,2))}</i><span><b>${esc(show.title)}</b><small>${episodeCode(next)} NEXT · ${progress.percent}%</small></span>${show.favorite?`<em aria-label="Favorite">&#9733;</em>`:""}</button>`}).join("")}</div></section>`;
}

function reconcileDriveFiles(){
  if(reconciled)return;reconciled=true;
  const state=getState(),accepted=(state.metadata.driveReviewQueue||[]).filter(c=>c.status==="accepted");
  if(!accepted.length)return;
  update(save=>{
    const shows=Object.values(save.items).filter(i=>i.wing==="tv");
    for(const candidate of accepted){
      const matches=shows.filter(show=>norm(show.title)===norm(candidate.title));
      const show=matches.sort((a,b)=>(a.id.startsWith("tv_drive_")?1:0)-(b.id.startsWith("tv_drive_")?1:0))[0];
      if(!show)continue;
      show.owned=true;show.sourcePaths=[...new Set([...(show.sourcePaths||[]),...candidate.files.map(pathFor)])];
      show.episodes ||= {};
      for(const file of candidate.files){
        if(!file.season||!file.episode)continue;
        let episode=Object.values(show.episodes).find(ep=>Number(ep.season)===Number(file.season)&&Number(ep.number)===Number(file.episode));
        if(!episode){
          const id=`${show.id}_s${String(file.season).padStart(2,"0")}e${String(file.episode).padStart(2,"0")}`;
          episode=show.episodes[id]={id,season:Number(file.season),number:Number(file.episode),status:"backlog",rating:null,note:"",rewatches:0};
        }
        episode.sourcePath=pathFor(file);
      }
      const eps=Object.values(show.episodes),done=eps.filter(e=>e.status==="completed").length;
      show.progress={completed:done,total:eps.length};show.status=done===eps.length&&done?"completed":done?"in_progress":"backlog";
    }
  });
  // Episodes linked from a folder scan take their title from the filename.
  fillTitlesFromFiles();
}
export function ensureTvStyles(){
  ensureOwnershipFirst();
  reconcileDriveFiles();
  if(!document.querySelector("link[data-tv-styles]")){const l=document.createElement("link");l.rel="stylesheet";l.href="./css/tv.css?v=20260830-episode-list-v3";l.dataset.tvStyles="";document.head.append(l)}
  if(!document.querySelector("link[data-tv-episode-styles]")){const l=document.createElement("link");l.rel="stylesheet";l.href="./css/tvEpisodeList.css?v=20260830-v2";l.dataset.tvEpisodeStyles="";document.head.append(l)}
}

export function renderTvShell(content, screen="catalog"){
  return renderAtomicWingShell({active:"tv",title:"TELEVISION ARCHIVE",section:screen==="catalog"?"OWNED COLLECTION":screen==="series"?"SERIES FILE":screen==="season"?"SEASON FILE":"INTAKE REVIEW",content:`<div class="atomic-tv atomic-tv--${screen}">${content}</div>`,footer:"LOCAL ARCHIVE // OWNED FIRST"});
}
export function makeEpisodes(item){
  if(item.episodes&&Object.keys(item.episodes).length)return item.episodes;
  if(item.sourcePaths?.length){
    const out={};item.sourcePaths.forEach(path=>{const m=path.match(/s(\d{1,2})e(\d{1,3})/i);if(!m)return;const id=`${item.id}_s${m[1].padStart(2,"0")}e${m[2].padStart(2,"0")}`;out[id]={id,season:+m[1],number:+m[2],status:"backlog",sourcePath:/^[a-z]:\\/i.test(path)?path:`D:\\TV Shows\\${path}`}});
    return out;
  }
  return Object.fromEntries(Array.from({length:+item.progress?.total||0},(_,i)=>{const n=i+1,id=`${item.id}_s01e${String(n).padStart(2,"0")}`;return[id,{id,season:1,number:n,status:n<=+item.progress?.completed?"completed":"backlog"}]}));
}

function tvCandidateCard(candidate,index){const art=safeUrl(candidate.posterImageUrl),years=[candidate.startYear,candidate.endYear].filter(Boolean).join("–")||"YEAR UNKNOWN",episodes=(candidate.seasons||[]).reduce((sum,season)=>sum+Number(season.episodeCount||0),0);return`<button class="tv-search-result" data-tv-candidate="${index}"><i style="--h:${hue(candidate.title)}">${art?`<img src="${esc(art)}" alt="Poster for ${esc(candidate.title)}">`:esc(candidate.title.slice(0,2))}</i><span><b>${esc(candidate.title)}</b><small>${esc(years)} · ${Number(candidate.seasons?.length||0)} SEASONS · ${episodes} EPISODES</small><em>${esc(candidate.network||candidate.creators?.[0]||"NETWORK UNKNOWN")}</em><p>${esc(candidate.description||"Verified television series match")}</p></span><strong>REVIEW →</strong></button>`}

function applyTvCandidate(candidate,{owned=false,targetId=""}={}){const duplicate=allTv().find(show=>norm(show.title)===norm(candidate.title)&&(!show.year||!candidate.startYear||Number(show.year)===Number(candidate.startYear))),id=targetId||duplicate?.id||createId("tv"),addedAt=new Date().toISOString();update(save=>{const prior=save.items[id]||{},episodes={...(prior.episodes||{})};for(const season of candidate.seasons||[]){for(let number=1;number<=Number(season.episodeCount||0);number++){const existing=Object.values(episodes).find(episode=>Number(episode.season)===Number(season.number)&&Number(episode.number)===number),episodeId=existing?.id||`${id}_s${String(season.number).padStart(2,"0")}e${String(number).padStart(2,"0")}`;episodes[episodeId]={id:episodeId,season:Number(season.number),number,status:"backlog",rating:null,note:"",rewatches:0,...existing}}}const completed=Object.values(episodes).filter(episode=>episode.status==="completed").length;save.items[id]={...prior,id,wing:"tv",type:"tv",title:String(candidate.title||prior.title||"Untitled Series"),year:Number(candidate.startYear||0)||prior.year||null,endYear:Number(candidate.endYear||0)||null,status:completed?"in_progress":prior.status||"backlog",owned:Boolean(prior.owned||owned),favorite:Boolean(prior.favorite),genres:(candidate.genres||prior.genres||[]).slice(0,10),description:String(candidate.description||prior.description||""),creator:(candidate.creators||[]).join(", ")||prior.creator||"",network:String(candidate.network||prior.network||""),artwork:prior.artwork||safeUrl(candidate.posterImageUrl)||"",addedAt:prior.addedAt||addedAt,episodes,progress:{completed,total:Object.keys(episodes).length},sourcePaths:prior.sourcePaths||[],tvMeta:{...(prior.tvMeta||{}),publicationStatus:candidate.status||"unknown",catalogEnriched:true,seasons:candidate.seasons||[],sourceName:candidate.sourceName||"Verified TV source",sourceUrl:safeUrl(candidate.sourceUrl),officialUrl:safeUrl(candidate.officialUrl),externalId:String(candidate.externalId||""),posterSourceUrl:safeUrl(candidate.posterSourceUrl),posterSourceName:candidate.posterSourceName||"Published series poster",catalogUpdatedAt:addedAt,addedBy:targetId?prior.tvMeta?.addedBy||"owned_catalog_enrichment":"ai_confirmed_search"}}});return id}

async function enrichTvEpisodes(showId){const show=getState().items[showId];if(!show)return{updated:0};const response=await fetch("./__vault/tv/episodes",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"tv-episodes"},body:JSON.stringify({title:show.title,year:show.year})}),payload=await response.json().catch(()=>({}));if(!response.ok)return{updated:0,error:payload.error||"episode_metadata_unavailable"};let updated=0;update(save=>{const target=save.items[showId];if(!target)return;for(const found of payload.episodes||[]){const episode=Object.values(target.episodes||{}).find(value=>Number(value.season)===Number(found.season)&&Number(value.number)===Number(found.number));if(!episode)continue;if(!episode.title||episode.metadataSource==="TVMaze")episode.title=found.title||episode.title;if(!episode.description||episode.metadataSource==="TVMaze")episode.description=found.description||episode.description;if(!episode.airDate||episode.metadataSource==="TVMaze")episode.airDate=found.airDate||episode.airDate;if(!episode.runtimeMinutes||episode.metadataSource==="TVMaze")episode.runtimeMinutes=Number(found.runtimeMinutes||episode.runtimeMinutes||0);episode.externalId=found.externalId||episode.externalId;episode.metadataSource=payload.sourceName||"TVMaze";episode.metadataUpdatedAt=new Date().toISOString();updated++}target.tvMeta||={};target.tvMeta.episodeMetadataSource=payload.sourceName||"TVMaze";target.tvMeta.episodeMetadataSourceUrl=safeUrl(payload.sourceUrl);target.tvMeta.episodeMetadataUpdatedAt=new Date().toISOString()});return{updated,total:(payload.episodes||[]).length}}

export async function enrichTvSeries(showId){const show=getState().items[showId];if(!show?.title)throw new Error("Series record not found.");const response=await fetch("./__vault/tv/search",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"tv-search"},body:JSON.stringify({query:`${show.title}${show.year?` (${show.year})`:""}`})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===429?"TV search is busy. Try again shortly.":"Current series information is unavailable.");const candidate=(payload.candidates||[]).find(entry=>norm(entry.title)===norm(show.title))||payload.candidates?.[0];if(!candidate)throw new Error("No confident current series match was found.");applyTvCandidate(candidate,{owned:show.owned,targetId:showId});const episodeMetadata=await enrichTvEpisodes(showId);return{showId,seasons:candidate.seasons?.length||0,episodes:(candidate.seasons||[]).reduce((sum,season)=>sum+Number(season.episodeCount||0),0),episodeMetadata:episodeMetadata.updated||0}}

export async function enrichOwnedTvCatalogs({onProgress=()=>{}}={}){const owned=allTv().filter(show=>show.owned),results=[];for(let index=0;index<owned.length;index++){await globalThis.__vaultActiveJobControl?.checkpoint?.();try{const result=await enrichTvSeries(owned[index].id);results.push({...result,updated:true})}catch(error){if(error?.code==="VAULT_JOB_CANCELLED")throw error;results.push({showId:owned[index].id,updated:false,error:error.message})}onProgress({processed:index+1,total:owned.length,updated:results.filter(result=>result.updated).length,failed:results.filter(result=>!result.updated).length,title:owned[index].title})}return{total:owned.length,updated:results.filter(result=>result.updated).length,failed:results.filter(result=>!result.updated).length,results}}

const TV_METADATA_REFRESH_MS=7*24*60*60*1000;
const tvMetadataSignature=show=>JSON.stringify([norm(show.title),String(show.year||""),String(show.tvMeta?.externalId||""),Object.keys(show.episodes||{}).length]);
export async function refreshTvMetadata({onProgress=()=>{},force=false,control=null}={}){
  const all=allTv(),ledger=getState().metadata.tv?.metadataRefresh?.items||{},now=Date.now(),targets=all.filter(show=>{const prior=ledger[show.id];return force||!prior||prior.status!=="updated"||prior.signature!==tvMetadataSignature(show)||now-Date.parse(prior.checkedAt||0)>=TV_METADATA_REFRESH_MS}),results=[];
  for(let index=0;index<targets.length;index++){
    await (control||globalThis.__vaultActiveJobControl)?.checkpoint?.();
    const show=targets[index];let status="failed",message="";
    try{const result=await enrichTvSeries(show.id);status="updated";message=`${result.seasons} seasons · ${result.episodes} episodes · ${result.episodeMetadata} episode details`;results.push({...result,status,message})}catch(error){message=error.message||"Metadata lookup failed";results.push({showId:show.id,status,message})}
    update(save=>{save.metadata.tv||={};save.metadata.tv.metadataRefresh||={items:{}};save.metadata.tv.metadataRefresh.items||={};const current=save.items[show.id];save.metadata.tv.metadataRefresh.items[show.id]={signature:tvMetadataSignature(current||show),checkedAt:new Date().toISOString(),status,message}});
    onProgress({processed:index+1,total:targets.length,libraryTotal:all.length,skipped:all.length-targets.length,updated:results.filter(result=>result.status==="updated").length,failed:results.filter(result=>result.status!=="updated").length,title:show.title});
  }
  const completedAt=new Date().toISOString(),skipped=all.length-targets.length,updated=results.filter(result=>result.status==="updated").length,failed=results.length-updated;update(save=>{save.metadata.tv||={};save.metadata.tv.metadataRefresh||={items:{}};Object.assign(save.metadata.tv.metadataRefresh,{completedAt,total:targets.length,libraryTotal:all.length,skipped,updated,failed})});return{total:targets.length,libraryTotal:all.length,skipped,updated,failed,results,completedAt};
}

export function openTvAddDialog(onAdded=()=>{}){openModal({title:"ADD TELEVISION SERIES",body:`<div class="tv-add-workbench"><header><span class="eyebrow">VERIFY BEFORE ADDING</span><h2>FIND A SERIES</h2><p>Search by title. The Vault will find the correct production, current seasons, episode counts, genres, and published poster.</p></header><div class="tv-add-search"><input data-tv-search-query placeholder="SERIES TITLE" autofocus><button class="button primary" data-tv-search-run>SEARCH</button></div><p data-tv-search-status>NOTHING IS ADDED UNTIL YOU CONFIRM IT.</p><div class="tv-search-results" data-tv-search-results></div></div>`});const root=document.querySelector("#modal-root"),input=root.querySelector("[data-tv-search-query]"),status=root.querySelector("[data-tv-search-status]"),results=root.querySelector("[data-tv-search-results]");let candidates=[];const run=async()=>{const query=input.value.trim();if(query.length<2)return status.textContent="TYPE AT LEAST TWO CHARACTERS";status.textContent="AI IS VERIFYING THE CURRENT SERIES CATALOG AND POSTER…";results.innerHTML="";try{const response=await fetch("./__vault/tv/search",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"tv-search"},body:JSON.stringify({query})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===429?"TV search is busy. Try again shortly.":"TV search is unavailable right now.");candidates=payload.candidates||[];results.innerHTML=candidates.map(tvCandidateCard).join("")||`<div class="empty"><b>NO VERIFIED MATCHES.</b>Try including the year or network.</div>`;status.textContent=`${candidates.length} VERIFIED MATCH${candidates.length===1?"":"ES"} · CHOOSE ONE TO REVIEW`}catch(error){status.textContent=error.message}};root.querySelector("[data-tv-search-run]").onclick=run;input.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();run()}};results.onclick=event=>{const index=event.target.closest("[data-tv-candidate]")?.dataset.tvCandidate,candidate=candidates[index];if(!candidate)return;const art=safeUrl(candidate.posterImageUrl),seasons=(candidate.seasons||[]).length,episodes=(candidate.seasons||[]).reduce((sum,season)=>sum+Number(season.episodeCount||0),0);openModal({title:"CONFIRM TELEVISION SERIES",body:`<div class="tv-confirm-series">${art?`<img src="${esc(art)}" alt="Poster for ${esc(candidate.title)}">`:""}<div><span class="eyebrow">SEARCH MATCH // CONFIRM BEFORE SAVING</span><h2>${esc(candidate.title)}</h2><p>${esc(candidate.description||"")}</p><small>${seasons} SEASONS · ${episodes} EPISODES · ${esc(candidate.network||"NETWORK UNKNOWN")}</small><label><input type="checkbox" data-tv-confirm-owned> I OWN THIS SERIES</label><em>Leave unchecked to track it as a discovery record.</em></div></div>`,actions:[{label:"ADD TO VAULT",primary:true,handler:dialog=>{const id=applyTvCandidate(candidate,{owned:dialog.querySelector("[data-tv-confirm-owned]").checked});closeModal();onAdded(id);toast("TELEVISION SERIES ADDED",candidate.title)}}]})}}
export function renderTvWing(search=""){
  const state=getState(),prefs=tvPrefs(state),q=search.trim().toLowerCase(),hiddenCards=new Set(prefs.hiddenCards||[]),hiddenCount=hiddenCards.size,library=allTv(state).filter(show=>hasLocalTvContent(show)||isPlannedTv(show)),genres=[...new Set(library.flatMap(show=>show.genres||[]))].sort((a,b)=>a.localeCompare(b));
  let shows=library.filter(show=>!q||`${show.title} ${(show.genres||[]).join(" ")}`.toLowerCase().includes(q));if(prefs.tvScope==="hidden")shows=shows.filter(show=>hiddenCards.has(show.id));else shows=shows.filter(show=>!hiddenCards.has(show.id));if(prefs.tvScope==="owned")shows=shows.filter(show=>show.owned);else if(prefs.tvScope==="planned")shows=shows.filter(isPlannedTv);else if(prefs.tvScope==="favorites")shows=shows.filter(show=>show.favorite);else if(["in_progress","backlog","completed"].includes(prefs.tvScope))shows=shows.filter(show=>show.status===prefs.tvScope);if(prefs.tvGenre!=="all")shows=shows.filter(show=>(show.genres||[]).includes(prefs.tvGenre));
  const recent=new Map((state.metadata.stage33?.recentTv||[]).map((entry,index)=>[entry.showId,index]));shows.sort((a,b)=>prefs.tvSort==="rating"?Number(b.rating||0)-Number(a.rating||0)||a.title.localeCompare(b.title):prefs.tvSort==="progress"?progressFor(b).percent-progressFor(a).percent||a.title.localeCompare(b.title):prefs.tvSort==="recent"?(recent.get(a.id)??999)-(recent.get(b.id)??999)||a.title.localeCompare(b.title):a.title.localeCompare(b.title));const totalShows=shows.length,pages=Math.max(1,Math.ceil(totalShows/TV_PAGE_SIZE));tvPage=Math.min(tvPage,pages);const pageShows=shows.slice((tvPage-1)*TV_PAGE_SIZE,tvPage*TV_PAGE_SIZE),daily=dailyShows(4).filter(hasLocalTvContent),posterCount=library.filter(show=>artFor(show)).length,history=state.metadata.legacyTvHistory?.report,pending=state.metadata.driveReviewQueue?.filter(item=>item.status==="pending").length||0;
  const seriesCard=show=>{const art=artFor(show),coverage=coverageFor(show),hidden=hiddenCards.has(show.id);return`<article class="series-row"><button class="series-row__open" data-open-series="${show.id}"><i style="--h:${hue(show.title)}">${art?`<img src="${esc(art)}" alt="Poster for ${esc(show.title)}">`:esc(show.title.slice(0,1))}</i><span><b>${esc(show.title)}</b><small>${show.rating?`★ ${show.rating}/10 · `:""}${coverage.summary}</small></span><em class="coverage-badge ${coverage.tone}">${coverage.label}</em></button><div class="series-card-controls"><button class="series-favorite ${show.favorite?"on":""}" data-tv-favorite="${show.id}" title="Favorite">&#9733;</button>${hidden?`<button class="series-card-restore" data-tv-card-restore="${show.id}" title="Restore card">&#8634;</button>`:`<button class="series-card-remove" data-vault-remove="${show.id}" title="Remove card">&times;</button>`}</div></article>`};
  return`${tvSectionTabs("library")}<section class="tv-command-deck"><div class="tv-collection-console panel"><span class="eyebrow">OWNED FIRST // TELEVISION ARCHIVE</span><h2>YOUR TELEVISION COLLECTION</h2><div class="tv-archive-vitals"><span><b>${library.length}</b>LIBRARY</span><span><b>${posterCount}</b>POSTERS</span><span class="ready"><i></i><b>LIBRARY</b>READY</span></div>${history?`<small>${history.matched} WATCHED EPISODES RECOVERED</small>`:""}</div><section class="tv-daily panel"><div class="tv-continue-heading"><b>CONTINUE WATCHING</b><span>${daily.filter(show=>isPlayable(nextFor(show))).length} READY TO PLAY</span></div>${daily.length?`<div class="daily-tv-strip">${daily.map(show=>{const next=nextFor(show),progress=progressFor(show),art=artFor(show);return`<article class="daily-tv-card"><button class="daily-tv-card__open" data-open-series="${show.id}"><i>${art?`<img src="${esc(art)}" alt="">`:esc(show.title.slice(0,2))}</i><span><b>${esc(show.title)}</b><small>${episodeCode(next)} · ${progress.percent}% WATCHED</small><em><i style="width:${progress.percent}%"></i></em></span></button><div class="daily-tv-card__actions"><button data-open-series="${show.id}">SERIES</button>${isPlayable(next)?`<button class="play" data-living-play data-show-id="${show.id}" data-episode-id="${next.id}" data-media-path="${esc(next.sourcePath)}">▶ PLAY</button>`:""}</div></article>`}).join("")}</div>`:`<p class="muted">Your shelf is ready.</p>`}</section></section><section class="tv-browser panel"><div class="tv-filter-row">${[["all","ALL"],["in_progress","WATCHING"],["favorites","FAVORITES"],["owned","OWNED"],["completed","COMPLETE"],...(hiddenCount?[["hidden",`HIDDEN ${hiddenCount}`]]:[])].map(([value,label])=>`<button class="button ${prefs.tvScope===value?"primary":""}" data-tv-filter="scope" data-tv-value="${value}">${label}</button>`).join("")}</div><div class="tv-select-row"><label class="tv-search-field">SEARCH<input data-wing-search type="search" value="${esc(search)}" placeholder="TITLE OR GENRE" autocomplete="off" aria-label="Search television series"></label><label>GENRE<select data-tv-select="genre"><option value="all">ALL GENRES</option>${genres.map(genre=>`<option value="${esc(genre)}" ${prefs.tvGenre===genre?"selected":""}>${esc(genre)}</option>`).join("")}</select></label><label>SORT<select data-tv-select="sort"><option value="title" ${prefs.tvSort==="title"?"selected":""}>TITLE</option><option value="recent" ${prefs.tvSort==="recent"?"selected":""}>RECENTLY OPENED</option><option value="progress" ${prefs.tvSort==="progress"?"selected":""}>PROGRESS</option><option value="rating" ${prefs.tvSort==="rating"?"selected":""}>RATING</option></select></label><span>${totalShows} MATCHES</span><button class="button" data-tv-reset>RESET</button></div></section>${shows.length?`<section class="tv-poster-wall panel"><header><h2>${prefs.tvScope==="hidden"?"HIDDEN CARDS":"OWNED COLLECTION"}</h2><span>${totalShows} SERIES · SCROLL TO BROWSE</span></header><div class="series-row-list">${pageShows.map(seriesCard).join("")}</div></section>`:`<div class="panel empty"><b>NO SERIES MATCH THIS SHELF.</b>Reset the filters or try another search.</div>`}${pages>1?`<nav class="library-pager"><button class="button" data-tv-page="${tvPage-1}" ${tvPage===1?"disabled":""}>PREVIOUS</button><span>PAGE ${tvPage} OF ${pages}</span><button class="button" data-tv-page="${tvPage+1}" ${tvPage===pages?"disabled":""}>NEXT</button></nav>`:""}<div class="tv-maintenance"><button class="button" data-drive-scan>SCAN A TV FOLDER</button><button class="button ${pending?"primary":""}" data-review-queue>OPTIONAL INTAKE ${pending||""}</button><span>Folder review is optional; DVD-rip extras are not an archive error.</span></div>`;
}

export function renderTvRecommendationsPage(){return`${tvSectionTabs("recommendations")}<section class="tv-recommendations-empty panel"><span class="eyebrow">FRESH START // NOTHING CARRIED OVER</span><h2>TELEVISION RECOMMENDATIONS</h2><p>The previous recommendations were removed. This shelf will remain empty until new recommendations are deliberately generated from your owned library and viewing activity.</p><div><b>0</b><span>ACTIVE RECOMMENDATIONS</span></div></section>`}

export function renderTvGenresPage(search=""){const state=getState(),query=search.trim().toLowerCase(),library=allTv(state).filter(hasLocalTvContent),groups=new Map();for(const show of library){for(const genre of(show.genres?.length?show.genres:["Unfiled Television"])){if(!groups.has(genre))groups.set(genre,[]);groups.get(genre).push(show)}}const entries=[...groups.entries()].filter(([genre,shows])=>!query||genre.toLowerCase().includes(query)||shows.some(show=>show.title.toLowerCase().includes(query))).sort(([a],[b])=>a.localeCompare(b));return`${tvSectionTabs("genres")}<section class="tv-genre-directory-head panel"><span class="eyebrow">OWNED LIBRARY // MULTI-GENRE DIRECTORY</span><h2>TELEVISION GENRES</h2><p>Every genre comes from a series in your actual library. Shows can appear in more than one genre.</p><div><b>${entries.length}</b><span>GENRES</span><b>${library.length}</b><span>SERIES</span></div></section><section class="tv-genre-directory">${entries.map(([genre,shows])=>`<button data-tv-genre-open="${esc(genre)}"><span><b>${esc(genre)}</b><small>${shows.slice(0,4).map(show=>esc(show.title)).join(" · ")}</small></span><em>${shows.length}</em></button>`).join("")||`<div class="panel empty"><b>NO GENRES MATCH.</b>Try another search.</div>`}</section>`}
export function renderSeriesPage(showId){
  const show=getState().items[showId];if(!show)return`<div class="empty">RECORD NOT FOUND</div>`;
  const progress=progressFor(show),coverage=coverageFor(show),seasons=progress.episodes.reduce((out,episode)=>((out[episode.season]||=[]).push(episode),out),{}),linked=progress.episodes.filter(episode=>episode.sourcePath).length,next=nextFor(show),art=artFor(show);
  return `<button class="tv-back" data-tv-back>&larr; TV SHELVES</button><section class="series-header panel"><div class="series-cover" style="--h:${hue(show.title)}">${art?`<img src="${esc(art)}" alt="Poster for ${esc(show.title)}">`:esc(show.title.slice(0,2))}</div><div class="series-header__copy"><span class="eyebrow">${show.owned?"IN YOUR COLLECTION":"DISCOVERY RECORD"} // ${esc(show.genres?.join(" · ")||"TV")}</span><div class="series-title-row"><h2>${esc(show.title)}</h2><button class="series-favorite large ${show.favorite?"on":""}" data-tv-favorite="${show.id}" aria-label="${show.favorite?"Remove from":"Add to"} favorites">&#9733;</button></div><div class="episode-rating series-rating" aria-label="Series rating out of ten">${Array.from({length:10},(_,index)=>`<button data-tv-rating="${index+1}" data-show-id="${show.id}" class="${Number(show.rating||0)>=index+1?"on":""}" title="Rate ${index+1} out of 10" aria-label="Rate ${index+1} out of 10">◆</button>`).join("")}<small>${show.rating?`${show.rating}/10`:"NOT RATED"}</small></div><div class="series-coverage"><span><b>${coverage.local}</b>CATALOGED</span><span><b>${coverage.total}</b>REFERENCE TOTAL</span><span><b>${coverage.missing??"—"}</b>NOT CATALOGED</span><span><b>${coverage.playable}</b>DIRECT PLAY</span><em class="coverage-badge ${coverage.tone}">${coverage.label}</em></div><p>${progress.done}/${progress.total} EPISODES WATCHED</p>${next?`<div class="next-episode"><span>NEXT EPISODE</span><b>${episodeCode(next)}</b><small>${next.title?esc(next.title):"Episode record ready"}</small><button class="button primary" data-quick-episode="${next.id}" data-show-id="${show.id}">MARK WATCHED</button></div>`:`<div class="next-episode complete"><span>SERIES STATUS</span><b>COMPLETE</b><small>Every cataloged episode is archived.</small></div>`}<p class="series-file-note">Catalog coverage compares episode records with the reference series list. Direct play is separate; unmapped DVD rips are intentionally left alone.</p></div></section>
  <section class="season-poster-wall panel"><header><h3>SEASONS</h3><span>SELECT A CARD FOR EPISODES · CHANGE ART ONLY USES ITS SMALL BAR</span></header><div class="season-poster-grid">${Object.entries(seasons).sort(([a],[b])=>Number(a)-Number(b)).map(([season,list])=>{const seasonArt=artForSeason(show,season),watched=list.filter(episode=>episode.status==="completed").length,playable=list.filter(isPlayable).length,percent=list.length?Math.round(watched/list.length*100):0;return`<article class="season-poster-card"><button class="season-poster-details" data-open-season="${season}" data-show-id="${show.id}"><i style="--h:${hue(show.title+season)}">${seasonArt?`<img src="${esc(seasonArt)}" alt="Season ${esc(season)} artwork for ${esc(show.title)}">`:esc(show.title.slice(0,2))}</i><span><b>${Number(season)===0?"SPECIALS":`SEASON ${String(season).padStart(2,"0")}`}</b><small>${watched}/${list.length} WATCHED · ${playable} PLAYABLE</small><em><i style="width:${percent}%"></i></em></span></button><button class="season-poster-art" data-tv-season-art-pick="${season}" data-show-id="${show.id}" title="Choose Season ${esc(season)} artwork"><em>CHANGE ART</em></button></article>`}).join("")}</div></section>`;
}

function artForSeason(show,season){
  const number=String(Number(season)),padded=number.padStart(2,"0");
  const seasonRecord=show.seasons?.[number]||show.seasons?.[padded]||show.seasons?.find?.(entry=>Number(entry?.season??entry?.number)===Number(season));
  const candidate=show.seasonArtwork?.[number]||show.seasonArtwork?.[padded]||show.artworkBySeason?.[number]||show.artworkBySeason?.[padded]||seasonRecord?.artwork||seasonRecord?.poster||seasonRecord?.image;
  return typeof candidate==="string"?candidate:candidate?.localPath||candidate?.url||artFor(show);
}

export async function findAllTvSeasonArtwork(showId){
  const show=getState().items[showId];if(!show)return{saved:0,failed:0,total:0};
  const seasons=[...new Set(Object.values(show.episodes||makeEpisodes(show)).map(episode=>Number(episode.season)).filter(Number.isFinite))].sort((a,b)=>a-b),results=[];
  let styleSource="",styleName="";
  for(const season of seasons){try{const response=await fetch("./__vault/tv/season-artwork",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"tv-season-artwork"},body:JSON.stringify({itemId:show.id,title:show.title,season,styleSource,styleName})});if(!response.ok){results.push({season,queued:false});continue}const payload=await response.json();styleSource||=payload.sourceUrl||"";styleName||=payload.sourceName||"";const approvalId=queueArtworkApproval({kind:"tv_season",itemId:showId,target:String(season),key:`tv_season:${showId}:${season}`,title:`${show.title} · Season ${season}`,subtitle:"Season poster candidate",path:payload.path,sourceName:payload.sourceName||"Season artwork source",sourceUrl:payload.sourceUrl||""});results.push({season,queued:Boolean(approvalId)})}catch{results.push({season,queued:false})}}
  return{saved:results.filter(result=>result.queued).length,queued:results.filter(result=>result.queued).length,failed:results.filter(result=>!result.queued).length,total:seasons.length};
}

export async function openTvSeasonArtworkPicker(showId,season,onChanged=()=>{}){
  const show=getState().items[showId];season=Number(season);if(!show||!Number.isFinite(season))return false;
  openModal({title:`${show.title} · SEASON ${season} ART`,body:`<div class="vault-ai-progress"><span class="eyebrow">OFFICIAL / LICENSED ARTWORK // NOTHING CHANGES YET</span><h3>FINDING SEASON POSTER OPTIONS…</h3><div class="vault-ai-progress__bar"><i></i></div><p>Verifying that every candidate belongs to this exact season.</p></div>`});
  try{
    const response=await fetch("./__vault/tv/season-artwork-options",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"tv-season-artwork-options"},body:JSON.stringify({itemId:show.id,title:show.title,season})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error("Season artwork choices could not be loaded right now.");const options=payload.options||[];
    if(!options.length){openModal({title:"NO EXACT SEASON ART FOUND",body:"<p>The current season poster was kept. The Vault did not find a confident exact-season option.</p>",actions:[{label:"CLOSE",primary:true,handler:()=>closeModal()}]});return false}
    openModal({title:`CHOOSE ${show.title.toUpperCase()} · SEASON ${season}`,body:`<div class="tv-season-art-options">${options.map((option,index)=>`<article><button data-tv-season-art-choice="${index}"><img src="${esc(option.path)}" alt="Season ${season} poster option ${index+1}"><span><b>OPTION ${index+1}</b><small>${esc(option.label||`Season ${season} poster`)}</small><em>${esc(option.sourceName||"Licensed source")}</em></span></button>${/^https:\/\//i.test(option.sourceUrl||"")?`<a href="${esc(option.sourceUrl)}" target="_blank" rel="noreferrer">VERIFY SOURCE ↗</a>`:""}</article>`).join("")}</div><p class="muted">Choosing an option is the approval step. Episode records and watch progress are untouched.</p>`,actions:[{label:"KEEP CURRENT POSTER",primary:true,handler:()=>closeModal()}]});
    const root=document.querySelector("#modal-root .modal__body");root.onclick=event=>{const button=event.target.closest("[data-tv-season-art-choice]");if(!button)return;const option=options[Number(button.dataset.tvSeasonArtChoice)];if(!option)return;update(save=>{const target=save.items[showId];if(!target)return;target.seasonArtwork||={};target.seasonArtwork[String(season)]=option.path;target.seasonArtworkSources||={};target.seasonArtworkSources[String(season)]={name:option.sourceName||"Licensed source",url:option.sourceUrl||"",approvedAt:new Date().toISOString()}});closeModal();onChanged();toast("SEASON POSTER APPROVED",`${show.title} · Season ${season}`)};return true;
  }catch(error){openModal({title:"SEASON ART SEARCH PAUSED",body:`<p>${esc(error.message)}</p><p>The current poster was not changed.</p>`,actions:[{label:"CLOSE",primary:true,handler:()=>closeModal()}]});return false}
}

export async function findAllOwnedTvSeasonArtwork({onProgress=()=>{},control=null}={}){const shows=allTv().filter(show=>show.owned),results=[];for(let index=0;index<shows.length;index++){await (control||globalThis.__vaultActiveJobControl)?.checkpoint?.();const result=await findAllTvSeasonArtwork(shows[index].id);results.push({showId:shows[index].id,...result});onProgress({processed:index+1,total:shows.length,title:shows[index].title,saved:results.reduce((sum,entry)=>sum+entry.saved,0),failed:results.reduce((sum,entry)=>sum+entry.failed,0)})}return{shows:shows.length,saved:results.reduce((sum,entry)=>sum+entry.saved,0),failed:results.reduce((sum,entry)=>sum+entry.failed,0),results}}

export function renderSeasonPage(showId,seasonNumber){
  const state=getState(),show=state.items[showId];if(!show)return`<div class="empty">RECORD NOT FOUND</div>`;
  const season=Number(seasonNumber),prefs=tvPrefs(state),direction=prefs.tvEpisodeOrder==="asc"?1:-1,progress=progressFor(show),list=progress.episodes.filter(episode=>Number(episode.season)===season).sort((a,b)=>(Number(a.number)-Number(b.number))*direction),next=nextFor(show),art=artForSeason(show,season),watched=list.filter(episode=>episode.status==="completed").length,playable=list.filter(isPlayable).length;
  if(!list.length)return`<button class="tv-back" data-open-series="${show.id}">&larr; ${esc(show.title)}</button><div class="empty">SEASON RECORD NOT FOUND</div>`;
  return `<button class="tv-back" data-open-series="${show.id}">&larr; ${esc(show.title)}</button><section class="season-file-header panel"><div class="season-file-cover" style="--h:${hue(show.title+season)}">${art?`<img src="${esc(art)}" alt="Season ${season} artwork for ${esc(show.title)}">`:esc(show.title.slice(0,2))}</div><div><span class="eyebrow">${esc(show.title)} // SEASON FILE</span><h2>${Number(season)===0?"SPECIALS":`SEASON ${String(season).padStart(2,"0")}`}</h2><p>${watched}/${list.length} WATCHED · ${playable} LOCAL EPISODES</p><div class="season-watch-actions"><button class="button primary" data-tv-season-watched="true" data-show-id="${show.id}" data-season="${season}">MARK SEASON WATCHED</button><button class="button" data-tv-season-watched="false" data-show-id="${show.id}" data-season="${season}">MARK SEASON UNWATCHED</button></div></div></section><section class="season-card panel"><header><h3>EPISODES</h3><label class="episode-list__order">ORDER <select data-tv-select="episodeOrder"><option value="desc" ${direction===-1?"selected":""}>NEWEST FIRST</option><option value="asc" ${direction===1?"selected":""}>OLDEST FIRST</option></select></label><span>${list.length} CATALOGED</span></header><div class="episode-list">${list.map(episode=>{const inProgress=episode.status!=="completed"&&Number(episode.playbackSeconds||0)>0,missing=Boolean(episode.sourcePath)&&episode.linkStatus==="missing",playable=isPlayable(episode),state=episode.status==="completed"?"watched":inProgress?"in-progress":"unwatched",status=missing?"FILE MISSING":episode.status==="completed"?"WATCHED":inProgress?"IN PROGRESS":playable?"PLAY":"CATALOGED",facts=[episode.airDate,episode.runtimeMinutes?`${episode.runtimeMinutes} MIN`:""].filter(Boolean).join(" · "),main=playable?`<button class="episode-list__main ${state}" data-show-id="${show.id}" data-episode-id="${episode.id}" title="Play with VLC">`:`<button class="episode-list__main ${state}${missing?" missing":""}" data-edit-episode="${episode.id}" data-show-id="${show.id}" title="${missing?"The file for this episode is no longer on this computer":"Open episode record"}">`;return`<article class="episode-list__row ${next?.id===episode.id?"is-next":""}">${main}<span class="episode-list__number">E${String(episode.number).padStart(2,"0")}</span><span class="episode-list__copy"><b>${esc(episode.title||`Episode ${episode.number}`)}</b><small>${esc(facts||"EPISODE METADATA PENDING")}</small>${episode.description?`<em>${esc(episode.description)}</em>`:""}</span><strong>${status}</strong></button><button class="episode-list__rate" data-edit-episode="${episode.id}" data-show-id="${show.id}" title="Rate episode">${episode.rating?`${episode.rating}/10`:"RATE"}</button>${episode.sourcePath?"":`<span class="episode-list__ownership" title="Not locally owned" aria-label="Not locally owned">×</span>`}</article>`}).join("")}</div></section>`;
}
export function renderReviewQueue(){
  const state=getState(),queue=getReviewQueue(),stats=getReviewQueueStats();
  const pending=queue.filter(item=>item.status==="pending"),driveQueue=state.metadata.driveReviewQueue||[];
  const categories=[
    {kind:"semantic_conflict",title:"ORIGINAL VS SCANNER",note:"The old Vault and filename scan disagree. Original is the safe default."},
    {kind:"scanner_only_episode",title:"NEW EPISODE LINKS",note:"Files found by the scan that were never mapped by the old Vault."},
    {kind:"file_group",title:"UNRESOLVED FILE GROUPS",note:"Series mismatches, extras, specials, and filenames that need a human look."}
  ];
  const episodeTitle=item=>{const p=item.payload||{},show=state.items[p.showId];return show?`${show.title.replace(/\s*▸\s*$/,"")} · S${String(p.season).padStart(2,"0")}E${String(p.episode).padStart(2,"0")}`:item.title};
  const actions=item=>item.kind==="semantic_conflict"?`<button class="button primary" data-recovery-action="keep_original" data-recovery-id="${item.id}">KEEP ORIGINAL</button><button class="button" data-recovery-action="use_scanner" data-recovery-id="${item.id}">USE SCAN</button>`:item.kind==="scanner_only_episode"?`<button class="button primary" data-recovery-action="link_scanner" data-recovery-id="${item.id}">LINK FILE</button>`:`<button class="button" data-recovery-action="defer" data-recovery-id="${item.id}">DEFER GROUP</button>`;
  const card=item=>{const p=item.payload||{},paths=item.kind==="semantic_conflict"?`<small>ORIGINAL · ${esc(p.legacyPath)}</small><small>SCAN · ${esc(p.scannerPath)}</small>`:item.kind==="scanner_only_episode"?`<small>${esc(p.scannerPath)}</small>`:`<small>${p.count} FILES · ${esc((p.samplePaths||[])[0]||"")}</small>`;return`<article class="review-record"><div class="review-record__copy"><b>${esc(item.kind==="file_group"?item.title:episodeTitle(item))}</b><p>${esc(item.reason.replaceAll("_"," "))}</p>${paths}</div><div class="review-record__actions">${actions(item)}<button class="button" data-recovery-action="reject" data-recovery-id="${item.id}">IGNORE</button></div></article>`};
  return`<button class="tv-back" data-tv-back>← TV CATEGORIES</button>
  <section class="review-command panel"><div><span class="eyebrow">STAGE 1 // CONTROLLED INTAKE</span><h2>RECOVERY REVIEW</h2><p>Nothing here changes the archive until you choose an action.</p></div><div class="review-vitals"><b>${stats.pending}</b><span>PENDING DECISIONS</span></div></section>
  <div class="review-summary-grid"><div class="panel"><b>${stats.semanticConflicts}</b><span>PATH CONFLICTS</span></div><div class="panel"><b>${stats.scannerOnlyEpisodes}</b><span>NEW LINKS</span></div><div class="panel"><b>${stats.fileGroups}</b><span>FILE GROUPS</span></div><div class="panel"><b>${stats.representedFiles}</b><span>FILES REPRESENTED</span></div></div>
  <div class="review-category-list">${categories.map(category=>{const items=pending.filter(item=>item.kind===category.kind),visible=items.slice(0,40);return`<details class="review-category panel" ${category.kind==="semantic_conflict"?"open":""}><summary><span><b>${category.title}</b><small>${category.note}</small></span><em>${items.length}</em></summary><div class="review-record-list">${visible.map(card).join("")||`<div class="empty"><b>SECTION CLEARED</b>No pending decisions in this drawer.</div>`}${items.length>visible.length?`<div class="review-more">${items.length-visible.length} MORE · DECIDE OR IGNORE ITEMS ABOVE TO ADVANCE THE QUEUE</div>`:""}</div></details>`}).join("")}</div>
  ${driveQueue.length?`<details class="review-category panel"><summary><span><b>INTERACTIVE FOLDER SCANS</b><small>Results created from the browser folder picker.</small></span><em>${driveQueue.filter(item=>item.status==="pending").length}</em></summary><div class="review-record-list">${driveQueue.map(item=>`<article class="review-record"><div class="review-record__copy"><b>${esc(item.title)}</b><small>${item.files.length} FILES · ${esc(pathFor(item.files[0]||{}))}</small></div>${item.status==="pending"?`<div class="review-record__actions"><button class="button primary" data-review-accept="${item.id}">ACCEPT</button><button class="button" data-review-reject="${item.id}">IGNORE</button></div>`:`<b>${item.status.toUpperCase()}</b>`}</article>`).join("")}</div></details>`:""}`;
}
