import { renderAtomicWingShell } from "../ui/atomicWingShell.js";

// Rooms reserved in the shell but not yet designed. Every id here renders the
// placeholder; everything else must have a real handler in app.js renderRoute.
const wingDefinitions = {
  tonight: { title: "TONIGHT", code: "TONIGHT", icon: "☾" },
  today: { title: "TODAY", code: "TODAY", icon: "▦" },
  session: { title: "PLAN A SESSION", code: "SESSION", icon: "P" },
  companion: { title: "VAULT ASSISTANT", code: "ASSISTANT", icon: "A" },
  museum: { title: "LIVING MUSEUM", code: "MUSEUM", icon: "M" },
  settings: { title: "SETTINGS / DATA", code: "SETTINGS", icon: "⚙" }
};

const waitingCopy = {
  tonight: { noun: "CHOICES", note: "The living-room room: a few explainable picks you can start immediately.", slots: ["READY TO PLAY", "CONTINUE", "SOMETHING NEW", "QUICK PICK"] },
  today: { noun: "PICKS", note: "A short daily plan drawn from the archive you already own.", slots: ["TODAY'S PLAN", "KEEP", "LATER", "HISTORY"] },
  session: { noun: "SESSIONS", note: "Time and energy in, a grounded set of picks out.", slots: ["TIME + ENERGY", "DRAFT PLAN", "ACTIVE SESSION", "SESSION LOG"] },
  companion: { noun: "SUGGESTIONS", note: "Preview-first suggestions that never act on their own.", slots: ["CURRENT SUGGESTION", "WHY THIS", "DISMISSED", "HISTORY"] },
  museum: { noun: "EXHIBITS", note: "Daily spotlight, halls, and On This Day built only from local evidence.", slots: ["TODAY'S EXHIBIT", "PINNED GALLERY", "HALLS", "ON THIS DAY"] },
  settings: { noun: "TOOLS", note: "Export, import, protected snapshots, and storage health.", slots: ["EXPORT ARCHIVE", "IMPORT ARCHIVE", "SNAPSHOTS", "STORAGE HEALTH"] }
};

// Only rooms with no real renderer belong here. Tonight, Today, Session,
 // Companion, and Museum all have working implementations elsewhere in the app.
export const unfinishedWingIds = new Set(["settings"]);

export function renderWingPlaceholder(wing) {
  const definition = wingDefinitions[wing] || { title: `${String(wing).toUpperCase()} ARCHIVE`, code: wing, icon: "V" };
  const waiting = waitingCopy[wing];
  const room = waiting ? `<section class="vault-wing-placeholder__summary" aria-label="${definition.title} reserved layout">
      <div class="vault-wing-placeholder__brief"><span class="vault-wing-placeholder__seal">${definition.icon}</span><div><span class="eyebrow">DESIGN QUEUE // ROOM RESERVED</span><h3>${definition.title}</h3><p>${waiting.note}</p></div></div>
      <div class="vault-wing-placeholder__stats"><article><b>0</b><span>${waiting.noun}</span></article><article><b>—</b><span>LAST UPDATED</span></article><article class="ready"><b>READY</b><span>FOR DESIGN</span></article></div>
    </section><section class="vault-wing-placeholder__cards"><header><span class="eyebrow">PLANNED ARCHIVE LANES</span><b>NO AUTOMATIC CHANGES</b></header><div>${waiting.slots.map((slot,index)=>`<article><span>0${index+1}</span><i>${definition.icon}</i><h4>${slot}</h4><p>EMPTY UNTIL THIS ROOM IS DEFINED</p></article>`).join("")}</div></section>` : `<section class="vault-wing-placeholder__empty" aria-label="${definition.title} awaiting design"><span class="vault-wing-placeholder__seal">${definition.icon}</span><div><span class="eyebrow">ROOM RESERVED // NO AUTOMATIC CHANGES</span><h3>${definition.title}</h3><p>AWAITING DESIGN</p></div></section>`;
  const content=`<div class="vault-wing-placeholder">
    <section class="vault-wing-placeholder__command panel">
      <div><span class="eyebrow">VAULT WING // ${definition.code}</span><h2>${definition.title}</h2></div>
      <span class="vault-wing-placeholder__status"><i></i>ARCHIVE ONLINE</span>
    </section>
    ${room}
  </div>`;
  return renderAtomicWingShell({active:wing,title:definition.title,section:"ROOM RESERVED",content,footer:`${definition.code} // WAITING FOR DESIGN`});
}
