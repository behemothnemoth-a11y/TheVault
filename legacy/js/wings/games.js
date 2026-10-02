import { getState } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

const PLAYABLE=[
  ["collection_legacy_gam_on_the_drive_steamlibrary","READY ON THE DRIVE","owned"],
  ["collection_legacy_gam_builder_brain_recs","BUILDER BRAIN","builder"],
  ["collection_legacy_gam_horror_night_recs","HORROR NIGHT","horror"],
  ["collection_legacy_gam_one_more_run_recs","ONE MORE RUN","run"],
  ["collection_legacy_gam_retro_canon_3d_era","RETRO CANON · 3D","retro3d"],
  ["collection_legacy_gam_retro_canon_8_16_bit","RETRO CANON · 8/16-BIT","retro"]
].map(([id,label,tone])=>({id,label,tone}));
const WORKSHOP=[
  ["collection_legacy_gam_build_projects","BUILD PROJECTS"],
  ["collection_legacy_gam_mod_watch_26_1_2_26_2","MOD BLOCKERS"],
  ["collection_legacy_gam_mod_watch_ready_for_26_2","READY MODS"],
  ["collection_legacy_gam_mod_watch_unknown_monday_s_homework","MOD RESEARCH"]
].map(([id,label])=>({id,label}));
const CREATIVE="collection_legacy_gam_make_something";
const view={filter:"all",shelf:"all"};
const ids=(state,id)=>state.collections?.[id]?.itemIds||[];
const records=(state,groups)=>[...new Map(groups.flatMap(group=>ids(state,group)).map(id=>state.items[id]).filter(Boolean).map(item=>[item.id,item])).values()];
const shelf=(state,itemId)=>PLAYABLE.find(group=>ids(state,group.id).includes(itemId))||{label:"UNFILED",tone:"unfiled"};
const artwork=item=>typeof item.artwork==="string"?item.artwork:item.artwork?.localPath||item.artwork?.url||"";

