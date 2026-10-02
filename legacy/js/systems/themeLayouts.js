import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";

const signatures = {
  archive: { layout: "files", home: "ARCHIVE ATRIUM", discovery: "ASK THE VAULT" },
  video_store: { layout: "rental-shelves", home: "FRONT COUNTER", discovery: "STAFF PICK" },
  windows95: { layout: "desktop-windows", home: "VAULT DESKTOP", discovery: "DECIDE_FOR_ME.EXE" },
  bunker: { layout: "terminal-columns", home: "COMMAND BUNKER", discovery: "QUERY CORE" }
};

export function applyThemeLayout() {
  const theme = getState().preferences.theme || "archive", signature = signatures[theme] || signatures.archive;
  document.body.dataset.layout = signature.layout;
  document.querySelector(".main")?.setAttribute("data-layout-signature", signature.layout);
  const home = document.querySelector('[data-route="home"]');
  if (home) home.lastChild.textContent = signature.home;
  const discovery = document.querySelector("#discovery-button");
  if (discovery) discovery.setAttribute("aria-label", signature.discovery);
  return signature;
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-theme-layout-styles]")) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/theme-layouts.css"; link.dataset.themeLayoutStyles = ""; document.head.append(link); }
  if (!getState().metadata.stage24) update(save => { save.metadata.stage24 = { startedAt: new Date().toISOString(), layoutSwaps: true, signatures }; });
  applyThemeLayout();
  on("WING_VISITED", () => setTimeout(applyThemeLayout, 0));
  new MutationObserver(() => applyThemeLayout()).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
