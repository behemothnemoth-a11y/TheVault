import { getState } from "../core/store.js";
import { launchGame } from "./gamesLibrary.js?v=20260913-daybook-v3";
import { importSteamLibrary, saveSteamKey, steamLibraryStatus } from "./steamLibrary.js?v=20260912-games-v3";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { escapeHtml } from "../ui/safeHtml.js";
import { beginGamePlaythrough, discoverGameSources, openGameQuickAdd, pinCurrentGame, setGameRating, setGameStatus, setRecordedPlaytime, stopGameSession, toggleGameBacklog, toggleGameFavorite } from "../wings/gamesV2.js?v=20260901-v4";
import { addGameMilestoneComplete, createGameShelf, editGameHistory, openAdvancedPlayNext, openGameDeepEdit, openGameDepthAdd, openGameOpinion, openGameQuickView, openGameReturnChoice, openSafeGameImportReview, refreshAllGameMetadataComplete, refreshGameMetadataComplete, removeGameHistory, saveGameSearch, setGameLibraryPreference, setGamePausePolicy, setGameRelationshipComplete, setGlobalPausePolicy, startGameSessionComplete, toggleGameShelfItem } from "../wings/gamesComplete.js?v=20260901-v3";
import { navigate } from "./routeController.js?v=20260913-life-v1";

