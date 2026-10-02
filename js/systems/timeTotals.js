import { getState } from "../core/store.js";

const number=value=>Math.max(0,Number(value||0));
const itemsFor=(state,wing)=>Object.values(state.items||{}).filter(item=>item.wing===wing);
const formatSeconds=value=>{const minutes=Math.floor(number(value)/60),hours=Math.floor(minutes/60),rest=minutes%60;return hours?`${hours.toLocaleString()}H ${rest}M`:`${minutes}M`};

export function getWingTimeTotal(wing,state=getState()){
  if(wing==="tv"){const seconds=itemsFor(state,"tv").flatMap(item=>Object.values(item.episodes||{})).reduce((sum,episode)=>sum+number(episode.totalWatchSeconds),0);return{seconds,label:"RECORDED WATCH TIME",basis:"ACTUAL PLAYER SESSIONS"}}
  if(wing==="music"){const seconds=itemsFor(state,"music").reduce((sum,item)=>sum+number(item.musicMeta?.millisecondsPlayed)/1000,0);return{seconds,label:"LISTENING TIME",basis:"SPOTIFY HISTORY + IMPORTS"}}
  if(wing==="youtube"){const history=state.metadata.youtube?.history||[],seconds=history.reduce((sum,entry)=>sum+number(entry.watchSeconds||entry.durationSeconds),0),unknown=history.filter(entry=>!number(entry.watchSeconds||entry.durationSeconds)).length;return{seconds,label:"KNOWN / ESTIMATED WATCH TIME",basis:unknown?`YOUTUBE HISTORY · ${unknown} VIDEOS STILL HAVE UNKNOWN LENGTH`:"YOUTUBE HISTORY + KNOWN VIDEO DURATIONS"}}
  if(wing==="movies"){const profile=state.preferences.dailyDriver?.movieProfile||"you",seconds=itemsFor(state,"movies").reduce((sum,item)=>{const saved=item.movieMeta?.profiles?.[profile];return sum+number(profile==="you"?(saved?.watchSeconds??item.watchSeconds):saved?.watchSeconds)},0);return{seconds,label:"RECORDED WATCH TIME",basis:`${profile.toUpperCase()} · ACTUAL VAULT PLAYER SESSIONS`}}
  if(wing==="books"){const seconds=itemsFor(state,"books").reduce((sum,item)=>sum+(number(item.bookMeta?.totalReadingMinutes)+number(item.bookMeta?.totalListeningMinutes))*60,0);return{seconds,label:"READING + LISTENING",basis:"VAULT READER + MANUAL SESSIONS"}}
  if(wing==="manga"){const seconds=itemsFor(state,"manga").reduce((sum,item)=>sum+number(item.comicMeta?.totalReadingMinutes)*60,0);return{seconds,label:"READING TIME",basis:"VAULT READER SESSIONS"}}
  if(wing==="podcasts"){const seconds=itemsFor(state,"podcasts").reduce((sum,item)=>{const m=item.podcastMeta||{},history=number(m.spotifyHistoryListeningSeconds),manual=number(m.manualListeningSeconds||(!history?m.totalListeningSeconds:0));return sum+history+manual},0);return{seconds,label:"LISTENING TIME",basis:"SPOTIFY HISTORY + RECORDED PODCAST SESSIONS"}}
  return null;
}

export function renderWingTimeTotal(wing,state=getState()){const total=getWingTimeTotal(wing,state);if(!total)return"";return`<div class="wing-time-total"><span><b>${formatSeconds(total.seconds)}</b>${total.label}</span><small>${total.basis} · UPDATES WITH EACH SAVED ACTIVITY</small></div>`}
