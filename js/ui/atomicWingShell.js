import { getAdaptiveEditorialStatus, getRecommendationReadiness } from "../systems/adaptiveEditorial.js";
import { wings } from "./navigation.js?v=20260913-life-v1";

const navButton=(active,wing)=>`<button class="${active===wing.id?"active":""}${wing.reserved?" reserved":""}" data-route="${wing.id}"${wing.reserved?' title="Room reserved — not designed yet"':""}><span>${wing.icon}</span>${wing.label}</button>`;
const bank=(active,group)=>{const entries=wings.filter(wing=>wing.group===group);return{entries,markup:entries.map(wing=>navButton(active,wing)).join("")}};

export function renderAtomicWingShell({active,title,section="ARCHIVE",content,footer="LOCAL ARCHIVE"}){
  const uiScale=document.body.dataset.uiScale||"115",now=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  const aiStatus=getAdaptiveEditorialStatus(),aiReady=getRecommendationReadiness().enabled;
  return `<div class="atomic-home atomic-wing atomic-wing--${active}">
    <aside class="atomic-rail" aria-label="Primary Vault rooms">
      <button class="atomic-brand" data-route="home"><span>V</span><b>THE VAULT</b><small>LIFE ARCHIVE</small></button>
      <nav class="atomic-room-banks">
        ${["MAIN","LIBRARY","LIFE"].map(group=>{const {entries,markup}=bank(active,group);const open=group!=="LIFE"||entries.some(wing=>wing.id===active);return`<details class="atomic-nav-bank" ${open?"open":""}><summary><span>${group}</span><b>${String(entries.length).padStart(2,"0")}</b></summary><div>${markup}</div></details>`}).join("")}
      </nav>
      <div class="atomic-rail__speaker" aria-hidden="true"></div>
      <details class="atomic-utility"><summary>⚒ UTILITY</summary><div>${bank(active,"UTILITY").markup}<button data-command>ALL COMMANDS</button></div></details>
    </aside>
    <main class="atomic-console atomic-wing-console">
      <header class="atomic-statusbar"><span>${title}</span><b>${section}</b><div><span class="atomic-online"><i></i>ARCHIVE ONLINE</span><button class="atomic-editorial-refresh" data-adaptive-refresh data-ai-wing="${active}">${aiStatus==="loading"?"AI LINKING":aiReady?"AI EDIT":"AI READY"}</button><div class="atomic-scale" aria-label="Interface scale"><button data-ui-scale="-1" aria-label="Make interface smaller" ${uiScale==="90"?"disabled":""}>A-</button><b>${uiScale}%</b><button data-ui-scale="1" aria-label="Make interface larger" ${uiScale==="170"?"disabled":""}>A+</button></div><time>${now}</time></div></header>
      <div class="atomic-wing-screen">${content}</div>
      <footer class="atomic-wing-footer"><span><i></i>${aiReady?"AI EDITORIAL CONNECTED":"AI FOUNDATION READY"}</span><b>${footer}</b><button data-route="home">RETURN HOME</button></footer>
    </main>
  </div>`;
}