export async function handleGamesAction(event, { draw, search, openProgress }) {
  const target = event.target;
  const section = target.closest("[data-games-section]")?.dataset.gamesSection;
  if (section) { navigate(section === "home" ? "games" : `games/${section}`); return true; }
  const open = target.closest("[data-games-open]")?.dataset.gamesOpen;
  if (open) { navigate(`games/${encodeURIComponent(open)}`); return true; }
  if (target.closest("[data-games-back]")) { navigate("games"); return true; }
  if (target.closest("[data-game-add]")) { openGameQuickAdd(id => navigate(`games/${encodeURIComponent(id)}`)); return true; }
  if (target.closest("[data-games-play-next]")) { openAdvancedPlayNext(draw); return true; }
  if (target.closest("[data-games-import-review]")) { openSafeGameImportReview(draw, discoverGameSources); return true; }

  if (target.closest("[data-games-pause-settings]")) {
    const settings = getState().metadata.games?.settings || {};
    openModal({ title: "GLOBAL PAUSE SUGGESTIONS", body: `<div class="games3-edit"><label><input type="checkbox" data-gpause-global-enabled ${settings.pauseSuggestionsEnabled !== false ? "checked" : ""}> ENABLE SUGGESTIONS</label><label>DEFAULT INACTIVITY DAYS<input type="number" min="1" max="365" data-gpause-global-days value="${settings.pauseSuggestionDays || 30}"></label><p>This only creates visible suggestions. Games are never automatically marked Paused.</p></div>`, actions: [{ label: "SAVE", primary: true, handler: dialog => { setGlobalPausePolicy(dialog.querySelector("[data-gpause-global-enabled]").checked, dialog.querySelector("[data-gpause-global-days]").value); closeModal(); draw(); } }] });
    return true;
  }

  const gameView = target.closest("[data-game-view]")?.dataset.gameView;
  if (gameView) { setGameLibraryPreference("view", gameView); draw(); return true; }
  const gameFilter = target.closest("[data-game-filter]");
  if (gameFilter) { setGameLibraryPreference(gameFilter.dataset.gameFilter, gameFilter.value); draw(); return true; }
  if (target.closest("[data-game-filter-favorite]")) { setGameLibraryPreference("favorite", !getState().preferences.games?.filters?.favorite); draw(); return true; }
  if (target.closest("[data-game-save-search]")) {
    openModal({ title: "SAVE GAME SEARCH", body: `<label>SEARCH NAME<input data-gs-name autofocus></label><p>The current search text is saved as a reusable library search.</p>`, actions: [{ label: "SAVE", primary: true, handler: dialog => { if (!saveGameSearch(dialog.querySelector("[data-gs-name]").value, search.value)) return toast("NAME REQUIRED", "Give this search a name."); closeModal(); draw(); } }] });
    return true;
  }
  if (target.closest("[data-game-new-shelf]")) {
    openModal({ title: "NEW MANUAL SHELF", body: `<label>SHELF NAME<input data-gsh-name autofocus></label>`, actions: [{ label: "CREATE SHELF", primary: true, handler: dialog => { if (!createGameShelf(dialog.querySelector("[data-gsh-name]").value)) return toast("NAME REQUIRED", "Give this shelf a name."); closeModal(); draw(); } }] });
    return true;
  }
  const savedQuery = target.closest("[data-game-saved-query]")?.dataset.gameSavedQuery;
  if (savedQuery !== undefined) { search.value = savedQuery; draw(); return true; }
  const shelfToggle = target.closest("[data-game-shelf-toggle]");
  if (shelfToggle) { toggleGameShelfItem(shelfToggle.dataset.gameShelfToggle, shelfToggle.dataset.gameId); draw(); return true; }
  const shelfOpen = target.closest("[data-game-shelf-open]")?.dataset.gameShelfOpen;
  if (shelfOpen) {
    const shelf = getState().preferences.games?.manualShelves?.find(value => value.id === shelfOpen);
    const items = (shelf?.itemIds || []).map(id => getState().items[id]).filter(Boolean);
    openModal({ title: shelf?.name || "GAME SHELF", body: `<div class="games2-grid">${items.map(item => `<button data-games-open="${escapeHtml(item.id)}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.gameMeta?.playStatus || "")}</span></button>`).join("") || "<p>This shelf is empty. Add games from Game Detail.</p>"}</div>` });
    return true;
  }
  const smart = target.closest("[data-game-smart]")?.dataset.gameSmart;
  if (smart) {
    const all = Object.values(getState().items).filter(item => item.wing === "games");
    const items = smart === "unfinished" ? all.filter(item => !["beaten", "completed", "dropped"].includes(item.gameMeta?.playStatus)) : smart === "replays" ? all.filter(item => (item.gameMeta?.playthroughs || []).length > 1) : all.filter(item => (item.gameMeta?.addons || []).length);
    openModal({ title: `SMART SHELF · ${smart.toUpperCase()}`, body: `<div class="games2-grid">${items.map(item => `<button data-games-open="${escapeHtml(item.id)}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.gameMeta?.playStatus || "")}</span></button>`).join("") || "<p>This Smart Shelf is currently empty.</p>"}</div>` });
    return true;
  }

  if (target.closest("[data-steam-connect]")) {
    openModal({
      title: "CONNECT STEAM ACCOUNT",
      body: `<div class="games3-edit"><p>Local files only show what this PC has installed or played. A Steam Web API key lets the Vault read your whole owned library.</p><p>Get a free key at <b>steamcommunity.com/dev/apikey</b>, then paste it below. It is stored in <b>data/private</b> — never shown again and never served to the page.</p><label>STEAM WEB API KEY<input data-steam-key type="password" autocomplete="off" spellcheck="false" placeholder="32 characters"></label><label>STEAMID64 · ONLY IF THE VAULT CANNOT FIND YOUR ACCOUNT<input data-steam-id autocomplete="off" spellcheck="false" placeholder="leave blank to use this PC's signed-in account"></label></div>`,
      actions: [{
        label: "SAVE AND CHECK", primary: true, handler: async dialog => {
          const key = dialog.querySelector("[data-steam-key]").value;
          const steamId = dialog.querySelector("[data-steam-id]").value;
          try {
            const saved = await saveSteamKey(key, steamId);
            closeModal();
            toast("STEAM CONNECTED", `${saved.gameCount} games in your Steam library. Use IMPORT STEAM LIBRARY to bring them in.`);
            draw();
          } catch (error) { toast("STEAM DID NOT ACCEPT THAT", error.message); }
        }
      }]
    });
    return true;
  }
  if (target.closest("[data-steam-import]")) {
    const screen = openProgress("READING YOUR STEAM LIBRARY", "ASKING STEAM WHAT YOU OWN…", "Nothing is added automatically. New games are staged in Import Review for you to confirm.");
    try {
      const result = await importSteamLibrary({ onProgress: value => screen.update({ phase: value.phase, detail: value.detail, total: value.total }) });
      draw();
      screen.finish("STEAM LIBRARY READ", `${result.total} games in your Steam library · ${result.staged} new ones waiting in Import Review · ${result.alreadyHere} already here · ${result.playtimeUpdated} playtime totals updated.`);
    } catch (error) { screen.fail(error.message); }
    return true;
  }

  // Hours freeze at whatever they were when a game was imported. Re-reading Steam's
  // local playtime file is what unfreezes them; discovery already did this, but only
  // from inside the import modal and without ever saying what it changed.
  if (target.closest("[data-games-refresh-playtime]")) {
    const screen = openProgress("REFRESHING PLAYTIME", "READING LOCAL LAUNCHER FILES…", "Recorded hours come from Steam. Vault-tracked session time is left alone.");
    try {
      const result = await discoverGameSources();
      draw();
      screen.finish(result.playtimeUpdated ? "PLAYTIME UPDATED" : "PLAYTIME ALREADY CURRENT",
        `${result.playtimeUpdated} games gained newer hours${result.named ? ` · ${result.named} names resolved` : ""}${result.candidates?.length ? ` · ${result.candidates.length} launcher entries seen` : ""}.`);
    } catch (error) { screen.fail(error.message); }
    return true;
  }

  const launch = target.closest("[data-game-launch]");
  if (launch) {
    const item = getState().items[launch.dataset.gameLaunch];
    if (!item) return true;
    const action = launch.dataset.launchAction === "install" ? "install" : "run";
    try {
      await launchGame(item, action);
      toast(action === "run" ? "STARTING IN STEAM" : "OPENING THE STEAM INSTALL PAGE", item.title);
    } catch (error) { toast("STEAM DID NOT RESPOND", error.message); }
    return true;
  }

  const quick = target.closest("[data-game-quick-view]")?.dataset.gameQuickView;
  if (quick) { openGameQuickView(quick); return true; }
  const edit = target.closest("[data-game-deep-edit]")?.dataset.gameDeepEdit;
  if (edit) { openGameDeepEdit(edit, draw); return true; }
  const depth = target.closest("[data-game-depth]");
  if (depth) { openGameDepthAdd(depth.dataset.gameId, depth.dataset.gameDepth, draw); return true; }
  const opinion = target.closest("[data-game-opinion]")?.dataset.gameOpinion;
  if (opinion) { openGameOpinion(opinion, draw); return true; }
  const pauseToggle = target.closest("[data-game-pause-toggle]")?.dataset.gamePauseToggle;
  if (pauseToggle) {
    const data = getState().items[pauseToggle]?.gameMeta, global = getState().metadata.games?.settings || {};
    openModal({ title: "PAUSE SUGGESTIONS", body: `<div class="games3-edit"><label><input type="checkbox" data-gpause-enabled ${data?.pauseSuggestionEnabled !== false ? "checked" : ""}> ENABLE FOR THIS GAME</label><label>INACTIVITY DAYS<input type="number" min="1" max="365" data-gpause-days value="${data?.pauseSuggestionDays || global.pauseSuggestionDays || 30}"></label><p>The Vault may suggest Paused after this many inactive days. It will never change the status automatically.</p></div>`, actions: [{ label: "SAVE", primary: true, handler: dialog => { setGamePausePolicy(pauseToggle, dialog.querySelector("[data-gpause-enabled]").checked, dialog.querySelector("[data-gpause-days]").value); closeModal(); draw(); } }] });
    return true;
  }
  const pauseNow = target.closest("[data-game-pause-now]")?.dataset.gamePauseNow;
  if (pauseNow) { setGameStatus(pauseNow, "paused"); draw(); return true; }
  const pauseDismiss = target.closest("[data-game-pause-dismiss]")?.dataset.gamePauseDismiss;
  if (pauseDismiss) { setGamePausePolicy(pauseDismiss, false); draw(); return true; }
  const history = target.closest("[data-game-history-edit]");
  if (history) {
    const item = getState().items[history.dataset.gameHistoryEdit], entry = item?.gameMeta?.history?.find(value => value.id === history.dataset.eventId);
    if (!entry) return true;
    openModal({ title: "EDIT HISTORY EVENT", body: `<div class="games3-edit"><label>DATE<input type="date" data-gh-date value="${String(entry.at || "").slice(0, 10)}"></label><label>DATE PRECISION<select data-gh-precision><option value="exact">EXACT</option><option value="month">MONTH ONLY</option><option value="year">YEAR ONLY</option><option value="unknown">UNKNOWN</option></select></label><label>LABEL<input data-gh-label value="${escapeHtml(entry.label || "")}"></label></div>`, actions: [{ label: "REMOVE INCORRECT EVENT", handler: () => { removeGameHistory(item.id, entry.id); closeModal(); draw(); } }, { label: "SAVE CORRECTION", primary: true, handler: dialog => { const date = dialog.querySelector("[data-gh-date]").value; editGameHistory(item.id, entry.id, { at: date ? new Date(`${date}T12:00:00`).toISOString() : entry.at, datePrecision: dialog.querySelector("[data-gh-precision]").value, label: dialog.querySelector("[data-gh-label]").value }); closeModal(); draw(); } }] });
    return true;
  }

  if (target.closest("[data-games-refresh-metadata]")) {
    const screen = openProgress("REFRESHING GAME DETAILS", "BUILDING THE UNCHECKED GAME QUEUE…", "Games already verified with the same title and year are remembered and skipped. Manual fields always win.");
    try { const result = await refreshAllGameMetadataComplete({ onProgress: value => screen.update({ phase: `CHECKING ${String(value.title || "GAME CATALOG").toUpperCase()}…`, detail: `${value.updated || 0} updated · ${value.queued || 0} artwork choices · ${value.failed || 0} unavailable`, current: value.current, total: value.total }) }); draw(); screen.finish(result.total ? "GAME DETAILS UPDATED" : "GAME DETAILS ALREADY CURRENT", `${result.updated} games updated · ${result.queued} artwork choices waiting for approval · ${result.failed} unavailable.`); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  const metadata = target.closest("[data-game-refresh-metadata]")?.dataset.gameRefreshMetadata;
  if (metadata) {
    const screen = openProgress("REFRESHING GAME DETAILS", "VERIFYING THE EXACT GAME…", "Manual fields are protected. Published artwork will wait for your approval.");
    try { const result = await refreshGameMetadataComplete(metadata, { force: true }); draw(); screen.finish("GAME DETAILS UPDATED", result.queued ? "Official artwork is waiting in Artwork Review." : "Metadata was updated; no verified artwork was returned."); }
    catch (error) { screen.fail(error.message); }
    return true;
  }

  const favorite = target.closest("[data-game-favorite]")?.dataset.gameFavorite;
  if (favorite) { toggleGameFavorite(favorite); draw(); return true; }
  const backlog = target.closest("[data-game-backlog]")?.dataset.gameBacklog;
  if (backlog) { toggleGameBacklog(backlog); draw(); return true; }
  const session = target.closest("[data-game-session]");
  if (session) { const seconds = session.dataset.gameSession === "stop" ? stopGameSession(session.dataset.gameId) : (startGameSessionComplete(session.dataset.gameId), 0); draw(); toast(session.dataset.gameSession === "stop" ? "GAME SESSION SAVED" : "GAME SESSION STARTED", seconds ? `${Math.max(1, Math.round(seconds / 60))} minutes tracked.` : "The Vault is tracking this session."); return true; }
  const playthrough = target.closest("[data-game-playthrough]")?.dataset.gamePlaythrough;
  if (playthrough) { openModal({ title: "NEW PLAYTHROUGH", body: `<label>OPTIONAL LABEL<input data-game-playthrough-label placeholder="NEW GAME+, HARD MODE…"></label>`, actions: [{ label: "START PLAYTHROUGH", primary: true, handler: dialog => { beginGamePlaythrough(playthrough, dialog.querySelector("[data-game-playthrough-label]").value); closeModal(); draw(); } }] }); return true; }
  const rating = target.closest("[data-game-rating]");
  if (rating) { setGameRating(rating.dataset.gameId, rating.dataset.gameRating); draw(); return true; }
  const relationship = target.closest("[data-game-relationship]");
  if (relationship) { setGameRelationshipComplete(relationship.dataset.gameRelationship, relationship.value); draw(); return true; }
  const statusSelect = target.closest("[data-game-status-select]");
  if (statusSelect) { const result = setGameStatus(statusSelect.dataset.gameStatusSelect, statusSelect.value); if (result.needsChoice) openGameReturnChoice(statusSelect.dataset.gameStatusSelect, draw); else draw(); return true; }
  const recorded = target.closest("[data-game-recorded]");
  if (recorded) { setRecordedPlaytime(recorded.dataset.gameRecorded, recorded.value); draw(); return true; }
  const milestone = target.closest("[data-game-milestone]")?.dataset.gameMilestone;
  if (milestone) { openModal({ title: "ADD GAME MILESTONE", body: `<label>MILESTONE<input data-game-milestone-label autofocus maxlength="160" placeholder="PLATINUM, 100%, CHALLENGE RUN…"></label>`, actions: [{ label: "SAVE MILESTONE", primary: true, handler: dialog => { if (!addGameMilestoneComplete(milestone, dialog.querySelector("[data-game-milestone-label]").value)) return toast("MILESTONE REQUIRED", "Enter a milestone."); closeModal(); draw(); } }] }); return true; }
  const pin = target.closest("[data-games-pin]")?.dataset.gamesPin;
  if (pin) { pinCurrentGame(pin); draw(); toast("CURRENT GAME PINNED", getState().items[pin]?.title || "Game"); return true; }
  const status = target.closest("[data-games-status]");
  if (status) { const result = setGameStatus(status.dataset.gameId, status.dataset.gamesStatus); if (result.needsChoice) openGameReturnChoice(status.dataset.gameId, draw); else { draw(); toast("GAME STATUS UPDATED", getState().items[status.dataset.gameId]?.title || "Game"); } return true; }
  return false;
}