function score(item,state){
  const prefs=state.metadata?.lifeDashboard?.preferences||{}, group=shelf(state,item.id), minutes=Number(prefs.timeAvailable||60), energy=prefs.energy||"steady";
  let value=item.status==="in_progress"?60:0; value+=item.favorite?35:0; value+=Number(item.rating||0)*3;
  if(minutes<=30&&["run","retro"].includes(group.tone))value+=28;
  if(minutes>=90&&["builder","retro3d","horror"].includes(group.tone))value+=20;
  if(energy==="low"&&["owned","retro","run"].includes(group.tone))value+=18;
  if(energy==="high"&&["horror","builder"].includes(group.tone))value+=18;
  return value+[...item.id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%13;
}
function cover(item,state){
  const art=artwork(item),initials=item.title.split(/\s+/).slice(0,2).map(word=>word[0]).join("").toUpperCase();
  return `<i class="games-cover games-cover--${esc(shelf(state,item.id).tone)}">${art?`<img src="${esc(art)}" alt="Artwork for ${esc(item.title)}">`:`<b>${esc(initials)}</b>`}</i>`;
}
function card(item,state,kind="library"){
  const group=shelf(state,item.id),prefs=state.metadata?.lifeDashboard?.preferences||{},next=item.status==="in_progress"?"completed":"in_progress",action=item.status==="in_progress"?"FINISH":item.status==="completed"?"PLAY AGAIN":"START PLAYING";
  return `<article class="games-card" data-game-card-kind="${kind}" data-game-id="${esc(item.id)}">${cover(item,state)}<div class="games-card__body"><span class="eyebrow">${esc(group.label)}</span><h3>${esc(item.title)}</h3><div class="games-card__meta"><span>${esc((item.status||"backlog").replace("_"," ").toUpperCase())}</span>${item.year?`<span>${esc(item.year)}</span>`:""}${item.owned?"<span>OWNED</span>":""}</div><p>${kind==="fit"?`${Number(prefs.timeAvailable||60)} minutes · ${esc(prefs.energy||"steady")} energy. Already in your library.`:esc(item.description||item.note||"Ready for a proper game record.")}</p><div class="games-card__actions"><button class="button" data-route="record/${encodeURIComponent(item.id)}">OPEN</button><button class="button ${item.status==="in_progress"?"primary":""}" data-record-status="${next}" data-record-id="${esc(item.id)}">${action}</button><button class="games-favorite ${item.favorite?"active":""}" data-record-favorite="${esc(item.id)}">${item.favorite?"★":"☆"}</button></div></div></article>`;
}
function compact(group,state){
  const items=records(state,[group.id]);
  return `<section class="games-workshop-group"><header><h3>${group.label}</h3><span>${items.length}</span></header><div>${items.map(item=>`<button data-route="record/${encodeURIComponent(item.id)}"><b>${esc(item.title)}</b><small>${esc((item.status||"backlog").replace("_"," ").toUpperCase())}</small></button>`).join("")}</div></section>`;
}

export function setGamesView(type,value){
  if(type==="filter"&&["all","owned","backlog","in_progress","completed"].includes(value))view.filter=value;
  if(type==="shelf"&&(value==="all"||PLAYABLE.some(group=>group.id===value)))view.shelf=value;
}
export function getGamesModel(search="",state=getState()){
  const playable=records(state,PLAYABLE.map(group=>group.id)),workshop=records(state,WORKSHOP.map(group=>group.id)),creative=records(state,[CREATIVE]);
  const owned=records(state,[PLAYABLE[0].id]),ownedIds=new Set(owned.map(item=>item.id)),q=search.trim().toLowerCase();
  let visible=playable.filter(item=>!q||`${item.title} ${item.description||""} ${shelf(state,item.id).label}`.toLowerCase().includes(q));
  if(view.filter==="owned")visible=visible.filter(item=>ownedIds.has(item.id));else if(view.filter!=="all")visible=visible.filter(item=>item.status===view.filter);
  if(view.shelf!=="all")visible=visible.filter(item=>ids(state,view.shelf).includes(item.id));
  visible.sort((a,b)=>a.title.localeCompare(b.title));
  const used=new Set([...playable,...workshop,...creative].map(item=>item.id));
  return{playable,workshop,creative,owned,visible,unfiled:Object.values(state.items).filter(item=>item.wing==="games"&&!used.has(item.id)),fit:[...owned].sort((a,b)=>score(b,state)-score(a,state)).slice(0,3),suggestions:playable.filter(item=>!ownedIds.has(item.id)).sort((a,b)=>score(b,state)-score(a,state)).slice(0,4),prefs:state.metadata?.lifeDashboard?.preferences||{},view:{...view}};
}
export function renderGamesWing(search=""){
  const state=getState(),m=getGamesModel(search,state),p=m.prefs;
  return `<div class="games-wing" data-games-count="${m.playable.length}" data-games-owned="${m.owned.length}" data-games-workshop="${m.workshop.length}" data-games-creative="${m.creative.length}">
  <section class="games-hero"><div><span class="eyebrow">THE VAULT // PLAYABLE LIBRARY</span><h2>WHAT DO YOU WANT TO PLAY?</h2><p>Your actual games are now separate from Minecraft maintenance and creative projects. Owned titles lead; recommendations never pretend you own something.</p><div class="games-hero__stats"><span><b>${m.owned.length}</b> READY ON DRIVE</span><span><b>${m.playable.length}</b> ACTUAL GAMES</span><span><b>${m.playable.filter(item=>item.status==="in_progress").length}</b> IN PROGRESS</span></div></div><div class="games-hero__mark">+</div></section>
  <section class="panel games-session"><div><span class="eyebrow">FIT THIS SESSION</span><h2>${Number(p.timeAvailable||60)} MINUTES · ${esc(String(p.energy||"steady").toUpperCase())} ENERGY</h2><p>Shared with your life dashboard, so Games uses the same “right now” context.</p></div><div class="games-session__controls"><div><span>TIME</span>${[[30,"30M"],[60,"1H"],[120,"2H+"]].map(([v,l])=>`<button class="button ${Number(p.timeAvailable)===v?"primary":""}" data-life-pref="timeAvailable" data-life-value="${v}">${l}</button>`).join("")}</div><div><span>ENERGY</span>${["low","steady","high"].map(v=>`<button class="button ${p.energy===v?"primary":""}" data-life-pref="energy" data-life-value="${v}">${v.toUpperCase()}</button>`).join("")}</div></div></section>
  <section class="games-section"><div class="games-section__head"><div><span class="eyebrow">OWNED FIRST</span><h2>WHAT FITS NOW</h2></div><small>ONLY TITLES ALREADY ON YOUR DRIVE</small></div><div class="games-grid games-grid--featured">${m.fit.map(item=>card(item,state,"fit")).join("")}</div></section>
  <section class="games-section games-discovery"><div class="games-section__head"><div><span class="eyebrow">CONSIDER, NOT OWNED</span><h2>WORTH ADDING NEXT</h2></div><small>FROM YOUR OLD CURATED SHELVES</small></div><div class="games-grid games-grid--discovery">${m.suggestions.map(item=>card(item,state,"suggestion")).join("")}</div></section>
  <section class="panel games-library"><div class="games-section__head"><div><span class="eyebrow">PLAYABLE RECORDS</span><h2>THE GAME LIBRARY</h2></div><small>${m.visible.length} SHOWN</small></div><div class="games-filter-row"><div>${[["all","ALL"],["owned","OWNED"],["backlog","BACKLOG"],["in_progress","PLAYING"],["completed","FINISHED"]].map(([v,l])=>`<button class="button ${m.view.filter===v?"primary":""}" data-games-filter="${v}">${l}</button>`).join("")}</div><label>SHELF<select data-games-shelf><option value="all">ALL PLAYABLE SHELVES</option>${PLAYABLE.map(group=>`<option value="${group.id}" ${m.view.shelf===group.id?"selected":""}>${group.label} (${ids(state,group.id).length})</option>`).join("")}</select></label></div><div class="games-grid">${m.visible.map(item=>card(item,state)).join("")||"<div class=\"empty\"><b>NO GAMES MATCH.</b>Try another filter.</div>"}</div></section>
  <section class="games-secondary"><article class="panel games-workshop"><div class="games-section__head"><div><span class="eyebrow">MINECRAFT</span><h2>WORKSHOP</h2></div><small>${m.workshop.length} PROJECT & MOD RECORDS</small></div><p>Build plans and mod compatibility stay useful here without being recommended as playable games.</p>${WORKSHOP.map(group=>compact(group,state)).join("")}</article><article class="panel games-sidequests"><div class="games-section__head"><div><span class="eyebrow">CREATIVE LIFE</span><h2>SIDE QUESTS</h2></div><small>${m.creative.length}</small></div><p>Making projects stay visible without polluting your games.</p><div>${m.creative.map(item=>`<button data-route="record/${encodeURIComponent(item.id)}"><b>${esc(item.title)}</b><span>OPEN →</span></button>`).join("")}</div>${m.unfiled.length?`<small>${m.unfiled.length} unfiled records need review.</small>`:""}</article></section></div>`;
}
