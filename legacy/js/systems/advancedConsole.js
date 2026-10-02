import { on } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { openModal } from "../ui/modals.js";
import { escapeHtml } from "../ui/safeHtml.js";

function queryItems(raw) {
  const query = raw.toLowerCase(), yearBefore = Number(query.match(/before\s+(\d{4})/)?.[1] || 0);
  const yearAfter = Number(query.match(/after\s+(\d{4})/)?.[1] || 0), rating = Number(query.match(/rated\s+(?:above|over)\s+(\d+)/)?.[1] || 0);
  const known = ["movies", "tv", "games", "books", "youtube", "music", "podcasts", "manga", "food", "trips"];
  const wing = known.find(value => query.includes(value));
  const genre = query.match(/genre[:\s]+([a-z][a-z -]+?)(?=\s+(?:before|after|rated|owned|unfinished)|$)/)?.[1]?.trim();
  return Object.values(getState().items || {}).filter(item =>
    !item.id.startsWith("tv_drive_") && (!wing || item.wing === wing) &&
    (!query.includes("unfinished") || item.status !== "completed") && (!query.includes("owned") || item.owned) &&
    (!yearBefore || Number(item.year) < yearBefore) && (!yearAfter || Number(item.year) > yearAfter) &&
    (!rating || Number(item.rating || 0) > rating) && (!genre || (item.genres || []).some(value => value.toLowerCase().includes(genre)))
  );
}

function resultCommand(query) {
  const items = queryItems(query);
  return { label: query, hint: `${items.length} ADVANCED MATCHES`, run: () => openModal({ title: "ADVANCED ARCHIVE QUERY", body: items.slice(0, 40).map(item => `<p><b>${escapeHtml(item.title)}</b> · ${escapeHtml(item.wing)} · ${escapeHtml(item.year || "UNDATED")}</p>`).join("") || "<p>NO RECORDS ANSWERED.</p>" }) };
}

function install() {
  if (!getState() || !document.querySelector("#view") || !window.vaultStructuredCommand) return false;
  if (!getState().metadata.stage22) update(save => { save.metadata.stage22 = { startedAt: new Date().toISOString(), savedQueries: {}, composableFilters: true }; });
  const base = window.vaultStructuredCommand;
  window.vaultStructuredCommand = raw => {
    const query = String(raw || "").trim().toLowerCase();
    const saveMatch = query.match(/^save query ([a-z0-9 _-]+)\s*=\s*(.+)$/);
    if (saveMatch) return { label: query, hint: "SAVE STRUCTURED QUERY", run: () => update(save => { save.metadata.stage22.savedQueries[saveMatch[1].trim()] = { query: saveMatch[2], savedAt: new Date().toISOString() }; }) };
    const runMatch = query.match(/^run query (.+)$/);
    if (runMatch) { const saved = getState().metadata.stage22.savedQueries[runMatch[1].trim()]; if (saved) return resultCommand(saved.query); }
    return base(raw) || (/^(?:find|show)\s+/.test(query) ? resultCommand(query) : null);
  };
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 250) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
export { queryItems };
