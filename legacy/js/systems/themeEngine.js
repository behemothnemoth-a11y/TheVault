import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

const themes = [
  { id: "archive", title: "Restricted Archive", metaphor: "Accession files, amber paper, sealed records." },
  { id: "video_store", title: "Video Store", metaphor: "Rental-counter red, staff picks, tape-shelf warmth." },
  { id: "windows95", title: "Windows 95", metaphor: "Gray chrome, blue title bars, DECIDE_FOR_ME.EXE." },
  { id: "bunker", title: "Bunker Terminal", metaphor: "Monochrome clearance console and keyboard-first atmosphere." }
];

export function applyVaultEnvironment() {
  const preferences = getState().preferences || {};
  const theme = themes.some(entry => entry.id === preferences.theme) ? preferences.theme : "archive";
  const clearance = Math.max(0, Math.min(5, Number(preferences.spoilerClearance ?? 2)));
  document.body.dataset.theme = theme;
  document.body.dataset.clearance = String(clearance);
  const discovery = document.querySelector("#discovery-button");
  if (discovery) {
    discovery.textContent = theme === "video_store" ? "★" : theme === "windows95" ? "EXE" : theme === "bunker" ? "?" : "⚄";
    discovery.title = theme === "video_store" ? "Staff Pick" : theme === "windows95" ? "DECIDE_FOR_ME.EXE" : "Vault's Choice";
  }
  const subtitle = document.querySelector(".brand small");
  if (subtitle) subtitle.textContent = theme === "video_store" ? "VIDEO EMPORIUM" : theme === "windows95" ? "VAULT 95" : theme === "bunker" ? "TERMINAL ONLINE" : "RECONSTRUCTION";
}

export function renderEnvironmentRoom() {
  if (location.hash !== "#/environment") return;
  const state = getState();
  const active = state.preferences.theme || "archive";
  const clearance = Number(state.preferences.spoilerClearance ?? 2);
  document.querySelector("#view").innerHTML = `<section class="ops-hero panel"><span class="eyebrow">STAGE 15 // BEHAVIORAL ENVIRONMENTS</span><h2>ENVIRONMENT CONTROL</h2><p>Themes change language and interface metaphors, not only colors. Spoiler clearance controls how much TV detail the archive exposes.</p></section>
    <div class="environment-grid">${themes.map(theme => `<button class="panel environment-card ${active === theme.id ? "active" : ""}" data-theme-choice="${theme.id}"><small>${active === theme.id ? "ACTIVE ENVIRONMENT" : "AVAILABLE"}</small><b>${theme.title}</b><span>${theme.metaphor}</span></button>`).join("")}</div>
    <section class="panel clearance-control"><div class="panel__header"><h2>SPOILER CLEARANCE</h2><span class="panel__code">LEVEL ${clearance}</span></div><input type="range" min="0" max="5" value="${clearance}" data-clearance-choice aria-label="Spoiler clearance level"><div><span>0 · TITLES / RUNTIME</span><span>2 · EPISODE ACCESS</span><span>5 · FULL ARCHIVE</span></div><p>Low clearance obscures series artwork and episode-editor details. Core playback remains available.</p></section>`;
  document.querySelector("#view-title").textContent = "Environment Control";
  document.querySelector("#view-code").textContent = "VAULT://ENVIRONMENT";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-environment-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/environments.css"; link.dataset.environmentStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage15) update(save => {
    save.preferences.spoilerClearance ??= 2;
    save.metadata.stage15 = { startedAt: new Date().toISOString(), behavioralThemes: true, spoilerClearance: true };
  });
  applyVaultEnvironment();
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-theme-choice]");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    update(save => { save.preferences.theme = button.dataset.themeChoice; });
    applyVaultEnvironment(); renderEnvironmentRoom(); toast("ENVIRONMENT CHANGED", button.textContent.trim());
  }, true);
  document.addEventListener("input", event => {
    if (!event.target.matches("[data-clearance-choice]")) return;
    update(save => { save.preferences.spoilerClearance = Number(event.target.value); });
    applyVaultEnvironment(); renderEnvironmentRoom();
  }, true);
  on("WING_VISITED", event => { if (event.wing === "environment") setTimeout(renderEnvironmentRoom, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderEnvironmentRoom, 0));
  setTimeout(renderEnvironmentRoom, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
