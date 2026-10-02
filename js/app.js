import { emit, on } from "./core/events.js";
import { restoreVlcPlayback } from "./systems/nativeTvPlayback.js";
import { renderWriting, renderWritingShell, bindWriting, stopWritingSpeech } from "./wings/writing.js?v=20260913-studio-v4";
import { wings } from "./ui/navigation.js?v=20260913-life-v1";

// Rooms that filter their contents by the wing search term. Television draws its own
// field inside its filter row, so it is not listed here.
const SEARCHABLE_WINGS = new Set(["movies", "games", "manga", "youtube", "books", "music", "trips", "projects", "timeline"]);
const SEARCH_HINTS = {
  movies: "TITLE OR GENRE", games: "TITLE, GENRE OR SERIES", manga: "SERIES OR CREATOR",
  youtube: "CHANNEL OR VIDEO", books: "TITLE, AUTHOR OR SERIES", music: "ARTIST, ALBUM OR TRACK",
  trips: "PLACE OR TRIP", projects: "PROJECT OR MEDIUM", timeline: "EVENT OR TITLE"
};
import { createArchiveSnapshot, exportSave, flushPersistence, getArchiveSnapshots, getState, initStore, recordEvent, replaceState, restoreArchiveSnapshot, update } from "./core/store.js";
import { migrateSave } from "./core/migrations.js";
import { sampleItems } from "../data/sample-data.js";
import { getObservation } from "./systems/observations.js";
import { discover } from "./systems/discovery.js";
import { runHealthCheck } from "./systems/health.js";
import { chooseAndScanDirectory } from "./systems/driveScanner.js";
import { toast } from "./ui/notifications.js";
import { closeModal, openModal } from "./ui/modals.js";
import { escapeHtml, safeTextList } from "./ui/safeHtml.js";
import { openCommandPalette } from "./ui/commandPalette.js";
import { renderHome } from "./wings/home.js?v=20261002-halloween-picker-v1";
import { ignoreMasterScanFiles, masterScanSuggestions, masterScanSummary, runMasterScan, sortMasterScanFiles } from "./systems/masterScan.js?v=20260912-master-scan-v1";
import { claimReturningAudibleSession, correctAllBookMetadata, dismissBookRecommendation, enrichImportedBook, ensureBooks, findMissingBookCovers, finishBookAudibleSession, openAudibleProgressDialog, openBookAddDialog, openBookCoverPicker, openBookEditDialog, openBookMetadataReview, openBookRecommendationDialog, refreshBookRecommendations, refreshBookSeries, removeBook, renameBookCollection, renderBookPage, renderBookSeriesPage, renderBooksShell, renderBooksWing, setBookAudibleOwned, setBookField, setBookOwned, setBookPreference, startBookAudibleSession, toggleBookFavorite } from "./wings/books.js?v=20260830-metadata-checkpoints-v16";
import { renderWingPlaceholder, unfinishedWingIds } from "./wings/placeholders.js?v=20261001-router-v1";
import { renderLivingMuseum } from "./systems/livingMuseum.js?v=20261001-router-v1";
import { renderMissingFileReview } from "./systems/missingFileReview.js?v=20261001-review-v4";
import { renderLifeRoom } from "./wings/life.js?v=20261001-routing-repair-v1";
import { ensureFoodWing, renderFoodWing, rollFoodCurio, searchFridge, shiftFoodDate, foodViewDate } from "./wings/food.js?v=20260913-receipts-v2";
import { addWater, foodGoals, logFood, logWeight, markPlate, removeLogEntry, setFoodGoals } from "./systems/foodTracker.js?v=20260913-food-v2";
import { openFoodLogger } from "./systems/foodLogger.js?v=20260913-food-v2";
import { confirmPending, discardPending, dropPending, ensureFridge, readGroceries, renderFridgeWing, setFridgeTab, suggestFromFridge, syncPending } from "./wings/fridge.js?v=20260913-receipts-v2";
import { closePantryItem, restorePantryItem } from "./systems/fridge.js?v=20260913-receipts-v2";
import { closeSupply, restockSupply } from "./systems/household.js?v=20260913-receipts-v2";
import { clearCurrentTvRecommendations, dismissTvRecommendation, enrichOwnedTvCatalogs, enrichTvSeries, ensureTvStyles, findAllOwnedTvSeasonArtwork, findAllTvSeasonArtwork, hideTvCard, makeEpisodes, openTvAddDialog, openTvSeasonArtworkPicker, quickCompleteEpisode, recordEpisodePlayback, recordSeriesOpened, refreshTvMetadata, renderReviewQueue, renderSeasonPage, renderSeriesPage, renderTvGenresPage, renderTvRecommendationsPage, renderTvShell, renderTvWing, resetTvPreferences, restoreTvCard, setTvPage, setTvPreference, setTvRecommendationsHidden, setTvSeasonWatched, toggleTvFavorite } from "./wings/tv.js?v=20260926-desktop-v3";
import { ensureMovieStyles, openMovieAddDialog, openTmdbSetup, refreshMovieMetadata, renderMovieCollectionPage, renderMoviePage, renderMoviesShell, renderMoviesWing, scanSelectedMovieFolder, setMoviePlannedPage, setMoviePreference, setMovieRating, setMovieStatus, toggleMovieFavorite } from "./wings/movies.js?v=20261001-planned-pagination-v1";
import { addGameMilestone, beginGamePlaythrough, discoverGameSources, ensureGamesV2Styles, openGameImportReview, openGameQuickAdd, openPlayNextDialog, pinCurrentGame, refreshAllGameMetadata, refreshGameMetadata, renderGameDetail, renderGamesV2, renderGamesV2Shell, setGameRating, setGameRelationship, setGameStatus, setRecordedPlaytime, startGameSession, stopGameSession, toggleGameBacklog, toggleGameFavorite } from "./wings/gamesV2.js?v=20260901-v4";
import { addGameDepthRecord, addGameMilestoneComplete, createGameShelf, editGameHistory, ensureCompleteGameModel, openAdvancedPlayNext, openGameDeepEdit, openGameDepthAdd, openGameOpinion, openGameQuickView, openGameReturnChoice, openSafeGameImportReview, pauseSuggestions, recordGameOpinion, refreshAllGameMetadataComplete, refreshGameMetadataComplete, removeGameHistory, renderGameDetailComplete, renderGamesComplete, saveGameSearch, setGameLibraryPreference, setGamePausePolicy, setGameRelationshipComplete, setGlobalPausePolicy, startGameSessionComplete, toggleGameShelfItem } from "./wings/gamesComplete.js?v=20260901-v3";
import { applyComicArtworkFit, attachComicArtwork, autoFillComicArtwork, checkComicReleases, correctAllComicMetadata, dismissComicRecommendation, ensureComicsManga, hideComicCard, markComicThroughLatest, openComicAddDialog, openComicArtworkPicker, openComicEditDialog, openComicMetadataReview, openComicReaderDialog, openComicRecommendationDialog, openComicVolumeArtworkPicker, openKindleAccount, openPreferredComicReader, pendingComicMetadataReviews, refreshComicRecommendations, refreshComicVolumes, renameComicCollection, renderComicSeriesPage, renderComicsMangaShell, renderComicsMangaWing, replaceComicArtwork, replaceLegacyGeneratedComicArtwork, resetComicPreferences, setComicField, setComicOwned, setComicPreference, setComicStatus, toggleComicFavorite, toggleComicVolumeRead } from "./wings/comicsManga.js?v=20260909-quick-audit-v1";
import { setComicOwnershipType, setComicStructure } from "./wings/comicsMangaV2.js?v=20260831-v3";
import { connectGoogleYouTube, disconnectGoogleYouTube, enrichYouTubeHistoryDurations, ensureYouTube, markYouTubeChannelWatched, markYouTubeUploadWatched, openGoogleSubscriptionPicker, openYouTubeAccount, openYouTubeAddDialog, openYouTubeArtworkDialog, openYouTubeChannel, openYouTubeHistoryImport, openYouTubeSubscriptionImport, openYouTubeVideo, refreshYouTubeChannels, renderYouTubeChannelPage, renderYouTubeHistoryPage, renderYouTubeShell, renderYouTubeWing, setYouTubeChannelState, setYouTubePreference } from "./wings/youtube.js?v=20260905-history-sync-v2";
import { stage0Ready } from "./systems/stage0AutoLoad.js";
import { applyBundledArtwork } from "./systems/bundledArtwork.js";
import { ensureDailyDesk, recordDailyDeskFeedback, rotateDailyDesk, setDailyDeskMode } from "./systems/dailyDesk.js";
import { renderTodayHub } from "./systems/todayHub.js";
import { createSessionPlan, renderSessionPlanner, setSessionPreference, updateSessionStatus } from "./systems/sessionPlanner.js";
import { ensurePersonalAutopilot, renderPersonalAutopilot, resolveAutopilotAction, resolveAutopilotProposal, setPersonalAutopilotEnabled } from "./systems/personalAutopilot.js";
import { ensureLifeDashboard, markDeviceTransfer, setLifePreference, toggleFocusDomain } from "./systems/lifeDashboard.js";
import { renderTonight } from "./systems/livingRoom.js";
import { renderUniversalRecord, recordUniversalOpen, setUniversalRecordRating, setUniversalRecordStatus, toggleUniversalRecordFavorite } from "./systems/universalRecord.js?v=20261001-routing-repair-v1";
import { renderTasteCalibration, startCalibrationSession, recordCalibrationChoice, undoLastCalibrationChoice } from "./systems/tasteCalibration.js";
import { ensureTimelineStyles, renderTimeMachine, setTimelineFilter } from "./systems/timeline.js";
import { renderBackgroundCare, runBackgroundCare, setBackgroundCareCadence, setBackgroundCareEnabled } from "./systems/backgroundCare.js?v=20261001-routing-repair-v1";
import { ensureSentinelStyles, renderSentinel } from "./systems/sentinel.js?v=20261001-routing-repair-v1";
import { runLibraryAwareness } from "./systems/libraryAwareness.js";

import { getReadingDriveScan, identifyPendingReadingFiles, ignoreAllPendingReadingFiles, inspectReadingFile, resolveReadingFile, scanSelectedReadingFolder } from "./systems/readingDriveScan.js?v=20261001-scan-consolidation-v1";
import { fillReadingGaps, readingDetailGaps } from "./systems/readingDetails.js?v=20260912-reading-details-v1";
import { steamLibraryStatus } from "./systems/steamLibrary.js?v=20260912-games-v3";
import { handleTriviaGameAction, handleTriviaGameInput, openTriviaGame } from "./systems/triviaGameHost.js?v=20260912-trivia-game-v1";
import { openProjectAdd, openProjectEditor, renderProjects, setProjectStatus } from "./wings/projects.js?v=20260912-projects-v1";
import { beginPlaybackSession, markPlaybackReturn, ratePlaybackSession, resolvePlaybackSession } from "./systems/playbackLifecycle.js";
import { openEmbeddedReader } from "./systems/embeddedReader.js?v=20260913-daybook-v3";
import { openTvPlayer } from "./systems/tvPlayer.js?v=20260926-desktop-v3";
import { openMoviePlayer } from "./systems/moviePlayer.js?v=20260913-daybook-v3";
import { connectSpotify, disconnectSpotify, enrichSpotifyLibrary, openSpotifyHistoryImport, refreshSpotifyArtistCatalog, refreshSpotifyRecent, refreshTrackedMusicReleases, renderMusicAlbumPage, renderMusicArtistPage, renderMusicShell, renderMusicWing, setMusicPreference, showMoreMusic, toggleMusicAlbumFinished, toggleMusicArtistHidden, toggleMusicArtistTracked } from "./wings/music.js?v=20261001-album-pages-v1";
import { chooseSpotifyPodcasts, ensurePodcasts, ensurePodcastStyles, importAllPodcastHistory, markPodcastEpisode, openPodcastEpisode, refreshPodcasts, renderPodcastsShell, renderPodcastsWing } from "./wings/podcasts.js?v=20260905-v6";
import { importBundledLegacyTvHistory } from "./systems/legacyTvHistory.js";
import { dismissAdaptiveSection, getAdaptiveHomePreferences, getRecommendationReadiness, pinAdaptiveSection, refreshAdaptiveEditorial, resetAdaptiveHomePreferences, setAdaptiveHomeEnabled } from "./systems/adaptiveEditorial.js?v=20260827-home-adaptive-v1";
import { answerHomeTrivia, ensureHomeCommandCenter, openWeatherCard, refreshHomeRadar, refreshHomeTrivia, refreshHomeWeather } from "./systems/homeCommandCenter.js?v=20261001-home-city-v2";
import { ensureHomeArchiveCards, rerollPlaySomething } from "./systems/homeArchiveCards.js?v=20261001-home-final-v1";
import { addCountdown, ensureHomeCuriosities, refreshRabbitHole, removeCountdown } from "./systems/homeCuriosities.js?v=20261001-home-city-v3";
import { chooseHalloweenKind, rerollHalloweenPick, skipHalloweenPick } from "./systems/halloweenPicker.js?v=20261002-halloween-picker-v1";
import { ensureDaybook } from "./systems/daybook.js?v=20260913-daybook-v3";
import { hydrateReviewQueue, resolveReviewItem } from "./systems/reviewQueue.js";
import { artworkApprovalStats, pendingArtworkApprovals, resolveArtworkApproval, verifyAllPendingArtwork } from "./systems/artworkApproval.js?v=20260901-art-review-v2";
import { renderWingTimeTotal } from "./systems/timeTotals.js?v=20260906-movie-profiles-v3";
import { openRemoveCardsDialog } from "./systems/cardRemoval.js?v=20260905-v3";
import { initReliabilityController, openVaultProgress as openAiProgress } from "./systems/reliabilityController.js?v=20260902-v1";
import { initVaultNavigation, navigate, resolveVaultRoute } from "./systems/routeController.js?v=20261001-routing-repair-v1";
import { handleGamesAction } from "./systems/gamesActions.js?v=20260913-life-v1";
import { handleBooksAction } from "./systems/booksActions.js?v=20260913-life-v1";
import { handleComicsAction, handleComicsChange } from "./systems/comicsActions.js?v=20260913-life-v1";
import { handleTvAction, handleTvChange } from "./systems/tvActions.js?v=20260926-desktop-v3";
import { ensureTrips, ensureTripStyles, renderTripPage, renderTripsShell, renderTripsWing } from "./wings/trips.js?v=20260906-v3";
import { handleTripsAction, handleTripsChange } from "./systems/tripsActions.js?v=20260913-life-v1";
import { addCalendarSuggestion, dismissCalendarSuggestion, ensureCalendar, loadCalendar, moveCalendarMonth, openCalendarDay, openCalendarEventDialog, openCalendarEventEditor, refreshCalendarSuggestions, renderCalendarWing, returnCalendarToday, setCalendarView } from "./wings/calendar.js?v=20260912-calendar-v2";
import {
  ensureWorkbenchStyles,
  getSelectedReviewCount,
  getWorkbenchRecord,
  renderWorkbench,
  resolveWorkbenchBatch,
  setWorkbenchFilter,
  toggleWorkbenchReview,
  undoWorkbenchChange,
  updateWorkbenchRecord,
  uploadWorkbenchArtwork
} from "./systems/workbench.js";

const view = document.querySelector("#view"), search = document.querySelector("#global-search");
const UI_SCALE_KEY = "vault-ui-scale", UI_SCALES = [90, 100, 115, 130, 150, 170];
let route = "home", routeContext = { segments: [] }, tvScreen = "catalog", activeShow = null, activeSeason = null, movieScreen="library", activeMovie=null,activeMovieCollection="", gamesScreen="home",activeGame=null, comicScreen = "catalog", activeComic = null, youtubeScreen = "catalog", activeYouTubeChannel = null,youtubeHistoryMode="month",youtubeHistoryPeriod="", booksScreen="catalog", activeBook=null, activeBookSeries="",musicScreen="catalog",activeMusicArtist="",activeMusicAlbum="",activePodcast="",tripScreen="catalog",activeTrip=null;
let podcastRepairStarted=false;
document.addEventListener("click",event=>{const id=event.target.closest("#modal-root [data-games-open]")?.dataset.gamesOpen;if(id){closeModal();navigate(`games/${encodeURIComponent(id)}`)}},{capture:true});

function readingScanHtml(report){const pending=(report.files||[]).filter(file=>file.status==="pending"),resolved=(report.files||[]).filter(file=>file.status!=="pending"),rows=values=>values.length?`<div class="scan-review-list">${values.slice(0,500).map(file=>`<article><b>${escapeHtml(file.titleHint)}</b><small>${escapeHtml(file.extension)} · ${escapeHtml(file.kind.toUpperCase())} · ${Math.max(1,Math.round(Number(file.bytes||0)/1048576))} MB</small>${file.aiIdentifiedAt?`<small class="scan-ai-label">AI SUGGESTION: ${escapeHtml(String(file.aiKind||"review").toUpperCase())} · ${escapeHtml(String(file.aiConfidence||"low").toUpperCase())} CONFIDENCE${file.aiReason?` · ${escapeHtml(file.aiReason)}`:""}</small>`:""}<details><summary>FILE LOCATION</summary><p>${escapeHtml(file.path)}</p></details>${file.status==="pending"?`<div><button data-reading-file="book" data-reading-id="${escapeHtml(file.id)}">BOOKS</button><button data-reading-file="comic" data-reading-id="${escapeHtml(file.id)}">COMICS / MANGA</button><button data-reading-file="ignore" data-reading-id="${escapeHtml(file.id)}">IGNORE</button></div>`:`<small>${escapeHtml(file.status.toUpperCase())} ${file.resolvedAs?`AS ${escapeHtml(file.resolvedAs.toUpperCase())}`:""}</small>${file.status==="ignored"?`<div><button data-reading-file="undo" data-reading-id="${escapeHtml(file.id)}">UNDO</button></div>`:""}`}</article>`).join("")}</div>`:`<p class="muted">Nothing in this section.</p>`;return`<div class="drive-scan-report"><p class="scan-readonly-note">READ ONLY · FILES ARE NEVER MOVED, RENAMED, EDITED, OR DELETED.</p><div class="review-summary-grid"><div class="panel"><b>${Number(report.fileCount||0)}</b><span>READING FILES</span></div><div class="panel"><b>${pending.length}</b><span>NEEDS REVIEW</span></div><div class="panel"><b>${resolved.length}</b><span>RESOLVED</span></div></div><details open><summary>READY FOR REVIEW · ${pending.length}</summary>${rows(pending)}</details><details><summary>REVIEW HISTORY · ${resolved.length}</summary>${rows(resolved)}</details></div>`}
function showReadingScan(report=getReadingDriveScan(),folder=""){if(!report)return toast("NO READING SCAN YET","Run Scan Reading Files first.");const scope=String(folder||""),scoped=scope?{...report,files:(report.files||[]).filter(file=>String(file.selectedFolder||"").toLowerCase()===scope.toLowerCase())}:report,pending=(scoped.files||[]).filter(file=>file.status==="pending").length;openModal({title:scope?`FOLDER REVIEW · ${scope}`:"BOOKS + COMICS DRIVE REVIEW",body:readingScanHtml(scoped),actions:[...(pending?[{label:"AI IDENTIFY NEXT 60",primary:true,handler:async()=>{const screen=openAiProgress("IDENTIFYING READING FILES","ANALYZING THE NEXT REVIEW BATCH…","Only files from the currently selected folder are being reviewed.");try{const result=await identifyPendingReadingFiles({limit:60,folder:scope,onProgress:value=>screen.update({phase:value.phase,current:value.current,total:value.total})});draw();showReadingScan(getReadingDriveScan(),scope);toast("READING FILES IDENTIFIED",`${result.identified} files labeled · ${result.remaining} still waiting in this folder.`)}catch(error){screen.fail(error.message)}}},{label:`IGNORE ALL WAITING (${pending})`,handler:()=>{const count=ignoreAllPendingReadingFiles(scope);showReadingScan(getReadingDriveScan(),scope);toast("READING FILES IGNORED",`${count} file${count===1?"":"s"} removed from this folder queue. No files were changed.`)}}]:[]),{label:"CLOSE",primary:true,handler:()=>closeModal()}]});const body=document.querySelector("#modal-root .modal__body");body.onclick=async event=>{const button=event.target.closest("[data-reading-file]");if(!button)return;const decision=button.dataset.readingFile;if(["ignore","undo"].includes(decision)){const result=resolveReadingFile(button.dataset.readingId,decision);draw();showReadingScan(getReadingDriveScan(),scope);return toast(decision==="undo"?"READING DECISION UNDONE":"READING FILE IGNORED",result.title||"Reading file")}const screen=openAiProgress("READING FILE METADATA","CHECKING THE FILE'S OWN RECORD…","Using embedded EPUB or ComicInfo metadata before any catalog search."),local=await inspectReadingFile(button.dataset.readingId),result=resolveReadingFile(button.dataset.readingId,decision,local);if(decision==="book"&&result.itemId){screen.update({phase:"VERIFYING CLEAN BOOK IDENTITY…",detail:"Matching the embedded title, author, ISBN, and series against book catalogs."});const metadata=await enrichImportedBook(result.itemId,{onProgress:value=>screen.update(value)});draw();showReadingScan(getReadingDriveScan(),scope);return toast(metadata.status==="verified"?"BOOK VERIFIED":metadata.status==="review"?"BOOK NEEDS EDITION REVIEW":"BOOK ADDED — LOCAL METADATA KEPT",metadata.status==="verified"?`${metadata.title} was populated from clean file metadata and verified catalogs.${metadata.artworkQueued?" Its cover is waiting for approval.":""}`:metadata.status==="review"?"The embedded metadata was kept; possible editions are waiting in Review Editions.":"The file's embedded metadata was kept and can be refined later.")}draw();showReadingScan(getReadingDriveScan(),scope);return toast(result.grouped?"VOLUME ADDED TO EXISTING SERIES":"COMIC SERIES ADDED",`${result.title||"Comic"} used embedded metadata first.`)}}

function artworkApprovalHtml(){
  const pending=pendingArtworkApprovals();
  if(!pending.length)return`<div class="artwork-review-empty"><b>ARTWORK QUEUE CLEAR</b><p>No image can change a card without being shown here first.</p></div>`;
  return`<div class="artwork-review-intro"><b>${pending.length} IMAGE${pending.length===1?"":"S"} WAITING</b><p>Approve only an exact match. Rejecting remembers this image so the same bad result is not offered again.</p></div><div class="artwork-review-grid">${pending.map(entry=>`<article class="artwork-review-card"><i><img src="${escapeHtml(entry.path)}" alt="Candidate artwork for ${escapeHtml(entry.title)}"></i><div><span>${escapeHtml(String(entry.kind||"artwork").replaceAll("_"," ").toUpperCase())}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.subtitle||"Artwork candidate")}</p><small>${escapeHtml(entry.sourceName||"SOURCE UNAVAILABLE")}</small>${entry.sourceUrl?`<a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noreferrer">CHECK SOURCE ↗</a>`:""}<div><button class="button primary" data-artwork-decision="approve" data-artwork-id="${escapeHtml(entry.id)}">APPROVE</button><button class="button" data-artwork-decision="reject" data-artwork-id="${escapeHtml(entry.id)}">REJECT</button></div></div></article>`).join("")}</div>`;
}
// What the AI worked out but would not file on its own: a film it cannot place, an
// episode of a series the archive does not have, a song, a game. Grouped by wing so
// the decision is "these twelve are films" rather than twelve separate questions.
function showMasterScanSuggestions(){
  const groups=masterScanSuggestions();
  const label={tv:"TELEVISION",movies:"FILMS",books:"BOOKS",manga:"COMICS / MANGA",music:"MUSIC",games:"GAMES",ignore:"EXTRAS"};
  const body=groups.length?`<div class="master-suggestions">${groups.map(group=>`<section><header><b>${escapeHtml(label[group.wing]||group.wing.toUpperCase())} · ${group.entries.length}</b><button data-master-ignore-wing="${escapeHtml(group.wing)}">SET ASIDE ALL</button></header><ul>${group.entries.slice(0,60).map(entry=>`<li><b>${escapeHtml(entry.verdict.title||entry.name)}</b><small>${escapeHtml(entry.verdict.reason||"")}</small><code>${escapeHtml(entry.path)}</code></li>`).join("")}</ul>${group.entries.length>60?`<p>and ${group.entries.length-60} more</p>`:""}</section>`).join("")}</div>`
    :`<p>Nothing is waiting. Run SORT WHAT WAS FOUND after a scan to get suggestions.</p>`;
  openModal({title:"SORTING SUGGESTIONS",body,actions:[{label:"CLOSE",primary:true,handler:()=>closeModal()}]});
  const root=document.querySelector("#modal-root .modal__body");
  if(root)root.onclick=event=>{
    const wing=event.target.closest("[data-master-ignore-wing]")?.dataset.masterIgnoreWing;
    if(!wing)return;
    const group=masterScanSuggestions().find(entry=>entry.wing===wing);
    if(!group)return;
    const count=ignoreMasterScanFiles(group.entries.map(entry=>entry.id));
    closeModal();draw();
    toast("SET ASIDE",`${count} files will not be offered again.`);
  };
}

function showArtworkApprovalQueue(){
  const pending=pendingArtworkApprovals(),ids=pending.map(entry=>entry.id);
  openModal({title:"ARTWORK APPROVAL",body:artworkApprovalHtml(),actions:[...(pending.length?[{label:`VERIFY ALL ARTWORK (${pending.length})`,handler:()=>openModal({title:"VERIFY ALL ARTWORK?",body:`<div class="artwork-review-intro"><b>APPROVE ${pending.length} WAITING IMAGE${pending.length===1?"":"S"}</b><p>This applies every cover currently shown in Artwork Review. Individual images can still be reviewed separately if you cancel.</p></div>`,actions:[{label:"CANCEL",handler:()=>showArtworkApprovalQueue()},{label:"VERIFY ALL",primary:true,handler:()=>{const verified=verifyAllPendingArtwork(ids);draw();showArtworkApprovalQueue();toast("ARTWORK BATCH VERIFIED",`${verified} image${verified===1?"":"s"} approved and applied.`)}}]})}]:[]),{label:"CLOSE",primary:true,handler:()=>closeModal()}]});
  const body=document.querySelector("#modal-root .modal__body");if(!body)return;
  body.onclick=event=>{const button=event.target.closest("[data-artwork-decision]");if(!button)return;const approved=button.dataset.artworkDecision==="approve",title=resolveArtworkApproval(button.dataset.artworkId,approved);draw();showArtworkApprovalQueue();toast(approved?"ARTWORK APPROVED":"ARTWORK REJECTED",title||"Artwork candidate")};
}

function finishAutomaticReadingScan(result,folder=""){
  const automatic=result?.automatic||{},review=Number(automatic.review||0),added=Number(automatic.added||0),duplicates=Number(automatic.duplicates||0),merged=Number(automatic.merged||0),books=Number(automatic.books||0),comics=Number(automatic.comics||0),remembered=Number(result?.remembered||0),changed=Number(result?.changed||0);
  draw();
  if(review>0){showReadingScan(getReadingDriveScan(),folder);return toast("AUTOMATIC IMPORT MOSTLY COMPLETE",`${added} added · ${merged} merged · ${remembered} already current · ${review} genuinely uncertain file${review===1?"":"s"} left for review.`)}
  closeModal();return toast("AUTOMATIC IMPORT COMPLETE",`${books} book${books===1?"":"s"} · ${comics} comic file${comics===1?"":"s"} · ${merged} merged · ${duplicates} duplicate${duplicates===1?"":"s"} skipped · ${remembered} already current${changed?` · ${changed} changed file${changed===1?"":"s"} refreshed`:""}.`)
}
function setUiScale(value, persist = true) {
  const requested = Number(value);
  const scale = UI_SCALES.includes(requested) ? requested : 115;
  document.body.dataset.uiScale = String(scale);
  if (persist) try { localStorage.setItem(UI_SCALE_KEY, String(scale)); } catch {}
  return scale;
}

function shiftUiScale(direction) {
  const current = setUiScale(document.body.dataset.uiScale, false);
  const index = UI_SCALES.indexOf(current);
  return setUiScale(UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, index + Number(direction)))]);
}

let storedUiScale = 115;
document.documentElement.classList.toggle("vault-desktop", Boolean(globalThis.vaultDesktopReady));
try { storedUiScale = localStorage.getItem(UI_SCALE_KEY) || 115; } catch {}
setUiScale(storedUiScale, false);
const startup=window.VaultStartup;
startup?.phase(12,"LOADING SAVED ARCHIVE","Checking the local Vault record. No drives or online services are being scanned.");
try{await stage0Ready}catch(error){console.error("Optional Stage 0 recovery paused:",error)}
startup?.phase(38,"OPENING LOCAL DATABASE","Restoring your saved cards, progress, artwork decisions, and preferences.");
await initStore(sampleItems);
initReliabilityController();
startup?.phase(58,"PREPARING LIBRARIES","Building the saved local views. No catalogs or recommendations are being refreshed.");
applyBundledArtwork();
ensureTvStyles();
ensureMovieStyles();
ensureGamesV2Styles();
ensureTripStyles();
ensurePodcastStyles();
  ensureComicsManga();
  ensureYouTube();
  ensureBooks();
  ensurePodcasts();
  ensureTrips();
  ensureCalendar();
  ensureHomeCommandCenter(() => { if (route === "home") draw(); });
  ensureHomeArchiveCards(() => { if (route === "home") draw(); });
  ensureHomeCuriosities(() => { if (route === "home") draw(); });
  ensureFoodWing(() => { if (route === "food") draw(); });
  ensureFridge(() => { if (route === "food") draw(); });
ensureWorkbenchStyles();
normalizeTv();
on("*", recordEvent);
ensureDaybook();
ensureLifeDashboard();
ensureDailyDesk();
ensurePersonalAutopilot();
startup?.phase(82,"DRAWING COMMAND CENTER","Connecting navigation and rendering your saved dashboard.");
initVaultNavigation(renderRoute);
wireGlobal();
emit("VAULT_OPENED", { meta: { title: "Life Dashboard ready" } });
startup?.complete();
restoreVlcPlayback(() => draw());
// One-time library repair from a deterministic local scan of D:. It runs after the
// interface is open — never during startup — links owned files the archive never
// connected, adds series found on the drive, moves scan-created duplicate cards to
// Removed Cards, and restores the movie shelves with ownership marked. A protected
// snapshot is taken first and nothing on C: or D: is read for it beyond the plan file.
(async () => {
  const { runPathRecovery } = await import("./systems/pathRecovery20261001.js?v=20261001-path-recovery-v1");
  const pathRecovery = await runPathRecovery();
  if (pathRecovery) {
    draw();
    toast("LOCAL PATHS RECOVERED", `${pathRecovery.referencesUpdated} saved file references repaired · ${pathRecovery.itemsTouched} records updated · ${pathRecovery.ambiguousLeft + pathRecovery.unmatchedLeft} references left untouched for review`, 24000);
  }

  const { runMasterBaselineRepair } = await import("./systems/masterBaselineRepair20261001.js?v=20261001-master-baseline-repair-v1");
  const repairedBaseline = await runMasterBaselineRepair();
  if (repairedBaseline) {
    draw();
    toast("MASTER SCAN BASELINE CLEANED", `${repairedBaseline.clearedReviewEntries.toLocaleString()} stale first-run review entries cleared · ${repairedBaseline.fileCount.toLocaleString()} current D: library files remembered.`, 20000);
  }

  // This archive was repaired before its change-aware scan ledger existed.
  // Establish one clean baseline after that repair; later scans are always manual.
  if (getState().metadata?.maintenance?.pathRecovery20261001 && !masterScanSummary()) {
    const { initializeMasterScanBaseline } = await import("./systems/masterScan.js?v=20261001-master-baseline-v1");
    const baseline = await initializeMasterScanBaseline();
    if (baseline) {
      draw();
      toast("D: DRIVE BASELINE READY", `${baseline.fileCount.toLocaleString()} current library files remembered. Future scans will report only new, moved, changed, or missing files.`, 24000);
    }
  }

  const { runLibraryRepair } = await import("./systems/libraryRepair.js?v=20260911-library-repair-v1");
  const repair = await runLibraryRepair();
  if (repair) {
    draw();
    toast("LIBRARY REPAIR COMPLETE", `${repair.linkedFiles} episodes linked · ${repair.showsAdded} series added · ${repair.episodesAdded} episodes recovered · ${repair.seriesRemoved} duplicate cards moved to Removed Cards · ${repair.moviesRestored} films and ${repair.shelvesRestored} shelves restored`, 20000);
  }
  const { runGamesRepair } = await import("./systems/gamesCompletion.js?v=20260912-games-repair-v1");
  const gamesRepair = await runGamesRepair();
  if (gamesRepair) {
    draw();
    toast("GAMES REPAIR COMPLETE", `${gamesRepair.gamesAdded} games imported from your Steam library · ${gamesRepair.hoursImported} recorded hours · ${gamesRepair.gamesLinked} existing games linked · ${gamesRepair.workshopFiled + gamesRepair.projectsFiled} notes filed in the Workshop · ${gamesRepair.artworkQueued} covers waiting in Artwork Review`, 20000);
  }
  const { runTvCompletion } = await import("./systems/tvCompletion.js?v=20260911-tv-completion-v1");
  const completion = await runTvCompletion();
  if (completion) {
    draw();
    toast("TELEVISION COMPLETED", `${completion.seriesEnriched} series enriched from TVMaze · ${completion.postersApplied} posters added · ${completion.episodeDetailsFilled} episode details filled · ${completion.foldedSpecials} specials filed under their show · ${completion.titlesFromFilenames} titles read from filenames · ${completion.phantomEpisodesRetired} empty episode slots retired · ${completion.deadLinksFlagged} missing files flagged`, 20000);
  }
  const { runReadingRepair } = await import("./systems/readingRepair.js?v=20260912-reading-repair-v1");
  const reading = await runReadingRepair();
  if (reading) {
    draw();
    // Covers are read from the files one at a time and there are hundreds of them.
    // That belongs behind the button in Books and Comics, not in a startup job that
    // redraws the wing under you for a minute.
    const { readingDetailGaps } = await import("./systems/readingDetails.js?v=20260912-reading-details-v1");
    const gaps = readingDetailGaps();
    toast("BOOKS AND COMICS REPAIRED", `${reading.booksAdded} books added from your drive · ${reading.filesLinked} files linked · ${reading.booksLinked} existing books gained copies · ${reading.issuesLinked} comic issues filed · ${reading.junkRemoved} files that were never books moved to Removed Cards. ${gaps.artworkAvailable} covers are waiting behind FILL COVERS + DETAILS FROM FILES in Books.`, 24000);
  }
  const { runProjectsMove } = await import("./systems/projectsRepair.js?v=20260912-projects-v1");
  const projects = await runProjectsMove();
  if (projects) {
    draw();
    toast("PROJECTS MOVED OUT OF GAMES", `${projects.moved} personal projects now live in the Projects room. Minecraft building stayed in the Games Workshop.`, 18000);
  }
})().catch(error => console.error("Local repair paused:", error));

function normalizeTv() {
  const missing = Object.values(getState().items).filter(item => item.wing === "tv" && item.progress?.total && !item.episodes);
  if (missing.length) update(save => missing.forEach(item => { save.items[item.id].episodes = makeEpisodes(item); }));
}

function renderRoute(next, context = { segments: [] }) {
  if (next !== "writing") stopWritingSpeech();
  const previousRoute = route;
  const previousRecordId = route === "record" ? routeContext.segments?.[0] || "" : "";
  route = next;
  document.body.dataset.vaultRoute = next;
  routeContext = context;
  if (next === "record" && context.segments?.[0] && (previousRoute !== "record" || previousRecordId !== context.segments[0])) {
    recordUniversalOpen(context.segments[0]);
  }
  if (previousRoute !== next) search.value = "";
  ({
    tvScreen, activeShow, activeSeason,
    movieScreen, activeMovie, activeMovieCollection,
    gamesScreen, activeGame,
    comicScreen, activeComic,
    youtubeScreen, activeYouTubeChannel, youtubeHistoryMode, youtubeHistoryPeriod,
    booksScreen, activeBook, activeBookSeries,
    musicScreen, activeMusicArtist, activeMusicAlbum,
    tripScreen, activeTrip
  } = resolveVaultRoute(next, context, getState().items));
  document.querySelector("#view-code").textContent = `VAULT://${next.toUpperCase()}`;
  draw();
  if (previousRoute !== next) requestAnimationFrame(() => view.focus({ preventScroll: true }));
  if (next !== "home") emit("WING_VISITED", { wing: next, meta: { title: next.toUpperCase() } });
}

function draw() {
  document.body.classList.add("atomic-shell-active");
  const keepHomeToolsOpen = route === "home" && Boolean(view.querySelector("details.cinema-tools")?.open);
  const libraryTarget = routeContext.segments?.[0] === "collection"
    ? getState().collections?.[routeContext.segments[1]]
    : routeContext.segments?.[0] === "item" ? getState().items?.[routeContext.segments[1]] : null;
  const titles = {
    home: "Home",
    dashboard: "Life Dashboard",
    tonight: "Tonight",
    today: "Today",
    calibrate: "Taste Signals",
    session: "Plan a Session",
    record: getState().items[routeContext.segments?.[0]]?.title || "Universal Record",
    host: "Background Care",
    companion: "Vault Assistant",
    tv: tvScreen === "season" ? `${getState().items[activeShow]?.title || "Series File"} · Season ${activeSeason}` : tvScreen === "series" ? getState().items[activeShow]?.title || "Series File" : tvScreen === "review" ? "Drive Intake Review" : "Television Archive",
    manga: comicScreen === "series" ? getState().items[activeComic]?.title || getState().metadata.comicsManga?.collectionAliases?.[activeComic] || (activeComic?.startsWith("__group__:")?activeComic.split(":").slice(2).join(":"):"Series File") : "Comics / Manga Archive",
    youtube: youtubeScreen==="channel" ? getState().items[activeYouTubeChannel]?.title || "Channel File" : youtubeScreen==="history" ? youtubeHistoryPeriod ? `YouTube History · ${youtubeHistoryPeriod}` : "YouTube Watch History" : "YouTube Archive",
    timeline: "Universal Timeline",
    sentinel: "Library Sentinel",
    trophies: "Trophy Chamber",
    workbench: "Archive Workbench",
    control: "Control Room",
    settings: "Settings / Data",
    relink: "Missing File Review",
    movies: activeMovie?getState().items[activeMovie]?.title||"Movie File":movieScreen==="collection"?"Movie Series":movieScreen==="planned"?"Planned Movies":movieScreen==="recommendations"?"Movie Recommendations":"Movie Archive",
    games: libraryTarget?.title || "Games Library",
    books: booksScreen==="book"?getState().items[activeBook]?.title||"Book File":booksScreen==="series"?activeBookSeries:"Book Archive",
    music: musicScreen==="album"?activeMusicAlbum:musicScreen==="artist"?activeMusicArtist:"Music Archive",
    trips: tripScreen==="detail"?getState().items[activeTrip]?.title||"Trip File":"Travel Archive",
    writing: "Writing Archive"
  };
  document.querySelector("#view-title").textContent = titles[route] || `${route.toUpperCase()} Wing`;
  if (route === "writing") { view.innerHTML = renderWritingShell(renderWriting(routeContext.segments)); bindWriting(view); }
  else if (route === "home") view.innerHTML = renderHome();
  else if (route === "record") view.innerHTML = renderUniversalRecord(routeContext.segments?.[0] || "");
  else if (route === "calibrate") view.innerHTML = renderTasteCalibration();
  else if (route === "timeline") { ensureTimelineStyles(); view.innerHTML = renderTimeMachine(search.value); }
  else if (route === "host") view.innerHTML = renderBackgroundCare();
  else if (route === "sentinel") { ensureSentinelStyles(); view.innerHTML = renderSentinel(); }
  else if (route === "tv") {if(tvScreen==="catalog")clearCurrentTvRecommendations();view.innerHTML = renderTvShell(tvScreen === "season" ? renderSeasonPage(activeShow,activeSeason) : tvScreen === "series" ? renderSeriesPage(activeShow) : tvScreen === "review" ? renderReviewQueue() : tvScreen === "genres" ? renderTvGenresPage(search.value) : tvScreen === "recommendations" ? renderTvRecommendationsPage() : renderTvWing(search.value), tvScreen)}
  else if (route === "movies") view.innerHTML = renderMoviesShell(movieScreen==="detail"?renderMoviePage(activeMovie):movieScreen==="collection"?renderMovieCollectionPage(activeMovieCollection):renderMoviesWing(search.value,movieScreen),movieScreen);
  else if (route === "games") view.innerHTML = renderGamesV2Shell(gamesScreen==="detail"?renderGameDetailComplete(activeGame):renderGamesComplete(gamesScreen,search.value),gamesScreen);
  else if (route === "manga") view.innerHTML = renderComicsMangaShell(comicScreen === "series" ? renderComicSeriesPage(activeComic) : renderComicsMangaWing(search.value), comicScreen);
  else if (route === "youtube") view.innerHTML = renderYouTubeShell(youtubeScreen==="channel"?renderYouTubeChannelPage(activeYouTubeChannel):youtubeScreen==="history"?renderYouTubeHistoryPage(youtubeHistoryMode,youtubeHistoryPeriod):renderYouTubeWing(search.value),youtubeScreen);
  else if (route === "projects") view.innerHTML = renderProjects(search.value);
  else if (route === "books") view.innerHTML = renderBooksShell(booksScreen==="book"?renderBookPage(activeBook):booksScreen==="series"?renderBookSeriesPage(activeBookSeries):renderBooksWing(search.value),booksScreen);
  else if (route === "music") view.innerHTML = renderMusicShell(musicScreen==="album"?renderMusicAlbumPage(activeMusicArtist,activeMusicAlbum):musicScreen==="artist"?renderMusicArtistPage(activeMusicArtist):renderMusicWing(search.value),musicScreen);
  else if (route === "podcasts") view.innerHTML=renderPodcastsShell(renderPodcastsWing(activePodcast),activePodcast?"show":"catalog");
  else if (route === "trips") view.innerHTML = renderTripsShell(tripScreen==="detail"?renderTripPage(activeTrip):renderTripsWing(search.value),tripScreen);
  else if (route === "calendar") view.innerHTML = renderCalendarWing();
  // The router keeps only the first path segment as the route; anything after
  // it arrives in routeContext.segments, which is how tv/<id> works too.
  else if (route === "food" && routeContext.segments?.[0] === "fridge") view.innerHTML = renderFridgeWing();
  else if (route === "food") view.innerHTML = renderFoodWing();
  else if (route === "dashboard") view.innerHTML = renderLifeRoom();
  else if (route === "relink") {
    view.innerHTML = '<section class="panel"><span class="eyebrow">PATH RECOVERY</span><h2>LOADING MISSING FILE REVIEW…</h2></section>';
    renderMissingFileReview().then(html => {
      if (route !== "relink") return;
      view.innerHTML = html;
    }).catch(error => { if (route === "relink") view.innerHTML = `<section class="panel"><h2>REVIEW UNAVAILABLE</h2><p>${escapeHtml(error.message)}</p></section>`; });
  }
  else if (route === "tonight") view.innerHTML = renderTonight();
  else if (route === "today") view.innerHTML = renderTodayHub();
  else if (route === "session") view.innerHTML = renderSessionPlanner();
  else if (route === "companion") view.innerHTML = renderPersonalAutopilot();
  else if (route === "museum") {
    view.innerHTML = "";
    renderLivingMuseum();
  }
  else if (unfinishedWingIds.has(route)) view.innerHTML = renderWingPlaceholder(route);
  else view.innerHTML = renderWingPlaceholder(route);
  // Every one of these wings already filters on a search term, but only Television
  // ever drew a box to type it into, so the rest were filtering on a value nothing
  // could set. The shared statusbar carries the field for the others.
  if (route === "home" && keepHomeToolsOpen) view.querySelector("details.cinema-tools")?.setAttribute("open", "");
  if(SEARCHABLE_WINGS.has(route)&&!view.querySelector("[data-wing-search]")){
    const bar=view.querySelector(".atomic-statusbar");
    if(bar)bar.insertAdjacentHTML("afterbegin",`<label class="wing-search"><span>SEARCH</span><input data-wing-search type="search" value="${escapeHtml(search.value)}" placeholder="${escapeHtml(SEARCH_HINTS[route]||"TITLE")}" autocomplete="off" aria-label="Search this room"></label>`);
  }
  if(route==="podcasts"&&!activePodcast)view.querySelector(".podcast-command aside")?.insertAdjacentHTML("beforeend",'<button class="button" data-podcast-history-import>IMPORT ALL PODCAST HISTORY</button>');
  bind();
  if(route==="calendar")loadCalendar(draw);
  const timeTarget={tv:".tv-collection-console",movies:".tv-collection-console",music:".music-command>div:first-child",books:".comic-archive-console",manga:".comic-archive-console",youtube:".youtube-command",podcasts:".waiting-command"}[route],timeMarkup=renderWingTimeTotal(route);if(timeTarget&&timeMarkup)view.querySelector(timeTarget)?.insertAdjacentHTML("beforeend",timeMarkup);
  if(route==="home"){const actions=view.querySelector(".home-quick-actions");if(actions&&!actions.querySelector("[data-master-scan]"))actions.insertAdjacentHTML("beforeend",`<button class="home-drive-scan" data-master-scan>SCAN D: DRIVE</button>`)}
  if(route==="youtube"&&youtubeScreen==="catalog"){const actions=view.querySelector(".youtube-command>aside");if(actions)actions.insertAdjacentHTML("beforeend",`<button class="button" data-youtube-missing-art>FIND MISSING CHANNEL ARTWORK</button>`)}
  if(route==="youtube"&&youtubeScreen==="history"&&!youtubeHistoryPeriod){const actions=view.querySelector(".youtube-history-command>div:last-child");if(actions)actions.insertAdjacentHTML("afterbegin",`<button class="button primary" data-youtube-history-import>SYNC GOOGLE TAKEOUT HISTORY</button><button class="button" data-youtube-history-details>REFRESH VIDEO DURATIONS</button>`)}
  if(route==="tv"&&tvScreen==="catalog"){const consolePanel=view.querySelector(".tv-collection-console");if(consolePanel)consolePanel.insertAdjacentHTML("beforeend",`<div class="tv-catalog-actions"><button class="button primary" data-tv-add>+ ADD SERIES</button><button class="button" data-tv-link-audit>VERIFY EPISODE LINKS</button><button class="button" data-tv-refresh-metadata>REFRESH METADATA</button><button class="button" data-tv-episode-details>FILL EPISODE DETAILS</button><button class="button" data-tv-season-art-owned>REFRESH OWNED SEASON ART</button></div>`)}
  if(route==="movies"&&movieScreen==="library"){const consolePanel=view.querySelector(".tv-collection-console");if(consolePanel)consolePanel.insertAdjacentHTML("beforeend",`<div class="tv-catalog-actions"><button class="button primary" data-movie-add>+ ADD MOVIE</button><button class="button" data-movie-folder-scan>SELECT D: FOLDER TO SCAN</button><button class="button" data-movie-folder-path>ENTER D: FOLDER PATH</button><button class="button" data-movie-refresh-metadata>LOOK UP ARTWORK + METADATA</button><button class="button" data-tmdb-connect>CONNECT TMDB</button></div>`)}
  if(route==="games"&&gamesScreen==="home"){const nav=view.querySelector(".games2-nav");if(nav)nav.insertAdjacentHTML("afterend",`<div class="games2-actions"><button class="button primary" data-game-add>+ ADD GAME</button><button class="button" data-games-play-next>PLAY NEXT</button><button class="button" data-games-import-review>IMPORT REVIEW</button><button class="button" data-steam-import>IMPORT STEAM LIBRARY</button><button class="button" data-steam-connect>${steamLibraryStatus()?"STEAM ACCOUNT · CONNECTED":"CONNECT STEAM ACCOUNT"}</button><button class="button" data-games-refresh-playtime>REFRESH PLAYTIME</button><button class="button" data-games-refresh-metadata>REFRESH METADATA</button><button class="button" data-games-pause-settings>PAUSE SETTINGS</button></div>`);const sources=getState().metadata.games?.sources||{},panels=view.querySelectorAll(".games2-sources article span");if(panels[0])panels[0].textContent=sources.steam?.checked?`${sources.steam.found||0} FOUND · LAST MANUAL SCAN`:"READY FOR MANUAL SCAN";if(panels[1])panels[1].textContent=sources.epic?.checked?`${sources.epic.found||0} FOUND · LAST MANUAL SCAN`:"READY FOR MANUAL SCAN";if(panels[2])panels[2].textContent=sources.minecraft?.checked?`${sources.minecraft.found||0} FOUND · LAST MANUAL SCAN`:"READY FOR MANUAL SCAN"}
  if(route==="games"&&gamesScreen==="detail"){const item=getState().items[activeGame],meta=item?.gameMeta,aside=view.querySelector(".games2-detail>aside"),main=view.querySelector(".games2-detail>main");if(item&&meta&&aside)aside.insertAdjacentHTML("beforeend",`<button class="games2-favorite ${meta.explicitBacklog?"active":""}" data-game-backlog="${escapeHtml(item.id)}">${meta.explicitBacklog?"✓ IN PLAY-NEXT POOL":"+ ADD TO PLAY-NEXT"}</button><button class="games2-favorite" data-game-refresh-metadata="${escapeHtml(item.id)}">REFRESH DETAILS / ART</button>`);if(item&&meta&&main)main.querySelector(".games2-fields")?.insertAdjacentHTML("beforebegin",`<div class="games2-session"><button class="button primary" data-game-session="${meta.activeSession?"stop":"start"}" data-game-id="${escapeHtml(item.id)}">${meta.activeSession?"STOP VAULT SESSION":"START VAULT SESSION"}</button><button class="button" data-game-playthrough="${escapeHtml(item.id)}">NEW PLAYTHROUGH</button>${meta.activeSession?`<span>SESSION RUNNING</span>`:""}</div>`)}
  if(route==="games"&&gamesScreen==="detail"){const shelves=getState().preferences.games?.manualShelves||[],depth=view.querySelector(".games3-archive-depth");if(depth&&shelves.length)depth.insertAdjacentHTML("beforeend",`<article><h3>MANUAL SHELVES</h3>${shelves.map(shelf=>`<button class="${(shelf.itemIds||[]).includes(activeGame)?"active":""}" data-game-shelf-toggle="${escapeHtml(shelf.id)}" data-game-id="${escapeHtml(activeGame)}">${(shelf.itemIds||[]).includes(activeGame)?"✓ ":"+ "}${escapeHtml(shelf.name)}</button>`).join("")}</article>`)}
  if(route==="games"&&gamesScreen==="detail"){const conflicts=getState().items[activeGame]?.gameMeta?.lastImportConflicts||[],depth=view.querySelector(".games3-archive-depth");if(depth&&conflicts.length)depth.insertAdjacentHTML("beforeend",`<article class="games3-conflicts"><h3>IMPORT CONFLICTS · MANUAL VALUE KEPT</h3>${conflicts.map(value=>`<p><b>${escapeHtml(value.field)}</b><span>Incoming: ${escapeHtml(typeof value.incoming==="object"?JSON.stringify(value.incoming):value.incoming)}</span></p>`).join("")}</article>`)}
  if(route==="games"&&gamesScreen==="library"){const saved=getState().preferences.games?.savedSearches||[],tools=view.querySelector(".games3-library-tools");if(tools&&saved.length)tools.insertAdjacentHTML("afterend",`<section class="games3-shelves"><h3>SAVED SEARCHES</h3>${saved.map(entry=>`<button data-game-saved-query="${escapeHtml(entry.query)}">${escapeHtml(entry.name)}</button>`).join("")}</section>`)}
  if(route==="tv"&&tvScreen==="catalog"){const actions=view.querySelector(".tv-catalog-actions");if(actions)actions.insertAdjacentHTML("beforeend",`<button class="button" data-drive-scan>SELECT FOLDER TO SCAN</button>`)}
  if(route==="tv"&&tvScreen==="catalog"){const owned=view.querySelector('[data-tv-filter="scope"][data-tv-value="owned"]');if(owned&&!view.querySelector('[data-tv-value="planned"]'))owned.insertAdjacentHTML("afterend",`<button class="button ${getState().preferences.dailyDriver?.tvScope==="planned"?"primary":""}" data-tv-filter="scope" data-tv-value="planned">PLANNED</button>`)}
  if(route==="tv"&&tvScreen==="series"){const header=view.querySelector(".season-poster-wall>header");if(header)header.insertAdjacentHTML("beforeend",`<button class="button" data-tv-enrich-series="${escapeHtml(activeShow)}">UPDATE SERIES CATALOG</button><button class="button season-art-search" data-tv-season-art-all="${escapeHtml(activeShow)}">FIND ALL SEASON ART</button>`)}
  if(route==="manga"){applyComicArtworkFit(view);const pendingMeta=pendingComicMetadataReviews();if(comicScreen==="catalog"&&pendingMeta.length){const actions=view.querySelector(".comic-command-actions");if(actions)actions.insertAdjacentHTML("beforeend",`<button class="button primary" data-comic-metadata-review>REVIEW METADATA · ${pendingMeta.length}</button>`)}if(comicScreen==="series"){const item=getState().items[activeComic],actions=view.querySelector(".comic-series-actions");if(item&&actions)actions.insertAdjacentHTML("beforeend",`${item.sourcePath||item.comicMeta?.sourcePath?`<button class="button primary" data-reader-open="${escapeHtml(item.id)}">READ IN VAULT</button>`:""}<button class="button ${item.owned?"primary":""}" data-comic-owned="${escapeHtml(item.id)}" data-comic-owned-value="${item.owned?"false":"true"}">${item.owned?"PHYSICALLY OWNED ✓":"MARK PHYSICALLY OWNED"}</button>`)}}
  if(route==="books"){const actions=view.querySelector(".comic-command-actions");if(booksScreen==="catalog"&&actions){const review=(getState().metadata.books?.metadataReview||[]).filter(value=>value.status==="pending").length;actions.insertAdjacentHTML("beforeend",`<button class="button" data-book-metadata>CORRECT ALL METADATA</button>${review?`<button class="button primary" data-book-metadata-review>REVIEW EDITIONS (${review})</button>`:""}<button class="button" data-book-art-backfill>FIND MISSING COVERS</button>`)}if(booksScreen==="book"){const item=getState().items[activeBook],data=item?.bookMeta,detailActions=view.querySelector(".comic-series-actions");if(detailActions)detailActions.insertAdjacentHTML("beforeend",`${item?.sourcePath||data?.sourcePath?`<button class="button primary" data-reader-open="${escapeHtml(activeBook)}">READ IN VAULT</button>`:""}<button class="button" data-book-edit="${escapeHtml(activeBook)}">EDIT DETAILS</button><button class="button" data-book-cover="${escapeHtml(activeBook)}">CHANGE COVER</button><button class="button ${data?.audibleOwned?"primary":""}" data-book-audible-owned="${escapeHtml(activeBook)}" data-book-audible-value="${data?.audibleOwned?"false":"true"}">${data?.audibleOwned?"AUDIBLE OWNED ✓":"MARK AUDIBLE OWNED"}</button><button class="button primary" data-book-audible-play="${escapeHtml(activeBook)}">PLAY IN AUDIBLE</button><button class="button" data-book-audible-sync="${escapeHtml(activeBook)}">SYNC AUDIBLE PROGRESS</button>${data?.activeListeningSession?`<button class="button primary" data-book-audible-stop="${escapeHtml(activeBook)}">STOP VAULT SESSION</button>`:""}<button class="button book-remove-button" data-book-remove="${escapeHtml(activeBook)}">REMOVE BOOK</button>`)}}
  if(route==="books"&&booksScreen==="book"){const item=getState().items[activeBook],data=item?.bookMeta,fields=view.querySelector(".comic-field-grid");if(fields&&data)fields.insertAdjacentHTML("beforeend",`<label>ACCESS / OWNERSHIP<select data-book-field="ownershipType" data-book-id="${escapeHtml(activeBook)}"><option value="" ${!data.ownershipType?"selected":""}>NONE</option><option value="borrowed" ${data.ownershipType==="borrowed"?"selected":""}>BORROWED</option><option value="library_loan" ${data.ownershipType==="library_loan"?"selected":""}>LIBRARY LOAN</option><option value="other_digital" ${data.ownershipType==="other_digital"?"selected":""}>OTHER DIGITAL</option></select></label>`)}
  if(route==="books"&&booksScreen==="catalog"){const actions=view.querySelector(".comic-command-actions");if(actions){const gaps=readingDetailGaps();actions.insertAdjacentHTML("beforeend",`<button class="button" data-reading-folder="books">BROWSE FOR FOLDER</button><button class="button" data-reading-folder-path="books">ENTER FOLDER PATH</button>${getReadingDriveScan()?`<button class="button primary" data-reading-review>REVIEW FOUND FILES</button>`:""}${gaps.artworkAvailable||gaps.descriptionAvailable?`<button class="button" data-reading-fill-gaps>FILL COVERS + DETAILS FROM FILES · ${gaps.artworkAvailable+gaps.descriptionAvailable}</button>`:""}`)}}
  if(route==="manga"&&comicScreen==="catalog"){const actions=view.querySelector(".comic-command-actions");if(actions){const gaps=readingDetailGaps();actions.insertAdjacentHTML("beforeend",`<button class="button" data-reading-folder="manga">BROWSE FOR FOLDER</button><button class="button" data-reading-folder-path="manga">ENTER FOLDER PATH</button>${getReadingDriveScan()?`<button class="button primary" data-reading-review>REVIEW FOUND FILES</button>`:""}${gaps.artworkAvailable||gaps.descriptionAvailable?`<button class="button" data-reading-fill-gaps>FILL COVERS + DETAILS FROM FILES · ${gaps.artworkAvailable+gaps.descriptionAvailable}</button>`:""}`)}}
  view.querySelector("[data-book-metadata]")?.replaceChildren("REFRESH METADATA");
  view.querySelector("[data-comic-metadata-repair]")?.replaceChildren("REFRESH METADATA");
  const artStats=artworkApprovalStats();if(artStats.pending)view.insertAdjacentHTML("beforeend",`<button class="art-review-fab" data-art-review-open><b>${artStats.pending}</b><span>ARTWORK<br>REVIEW</span></button>`);
  refresh();
}

function bind() {
  view.onclick = async event => {
    if (event.target.closest("[data-tv-reset]")) search.value = "";
    const removeCard=event.target.closest("[data-vault-remove]")?.dataset.vaultRemove;if(removeCard)return openRemoveCardsDialog([removeCard],getState().items[removeCard]?.title,draw);
    const removeArtist=event.target.closest("[data-vault-remove-artist]")?.dataset.vaultRemoveArtist;if(removeArtist){const ids=Object.values(getState().items).filter(item=>item.wing==="music"&&String(item.creator||item.artist||"").trim().toLowerCase()===removeArtist.trim().toLowerCase()).map(item=>item.id);return openRemoveCardsDialog(ids,removeArtist,draw)}
    if (handleTripsAction(event, draw)) return;
    const calendarMonth=event.target.closest("[data-calendar-month]")?.dataset.calendarMonth;if(calendarMonth)return moveCalendarMonth(Number(calendarMonth),draw);
    if(event.target.closest("[data-calendar-today]"))return returnCalendarToday(draw);
    const calendarOpen=event.target.closest("[data-calendar-open]")?.dataset.calendarOpen;
    if(calendarOpen)return openCalendarEventEditor(calendarOpen,draw);
    const calendarView=event.target.closest("[data-calendar-view]")?.dataset.calendarView;
    if(calendarView){setCalendarView(calendarView);return draw()}
    const calendarDayOpen=event.target.closest("[data-calendar-day]")?.dataset.calendarDay;
    if(calendarDayOpen)return openCalendarDay(calendarDayOpen,draw);
    const calendarDay=event.target.closest("[data-calendar-add-day]")?.dataset.calendarAddDay;
    if(calendarDay)return openCalendarEventDialog(draw,calendarDay);
    if(event.target.closest("[data-calendar-add]"))return openCalendarEventDialog(draw);
    if(event.target.closest("[data-calendar-refresh]")){await loadCalendar(draw,true);return toast("CALENDAR REFRESHED","Google Calendar is current.")}
    if(event.target.closest("[data-calendar-suggestions-refresh]")){const screen=openAiProgress("FINDING CALENDAR IDEAS","SEARCHING VERIFIED EVENT SOURCES…","Using media titles, genres, favorites, ratings, and completion status only. Your schedule and personal notes stay private.");try{const result=await refreshCalendarSuggestions(draw,value=>screen.update({phase:value}));return screen.finish("CALENDAR IDEAS READY",`${result.suggestions?.length||0} verified suggestions found. Nothing was added automatically.`)}catch(error){return screen.fail(error.message)}}
    const addSuggestion=event.target.closest("[data-calendar-suggestion-add]")?.dataset.calendarSuggestionAdd;if(addSuggestion){const screen=openAiProgress("ADDING TO CALENDAR","SAVING THE SELECTED EVENT…","Only this suggestion will be added to your primary Google Calendar.");try{const suggestion=await addCalendarSuggestion(addSuggestion,draw);return screen.finish("ADDED TO CALENDAR",suggestion.title)}catch(error){return screen.fail(error.message)}}
    const removeSuggestion=event.target.closest("[data-calendar-suggestion-remove]")?.dataset.calendarSuggestionRemove;if(removeSuggestion){dismissCalendarSuggestion(removeSuggestion);draw();return toast("SUGGESTION REMOVED","The Vault will remember not to suggest that exact event again.")}
    const calendarLink=event.target.closest("[data-calendar-link]")?.dataset.calendarLink;if(calendarLink){window.open(calendarLink,"_blank","noopener");return}
    if (await handleTvAction(event, { draw, editEpisode, openEpisodeFile, openProgress: openAiProgress, scanDrive, view })) return;
    const movieSection=event.target.closest("[data-movie-section]")?.dataset.movieSection;if(movieSection){if(movieSection==="planned")setMoviePlannedPage(1);return navigate(movieSection==="library"?"movies":`movies/${movieSection}`)}
    if (await handleGamesAction(event, { draw, search, openProgress: openAiProgress })) return;
    if(event.target.closest("[data-movie-add]"))return openMovieAddDialog(id=>navigate(`movies/${encodeURIComponent(id)}`));
    if(event.target.closest("[data-movie-drive-scan]")||event.target.closest("[data-movie-folder-scan]")||event.target.closest("[data-movie-folder-path]")){const manual=Boolean(event.target.closest("[data-movie-folder-path]")),path=event.target.closest("[data-movie-drive-scan]")?"D:/Movies":manual?prompt("Paste the full D: folder path containing movies:")?.trim()||"":"";if(manual&&!path)return;const screen=openAiProgress("SCANNING MOVIE FOLDER","CHECKING FILES AGAINST TMDB…",path||"Choose a folder on D:. Samples, extras, trailers, deleted scenes, television episodes, and matches below 90% are rejected.");try{const result=await scanSelectedMovieFolder(path);if(result.cancelled){closeModal();return toast("MOVIE SCAN CANCELLED","Nothing was changed.")}draw();return screen.finish("MOVIE FOLDER COMPLETE",`${result.added} added · ${result.updated} updated · ${result.excluded} rejected · ${result.verifiedCount} verified movie files · ${result.lookupErrors||0} lookups could not finish.`)}catch(error){return screen.fail(error.message)}}
    if(event.target.closest("[data-tmdb-connect]"))return openTmdbSetup(draw);
    if(event.target.closest("[data-movie-refresh-metadata]")){const screen=openAiProgress("UPDATING MOVIE ARCHIVE","BUILDING THE INCOMPLETE MOVIE QUEUE…","Exact-title matches only. Existing files, ownership, watch status, ratings, and approved artwork are preserved.");try{const result=await refreshMovieMetadata({onChanged:draw,onProgress:value=>screen.update(value)});draw();if(result.artworkQueued){showArtworkApprovalQueue();return toast("MOVIE POSTERS READY FOR REVIEW",`${result.artworkQueued} poster${result.artworkQueued===1?" is":"s are"} waiting for approval.`,9000)}return screen.finish("MOVIE LOOKUP COMPLETE",`${result.updated} updated · ${result.unresolved} unresolved · ${result.failed} unavailable · ${result.skipped} already current.`)}catch(error){return screen.fail(error.message)}}
    const moviePlannedPage=event.target.closest("[data-movie-planned-page]")?.dataset.moviePlannedPage;if(moviePlannedPage){setMoviePlannedPage(moviePlannedPage);draw();return}
    const movieGenre=event.target.closest("[data-movie-genre]")?.dataset.movieGenre;if(movieGenre){setMoviePreference("genre",movieGenre);return navigate("movies")}
    const openMovieCollection=event.target.closest("[data-open-movie-collection]")?.dataset.openMovieCollection;if(openMovieCollection)return navigate(`movies/collection/${encodeURIComponent(openMovieCollection)}`);
    const openMovie=event.target.closest("[data-open-movie]")?.dataset.openMovie;if(openMovie)return navigate(`movies/${encodeURIComponent(openMovie)}`);
    if(event.target.closest("[data-movie-back]"))return navigate("movies");
    const moviePlay=event.target.closest("[data-movie-play]")?.dataset.moviePlay;if(moviePlay)return openMoviePlayer(moviePlay,draw);
    const movieFavorite=event.target.closest("[data-movie-favorite]")?.dataset.movieFavorite;if(movieFavorite){const favorite=toggleMovieFavorite(movieFavorite);draw();return toast(favorite?"ADDED TO FAVORITES":"REMOVED FROM FAVORITES",getState().items[movieFavorite]?.title||"Movie")}
    const movieStatus=event.target.closest("[data-movie-status]");if(movieStatus){setMovieStatus(movieStatus.dataset.movieId,movieStatus.dataset.movieStatus);draw();return}
    const movieRating=event.target.closest("[data-movie-rating]");if(movieRating){setMovieRating(movieRating.dataset.movieId,movieRating.dataset.movieRating);draw();return toast("MOVIE RATING SAVED",`${movieRating.dataset.movieRating}/10 · ${(getState().preferences.dailyDriver?.movieProfile||"you").toUpperCase()}`)}
    const moviePref=event.target.closest("[data-movie-pref]");if(moviePref){setMoviePreference(moviePref.dataset.moviePref,moviePref.value||moviePref.dataset.movieValue);return draw()}
    if(event.target.closest("[data-music-connect]"))return connectSpotify(draw);
    if(event.target.closest("[data-podcast-choose]"))return chooseSpotifyPodcasts(draw);
    if(event.target.closest("[data-podcast-history-import]")){const screen=openAiProgress("IMPORTING PODCAST HISTORY","READING + MATCHING SPOTIFY EXPORT…","Creating every show card, resolving official Spotify artwork, then verifying the saved library.");try{const result=await importAllPodcastHistory(draw);return screen.finish("PODCAST HISTORY RESTORED",`${result.savedShows} shows saved · ${result.withArtwork} with artwork · ${result.episodes.toLocaleString()} episodes · ${Math.round(result.totalListeningMs/360000)/10} listening hours.`)}catch(error){return screen.fail(error.message)}}
    if(event.target.closest("[data-podcast-refresh]")){const screen=openAiProgress("REFRESHING PODCASTS","CHECKING TRACKED SPOTIFY SHOWS…","Loading the last month of episodes and current Spotify playback positions.");try{const result=await refreshPodcasts(draw);return screen.finish("PODCASTS UPDATED",`${result.checked} shows checked · ${result.newCount} new episodes.`)}catch(error){return screen.fail(error.message)}}
    const podcastOpen=event.target.closest("[data-podcast-open]")?.dataset.podcastOpen;if(podcastOpen){activePodcast=podcastOpen;draw();return}
    if(event.target.closest("[data-podcast-back]")){activePodcast="";draw();return}
    const podcastPlay=event.target.closest("[data-podcast-play]");if(podcastPlay)return openPodcastEpisode(podcastPlay.dataset.podcastId,podcastPlay.dataset.podcastPlay);
    const podcastWatch=event.target.closest("[data-podcast-watch]");if(podcastWatch){markPodcastEpisode(podcastWatch.dataset.podcastId,podcastWatch.dataset.podcastWatch);draw();return}
    if(event.target.closest("[data-music-disconnect]"))return openModal({title:"DISCONNECT SPOTIFY",body:"<p>Your imported Music library and listening totals will stay intact. Only the private Spotify access token will be removed.</p>",actions:[{label:"DISCONNECT",primary:true,handler:async()=>{try{await disconnectSpotify(draw);closeModal();toast("SPOTIFY DISCONNECTED","Your Music archive was preserved.")}catch(error){toast("DISCONNECT FAILED",error.message)}}}]});
      if(event.target.closest("[data-music-refresh]")){const screen=openAiProgress("REFRESHING SPOTIFY","REQUESTING RECENT PLAYS…","This is manual and read-only. Previously collected plays will not be counted twice.");try{const result=await refreshSpotifyRecent({onChanged:draw,onProgress:value=>screen.update({phase:value.phase,current:value.current,total:value.total})});draw();return screen.finish("SPOTIFY REFRESH COMPLETE",`${result.added} new plays · ${result.duplicates} already collected · ${result.tracks} songs updated.`)}catch(error){return screen.fail("Reconnect Spotify and try again. "+error.message)}}
      if(event.target.closest("[data-music-metadata]")){const screen=openAiProgress("FILLING MUSIC DETAILS","BUILDING THE COMPLETE BLANK-ALBUM QUEUE…","The Vault will continue through every unresolved Spotify album in this run. Completed albums are remembered, and approved covers are reused across matching songs.");try{const result=await enrichSpotifyLibrary({onProgress:value=>screen.update(value)});draw();if(result.pending){showArtworkApprovalQueue();return toast("MUSIC ARTWORK READY TO APPLY",`${result.pending} cover choice${result.pending===1?"":"s"} waiting. Use Verify All Artwork to fill the matching cards.`)}const heading=result.eligible?"COMPLETE MUSIC ARTWORK PASS FINISHED":result.remaining?"MUSIC ARTWORK STILL UNRESOLVED":"MUSIC ARTWORK CURRENT";return screen.finish(heading,`${result.updated} albums checked · ${result.queued} new cover choices queued · ${result.remaining} blank albums remain · ${result.failed} unavailable · ${result.reused} approved covers reused.`)}catch(error){return screen.fail(error.message)}}
      if(event.target.closest("[data-music-import]")){let screen=openAiProgress("IMPORTING SPOTIFY HISTORY","WAITING FOR SPOTIFY JSON FILES…","Choose one or every Spotify Basic or Extended Streaming History file. Nothing changes until you approve the preview.");const clean=()=>{window.removeEventListener("vault:spotify-import-started",start);window.removeEventListener("vault:spotify-import-complete",finish);window.removeEventListener("vault:spotify-import-error",fail);window.removeEventListener("vault:spotify-import-cancelled",cancel)},start=event=>{screen=openAiProgress("IMPORTING SPOTIFY HISTORY","CREATING PROTECTED RECOVERY SNAPSHOT…",`${event.detail.rows.toLocaleString()} records across ${event.detail.files} file${event.detail.files===1?"":"s"}.`)},finish=event=>{clean();const result=event.detail;draw();screen.finish(result.alreadyImported?"SPOTIFY EXPORT ALREADY CURRENT":"SPOTIFY HISTORY SAVED — SAFE TO CLOSE",`${result.added.toLocaleString()} new music plays · ${result.duplicates.toLocaleString()} duplicates · ${result.podcastsSkipped.toLocaleString()} podcast records separated · ${result.rejected.toLocaleString()} malformed rows · ${result.tracks.toLocaleString()} songs updated${result.verification?.passed?" · totals verified":""}.`)},fail=event=>{clean();screen.fail(event.detail.message+" Re-select the same files to resume from the last saved batch.")},cancel=()=>{clean();closeModal();toast("SPOTIFY IMPORT CANCELLED","Nothing was changed.")};window.addEventListener("vault:spotify-import-started",start,{once:true});window.addEventListener("vault:spotify-import-complete",finish,{once:true});window.addEventListener("vault:spotify-import-error",fail,{once:true});window.addEventListener("vault:spotify-import-cancelled",cancel,{once:true});return openSpotifyHistoryImport(draw,value=>screen.update({phase:value.phase,detail:value.detail,current:value.current,total:value.total}))}
    if(event.target.closest("[data-youtube-history-details]")){const screen=openAiProgress("FILLING YOUTUBE WATCH DURATIONS","BUILDING THE ELIGIBLE VIDEO QUEUE…","Previously checked videos are remembered for thirty days.");try{const result=await enrichYouTubeHistoryDurations({onProgress:value=>screen.update({phase:"CHECKING VIDEO DETAILS…",detail:`${value.updated} updated · ${value.missing} unavailable`,current:value.processed,total:value.total})});draw();return screen.finish(result.eligible?"YOUTUBE DURATIONS UPDATED":"YOUTUBE DURATIONS ALREADY CURRENT",`${result.updated} updated · ${result.missing} unavailable · ${result.skipped} skipped as current.`)}catch(error){return screen.fail(error.message)}}
    if(event.target.closest("[data-youtube-history-import]"))return openYouTubeHistoryImport(draw);
    if(event.target.closest("[data-youtube-history]"))return navigate("youtube/history/month");
    if(event.target.closest("[data-youtube-history-back]"))return navigate(`youtube/history/${youtubeHistoryMode}`);
    const historyMode=event.target.closest("[data-youtube-history-mode]")?.dataset.youtubeHistoryMode,historyPeriod=event.target.closest("[data-youtube-history-period]")?.dataset.youtubeHistoryPeriod;if(historyPeriod)return navigate(`youtube/history/${historyMode||youtubeHistoryMode}/${encodeURIComponent(historyPeriod)}`);if(historyMode)return navigate(`youtube/history/${historyMode}`);
    if(event.target.closest("[data-music-back]"))return navigate("music");
    const openMusicAlbum=event.target.closest("[data-open-music-album]");if(openMusicAlbum)return navigate(`music/album/${encodeURIComponent(openMusicAlbum.dataset.musicArtist)}/${encodeURIComponent(openMusicAlbum.dataset.openMusicAlbum)}`);
    const openMusicArtist=event.target.closest("[data-open-music-artist]")?.dataset.openMusicArtist;if(openMusicArtist)return navigate(`music/artist/${encodeURIComponent(openMusicArtist)}`);
    const musicTrack=event.target.closest("[data-music-track]")?.dataset.musicTrack;if(musicTrack){const tracked=toggleMusicArtistTracked(musicTrack);draw();return toast(tracked?"NEW MUSIC TRACKING ON":"NEW MUSIC TRACKING PAUSED",musicTrack)}
    const musicHide=event.target.closest("[data-music-hide]")?.dataset.musicHide;if(musicHide){toggleMusicArtistHidden(musicHide);draw();return toast("ARTIST HIDDEN",`${musicHide} remains in listening history and can be restored later.`)}
    const albumFinished=event.target.closest("[data-music-album-finished]");if(albumFinished){const finished=toggleMusicAlbumFinished(albumFinished.dataset.musicArtist,albumFinished.dataset.musicAlbum);draw();return toast(finished?"ALBUM MARKED FINISHED":"ALBUM RETURNED TO IN PROGRESS",albumFinished.dataset.musicAlbum)}
    const expandArtist=event.target.closest("[data-music-expand]")?.dataset.musicExpand;if(expandArtist){const screen=openAiProgress("EXPANDING ARTIST CATALOGUE",`CHECKING ${expandArtist.toUpperCase()}…`,"The first check creates a baseline. Artwork waits for your approval.");try{const result=await refreshSpotifyArtistCatalog(expandArtist,{force:true,onProgress:value=>screen.update(value)});draw();return screen.finish("ARTIST CATALOGUE UPDATED",`${result.albums} releases found · ${result.newCount} genuinely new · ${result.queued} artwork choices queued.`)}catch(error){return screen.fail(error.message)}}
    if(event.target.closest("[data-music-releases]")){const screen=openAiProgress("CHECKING TRACKED ARTISTS","BUILDING TRACKED-ARTIST QUEUE…","Only releases added after each artist's first baseline count as new.");try{const result=await refreshTrackedMusicReleases({onProgress:value=>screen.update(value)});draw();return screen.finish("TRACKED RELEASES CHECKED",`${result.checked} artists checked · ${result.newCount} new releases · ${result.queued} artwork choices queued.`)}catch(error){return screen.fail(error.message)}}
    if(event.target.closest("[data-art-review-open]"))return showArtworkApprovalQueue();
    const readerOpen=event.target.closest("[data-reader-open]")?.dataset.readerOpen;if(readerOpen)return openEmbeddedReader(readerOpen,draw);
    if(event.target.closest("[data-reading-review]"))return showReadingScan();
    const readingFolderPath=event.target.closest("[data-reading-folder-path]")?.dataset.readingFolderPath;if(readingFolderPath){const path=prompt("Paste the full C: or D: folder path to scan:")?.trim();if(!path)return;const screen=openAiProgress("SCANNING SELECTED FOLDER","READING LOCAL FILE METADATA…",path);try{const result=await scanSelectedReadingFolder(readingFolderPath,{path,onProgress:value=>screen.update({phase:value.phase,detail:value.detail,current:value.current,total:value.total})});if(Number(result.fileCount||0)>0)return finishAutomaticReadingScan(result,result.folder);screen.finish("FOLDER SCAN COMPLETE",`No matching reading files were found in ${result.folder||path}.`)}catch(error){screen.fail(error.message)}return}
    const readingFolder=event.target.closest("[data-reading-folder]")?.dataset.readingFolder;if(readingFolder){const screen=openAiProgress("SELECT FOLDER TO SCAN","WAITING FOR FOLDER SELECTION…","Choose one folder. The scan is read-only and stays inside the current tab. If Windows hides the picker, use Enter Folder Path instead.");try{const result=await scanSelectedReadingFolder(readingFolder,{onProgress:value=>screen.update({phase:value.phase,detail:value.detail,current:value.current,total:value.total})});if(result.cancelled){closeModal();return toast("FOLDER SCAN CANCELLED","Nothing was changed.")}if(Number(result.fileCount||0)>0)return finishAutomaticReadingScan(result,result.folder);screen.finish("FOLDER SCAN COMPLETE",`No matching reading files were found in ${result.folder||"the selected folder"}.`)}catch(error){screen.fail(error.message)}return}
    if(event.target.closest("[data-project-add]"))return openProjectAdd(()=>draw());
    const projectEdit=event.target.closest("[data-project-edit]")?.dataset.projectEdit;
    if(projectEdit)return openProjectEditor(projectEdit,draw);
    if (await handleBooksAction(event, { draw, openProgress: openAiProgress })) return;
    if (await handleComicsAction(event, { draw, openProgress: openAiProgress })) return;
    const halloweenKind = event.target.closest("[data-halloween-kind]")?.dataset.halloweenKind;
    if (halloweenKind) { chooseHalloweenKind(halloweenKind); draw(); return; }
    if (event.target.closest("[data-halloween-reroll]")) { rerollHalloweenPick(); draw(); return; }
    if (event.target.closest("[data-halloween-skip]")) { skipHalloweenPick(); draw(); return; }
    const nav = event.target.closest("[data-route]")?.dataset.route;
    if (nav) return navigate(nav);
    if (event.target.closest("[data-home-weather-refresh]")) { await refreshHomeWeather({force:true}); await refreshHomeRadar({force:true}); draw(); return toast("WEATHER UPDATED","Forecast and radar refreshed."); }
    if (event.target.closest("[data-home-weather-open]")) return openWeatherCard(draw);
    if(event.target.closest("[data-youtube-missing-art]")){const before=Object.values(getState().items||{}).filter(item=>item.wing==="youtube"&&item.youtubeMeta&&!item.artwork).length,screen=openAiProgress("FINDING CHANNEL ARTWORK","CHECKING TRACKED YOUTUBE CHANNELS…",`Reviewing ${before} channel${before===1?"":"s"} without visible artwork. Every candidate waits for approval.`);try{await refreshYouTubeChannels({includeArtwork:true,batchSize:3});const after=Object.values(getState().items||{}).filter(item=>item.wing==="youtube"&&item.youtubeMeta&&!item.artwork).length;draw();return screen.finish("CHANNEL ART READY FOR REVIEW",`${Math.max(0,before-after)} already restored · ${after} still need artwork or approval.`)}catch(error){return screen.fail(error.message)}}
    const triviaAnswer=event.target.closest("[data-trivia-answer]");
    if (triviaAnswer) { const result=answerHomeTrivia(triviaAnswer.dataset.triviaQuestion,triviaAnswer.dataset.triviaAnswer); draw(); return result&&toast(result.correct?"CORRECT":"NOT THIS TIME",[result.correct?"":`Correct answer: ${result.answer}`,result.note].filter(Boolean).join(" — ")||"Trivia total updated.",7000); }
    if (event.target.closest("[data-trivia-refresh]")) { toast("WRITING NEW TRIVIA","Built from what your archive holds."); await refreshHomeTrivia({force:true}); return draw(); }
    if (event.target.closest("[data-trivia-game]")) return openTriviaGame();
    const lifeFocus = event.target.closest("[data-life-focus]")?.dataset.lifeFocus;
    if (lifeFocus) { toggleFocusDomain(lifeFocus); draw(); return toast("CURRENT FOCUS UPDATED", lifeFocus.toUpperCase()); }
      const lifePref = event.target.closest("[data-life-pref]");
      if (lifePref) { setLifePreference(lifePref.dataset.lifePref, lifePref.dataset.lifeValue); draw(); return; }
      const uiScale = event.target.closest("button[data-ui-scale]");
      if (uiScale) { const scale = shiftUiScale(uiScale.dataset.uiScale); draw(); return toast("INTERFACE SCALE UPDATED", `${scale}%`); }
    if (event.target.closest("[data-adaptive-refresh]")) {
      const readiness = getRecommendationReadiness();
      const aiWing = event.target.closest("[data-adaptive-refresh]")?.dataset.aiWing || route;
      const screen = openAiProgress("UPDATING HOME EDITION", readiness.enabled ? "ANALYZING YOUR VAULT ACTIVITY…" : "PREPARING OWNED-ONLY EDITION…", "The current cards stay in place until the refreshed edition is ready.");
      try {
        await refreshAdaptiveEditorial({ force: true });
        draw();
        return screen.finish(readiness.enabled ? `${aiWing.toUpperCase()} AI REFRESHED` : "OWNED-ONLY EDITION READY", readiness.enabled ? "The latest explicit activity shaped this Vault wing." : "Personalized recommendations remain locked until your new Vault activity provides enough evidence.");
      } catch (error) {
        return screen.fail(error.message || "The Home edition could not be refreshed. Nothing was changed.");
      }
    }
    const adaptivePin = event.target.closest("[data-adaptive-pin]");
    if (adaptivePin) { pinAdaptiveSection(adaptivePin.dataset.adaptivePin); draw(); return toast("HOME SHELF UPDATED", "Pinned shelves stay ahead of the changing edition."); }
    const adaptiveDismiss = event.target.closest("[data-adaptive-dismiss]");
    if (adaptiveDismiss) { dismissAdaptiveSection(adaptiveDismiss.dataset.adaptiveDismiss); draw(); return toast("HOME SHELF HIDDEN", "Reset Home personalization whenever you want it back."); }
    if (event.target.closest("[data-adaptive-toggle]")) { const next = !getAdaptiveHomePreferences().enabled; setAdaptiveHomeEnabled(next); draw(); return toast(next ? "ADAPTIVE HOME ON" : "ADAPTIVE HOME PAUSED", next ? "The edition can respond to your activity again." : "Your current Home stays stable and local."); }
    if (event.target.closest("[data-adaptive-reset]")) { resetAdaptiveHomePreferences(); draw(); return toast("HOME PERSONALIZATION RESET", "Hidden and pinned shelves returned to their defaults."); }
    if (event.target.closest("[data-life-library-check]")) {
      const button = event.target.closest("[data-life-library-check]"); button.disabled = true; button.textContent = "CHECKING D:…";
      try { const pulse = await runLibraryAwareness(); draw(); return toast("LIBRARY PULSE UPDATED", `${pulse.fileCount} TV files observed without changing media.`); }
      catch (error) { button.disabled = false; button.textContent = "CHECK LIBRARY"; return toast("LIBRARY CHECK UNAVAILABLE", error.message, 6000); }
    }
    if (event.target.closest("[data-life-transfer]")) { markDeviceTransfer(); exportArchive("vault-device-copy"); draw(); return toast("DEVICE COPY PREPARED", "A complete portable archive was downloaded."); }
    const playbackRating = event.target.closest("[data-playback-rating]");
    if (playbackRating) { ratePlaybackSession(playbackRating.dataset.playbackSession, playbackRating.dataset.playbackRating); draw(); return toast("EPISODE RATING FILED", `${playbackRating.dataset.playbackRating}/10`); }
    const playbackDecision = event.target.closest("[data-playback-decision]");
    if (playbackDecision) { const result = resolvePlaybackSession(playbackDecision.dataset.playbackSession, playbackDecision.dataset.playbackDecision); draw(); return toast(result?.status === "finished" ? "EPISODE FINISHED" : "LEFT UNFINISHED", result?.showTitle || "Playback follow-up updated"); }
    const livingPlay = event.target.closest("[data-living-play]");
    if (livingPlay) return openEpisodePath(livingPlay.dataset.mediaPath, livingPlay.dataset.showId, livingPlay.dataset.episodeId);
    if (event.target.closest("[data-couch-mode]")) {
      document.body.classList.toggle("couch-mode");
      if (document.body.classList.contains("couch-mode")) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      draw(); return;
    }
    const recordBack = event.target.closest("[data-record-back]")?.dataset.recordBack;
    if (recordBack) { if (window.history.length > 1) window.history.back(); else navigate(recordBack); return; }
    if (event.target.closest("[data-record-copy]")) {
      try { await navigator.clipboard.writeText(window.location.href); return toast("LINK COPIED", "This record can be opened directly."); }
      catch { return toast("COPY BLOCKED", "Select the address bar and copy the record link from there."); }
    }
    const recordRating = event.target.closest("[data-record-rating]");
    if (recordRating) {
      const value = setUniversalRecordRating(recordRating.dataset.recordId || routeContext.segments?.[0], recordRating.dataset.recordRating);
      draw();
      return toast("RATING FILED", value ? `${value}/10` : "Record unchanged");
    }
    const recordFavorite = event.target.closest("[data-record-favorite]")?.dataset.recordFavorite;
    if (recordFavorite) {
      const value = toggleUniversalRecordFavorite(recordFavorite);
      draw();
      return toast(value ? "ADDED TO FAVORITES" : "REMOVED FROM FAVORITES", getState().items[recordFavorite]?.title || "Record");
    }
    const recordStatus = event.target.closest("[data-record-status]");
    if (recordStatus) {
      const value = setUniversalRecordStatus(recordStatus.dataset.recordId || routeContext.segments?.[0], recordStatus.dataset.recordStatus);
      draw();
      return toast("STATUS UPDATED", String(value || "unchanged").replaceAll("_", " ").toUpperCase());
    }
    if (event.target.closest("[data-calibration-start]")) {
      const session = startCalibrationSession({ force: true });
      draw();
      return toast("CALIBRATION ROUND READY", `${session.pairs.length} comparisons prepared.`);
    }
    const calibrationChoice = event.target.closest("[data-calibration-choice]")?.dataset.calibrationChoice;
    if (calibrationChoice) {
      const result = recordCalibrationChoice(calibrationChoice);
      draw();
      return toast("TASTE SIGNAL FILED", result ? calibrationChoice.toUpperCase() : "No pending comparison.");
    }
    if (event.target.closest("[data-calibration-undo]")) {
      const result = undoLastCalibrationChoice();
      draw();
      return toast(result ? "LAST TASTE CHOICE UNDONE" : "NOTHING TO UNDO", result?.choice?.toUpperCase?.() || "");
    }
    const timelineFilter = event.target.closest("[data-timeline-filter]");
    if (timelineFilter) {
      setTimelineFilter(timelineFilter.dataset.timelineFilter, timelineFilter.dataset.timelineValue);
      draw();
      return;
    }
    if (event.target.closest("[data-host-run]")) {
      const result = runBackgroundCare({ source: "manual" });
      draw();
      return toast(result.outcome === "passed" ? "BACKGROUND CARE PASSED" : "BACKGROUND CARE NEEDS ATTENTION", `${result.checks} checks · ${result.mutations} mutation${result.mutations === 1 ? "" : "s"}`);
    }
    const hostToggle = event.target.closest("[data-host-toggle]")?.dataset.hostToggle;
    if (hostToggle) {
      setBackgroundCareEnabled(hostToggle === "on");
      draw();
      return toast(hostToggle === "on" ? "BACKGROUND CARE RESUMED" : "BACKGROUND CARE PAUSED", "The visible run ledger is preserved.");
    }
    const hostCadence = event.target.closest("[data-host-cadence]")?.dataset.hostCadence;
    if (hostCadence) {
      const value = setBackgroundCareCadence(hostCadence);
      draw();
      return toast("CARE CADENCE UPDATED", `${value} minutes while the Vault is open.`);
    }
    const sessionPref = event.target.closest("[data-session-pref]");
    if (sessionPref) { setSessionPreference(sessionPref.dataset.sessionPref, sessionPref.dataset.sessionValue); draw(); return; }
    if (event.target.closest("[data-session-create]")) { const plan = createSessionPlan(); draw(); return toast("SESSION DRAFT PREPARED", `${plan.plannedMinutes} minutes / ${plan.entries.length} grounded picks`); }
    const sessionAction = event.target.closest("[data-session-action]")?.dataset.sessionAction;
    if (sessionAction) { const result = updateSessionStatus(sessionAction); draw(); return toast(result ? `SESSION ${result.status.toUpperCase()}` : "SESSION UNCHANGED", "Media progress was not altered."); }
    const companionToggle = event.target.closest("[data-companion-toggle]")?.dataset.companionToggle;
    if (companionToggle) { setPersonalAutopilotEnabled(companionToggle === "on"); if (companionToggle === "on") ensurePersonalAutopilot(); draw(); return toast("VAULT ASSISTANT UPDATED", companionToggle === "on" ? "Suggestions enabled." : "Suggestions paused."); }
    if (event.target.closest("[data-companion-generate]")) { ensurePersonalAutopilot({ force: true, source: "manual" }); draw(); return toast("NEW DRY RUN PREPARED", "Every action is still pending approval."); }
    const companionAction = event.target.closest("[data-companion-action]");
    if (companionAction) { const result = resolveAutopilotAction(companionAction.dataset.companionProposal, companionAction.dataset.companionActionId, companionAction.dataset.companionAction); draw(); return toast(result?.status === "applied" ? "APPROVED ACTION APPLIED" : result?.status === "rejected" ? "ACTION REJECTED" : "ACTION UNCHANGED", "The supervised ledger was updated."); }
    const companionAll = event.target.closest("[data-companion-all]");
    if (companionAll) { const results = resolveAutopilotProposal(companionAll.dataset.companionProposal, companionAll.dataset.companionAll); draw(); return toast("PROPOSAL RESOLVED", `${results.length} pending actions received your decision.`); }
    const deskFeedback = event.target.closest("[data-desk-feedback]");
    if (deskFeedback) {
      const action = deskFeedback.dataset.deskFeedback, itemId = deskFeedback.dataset.deskItem;
      const recorded = recordDailyDeskFeedback(itemId, action);
      draw();
      return toast("DAILY DESK UPDATED", `${getState().items[itemId]?.title || "Record"} // ${String(recorded || action).toUpperCase()}`);
    }
    const deskMode = event.target.closest("[data-desk-mode]")?.dataset.deskMode;
    if (deskMode) { setDailyDeskMode(deskMode); draw(); return toast("DESK MODE CHANGED", deskMode.toUpperCase()); }
    if (event.target.closest("[data-desk-refresh]")) { rotateDailyDesk(); draw(); return toast("NEW ROTATION PREPARED", "The current plan remains in the local ledger."); }
    const collection = event.target.closest("[data-open-library-collection]")?.dataset.openLibraryCollection;
    if (collection) return navigate(`${route}/collection/${encodeURIComponent(collection)}`);
    const libraryItem = event.target.closest("[data-open-library-item]")?.dataset.openLibraryItem;
    if (libraryItem) return navigate(`record/${encodeURIComponent(libraryItem)}`);
    if (event.target.closest("[data-library-back]")) return navigate(route);
    if (event.target.closest("[data-youtube-account]")) { openYouTubeAccount(); return toast("YOUTUBE OPENED","Sign in with Google in your browser. The Vault never stores your password."); }
    if (event.target.closest("[data-youtube-connect]")) return connectGoogleYouTube(draw);
    if (event.target.closest("[data-youtube-subscriptions]")) return openGoogleSubscriptionPicker(draw);
    if (event.target.closest("[data-youtube-disconnect]")) return openModal({title:"DISCONNECT GOOGLE / YOUTUBE",body:"<p>This removes The Vault's local Google token. Your tracked channel cards and watch states remain untouched, and nothing changes in your Google account.</p>",actions:[{label:"DISCONNECT",primary:true,handler:async()=>{closeModal();await disconnectGoogleYouTube(draw);toast("GOOGLE DISCONNECTED","Public channel tracking remains available.")}}]});
    if (event.target.closest("[data-youtube-add]")) return openYouTubeAddDialog((itemId,duplicate)=>{draw();toast(duplicate?"ALREADY TRACKED":"CHANNEL TRACKING STARTED",getState().items[itemId]?.title||"YouTube channel")});
    if (event.target.closest("[data-youtube-import]")) return openYouTubeSubscriptionImport(draw);
    const openYouTube=event.target.closest("[data-open-youtube]")?.dataset.openYoutube;
    if(openYouTube)return navigate(`youtube/${encodeURIComponent(openYouTube)}`);
    if(event.target.closest("[data-youtube-back]"))return navigate("youtube");
    const youtubeExternal=event.target.closest("[data-youtube-external]")?.dataset.youtubeExternal;
    if(youtubeExternal){if(openYouTubeChannel(youtubeExternal))return toast("CHANNEL OPENED",getState().items[youtubeExternal]?.title||"YouTube");return toast("CHANNEL LINK MISSING","This channel needs a valid YouTube link.");}
    const youtubeArtwork=event.target.closest("[data-youtube-artwork]")?.dataset.youtubeArtwork;
    if(youtubeArtwork)return openYouTubeArtworkDialog(youtubeArtwork,draw);
    const youtubeVideo=event.target.closest("[data-youtube-video]");
    if(youtubeVideo){const opened=openYouTubeVideo(youtubeVideo.dataset.youtubeId,youtubeVideo.dataset.youtubeVideo);draw();return toast(opened?"VIDEO OPENED":"VIDEO UNAVAILABLE",opened?"Marked watched and opened in Chrome.":"The upload appears to be deleted or private.");}
    const youtubeUploadWatch=event.target.closest("[data-youtube-upload-watch]");
    if(youtubeUploadWatch){markYouTubeUploadWatched(youtubeUploadWatch.dataset.youtubeId,youtubeUploadWatch.dataset.youtubeUploadWatch,youtubeUploadWatch.dataset.youtubeWatchValue==="true");draw();return toast("WATCHED STATE UPDATED","Your new-upload count has been updated.");}
    const youtubeState=event.target.closest("[data-youtube-state]");
    if(youtubeState){setYouTubeChannelState(youtubeState.dataset.youtubeId,youtubeState.dataset.youtubeState);draw();return toast("TRACKING UPDATED",youtubeState.dataset.youtubeState.toUpperCase());}
    const youtubeWatched=event.target.closest("[data-youtube-watched]")?.dataset.youtubeWatched;
    if(youtubeWatched){markYouTubeChannelWatched(youtubeWatched);draw();return toast("UPLOADS MARKED WATCHED",getState().items[youtubeWatched]?.title||"Channel");}
    const youtubePref=event.target.closest("[data-youtube-pref]");
    if(youtubePref){setYouTubePreference(youtubePref.dataset.youtubePref,youtubePref.dataset.youtubeValue);return draw();}
    if(event.target.closest("[data-youtube-refresh]")){const screen=openAiProgress("REFRESHING YOUTUBE","CHECKING ONLY YOUR TRACKED CHANNELS…","Looking for new long-form uploads and familiar channel artwork.");try{const result=await refreshYouTubeChannels();draw();return screen.finish(result.checked?"YOUTUBE REFRESH COMPLETE":"CHANNEL IDS NEEDED",result.checked?`${result.checked} channels checked · ${result.newUploads} new uploads.`:"Re-add older manual channels once to enable public update checks.")}catch(error){return screen.fail(error.message)}}
    const editRecord = event.target.closest("[data-workbench-edit]")?.dataset.workbenchEdit;
    if (editRecord) return openWorkbenchEditor(editRecord);
    const undoChange = event.target.closest("[data-workbench-undo]")?.dataset.workbenchUndo;
    if (undoChange) return undoWorkbenchEdit(undoChange);
    const batchAction = event.target.closest("[data-workbench-batch]")?.dataset.workbenchBatch;
    if (batchAction) return runWorkbenchBatch(batchAction);
    const accept = event.target.closest("[data-review-accept]")?.dataset.reviewAccept;
    if (accept) return reviewCandidate(accept, true);
    const reject = event.target.closest("[data-review-reject]")?.dataset.reviewReject;
    if (reject) return reviewCandidate(reject, false);
    const recovery = event.target.closest("[data-recovery-action]");
    if (recovery) return reviewRecoveryCandidate(recovery.dataset.recoveryId, recovery.dataset.recoveryAction);
    if (event.target.closest("[data-snapshot-create]")) return createSnapshotFromUi();
    if (event.target.closest("[data-snapshot-manager]")) return showSnapshotManager();
    const card = event.target.closest("[data-item-id]");
    if (card) {
      const rating = event.target.closest("[data-rating]")?.dataset.rating;
      if (rating) {
        update(save => { save.items[card.dataset.itemId].rating = Number(rating); });
        emit("ITEM_RATED", { itemId: card.dataset.itemId });
        return draw();
      }
    }
    if (event.target.closest("[data-export]")) return exportArchive();
    if (event.target.closest("[data-import]")) return document.querySelector("#import-input").click();
    if (event.target.closest("[data-health]")) return showHealth();
    if (event.target.closest("[data-command]")) return commands();
    if (event.target.closest("[data-removed-cards]")) return openRemoveCardsDialog([], "REMOVED CARDS", draw);
    if (event.target.closest("[data-missing-file-review]")) return navigate("relink");
    if (event.target.closest("[data-artwork-review]")) return showArtworkApprovalQueue();
    if (event.target.closest("[data-master-sort]")) {
      // Sorting costs an AI call per 40 files, so a run is bounded rather than
      // firing ninety calls at a queue of thousands. Press it again to continue.
      const SORT_RUN = 200;
      const screen = openAiProgress("SORTING WHAT THE SCAN FOUND", "ASKING THE VAULT'S AI WHERE THESE BELONG…", `Up to ${SORT_RUN} files this run. Books and comics are filed from the file's own metadata. Television and film are only linked to records you already have. Everything else waits for you.`);
      return sortMasterScanFiles({ limit: SORT_RUN, onProgress: value => screen.update({ phase: value.phase, detail: value.detail, current: value.current, total: value.total }) })
        .then(result => {
          draw();
          const left = masterScanSummary()?.pendingReview || 0;
          screen.finish("SORTING COMPLETE",
            `${result.identified} identified · ${result.filedBooks} books and ${result.filedComics} comics filed · ${result.linkedEpisodes} episodes and ${result.linkedFilms} films linked · ${result.stagedGames} games staged for import · ${result.ignored} set aside as extras · ${result.suggested} waiting for your call.${left ? ` ${left} files still unsorted — run it again to continue.` : ""}`);
        })
        .catch(error => screen.fail(error.message));
    }
    if (event.target.closest("[data-rabbit-again]")) return refreshRabbitHole();
    const foodRoll = event.target.closest("[data-food-roll]")?.dataset.foodRoll;
    if (foodRoll) return rollFoodCurio(foodRoll);
    if (event.target.closest("[data-open-fridge]")) return navigate("food/fridge");
    const fridgeTab = event.target.closest("[data-fridge-tab]")?.dataset.fridgeTab;
    if (fridgeTab) return setFridgeTab(fridgeTab);
    if (event.target.closest("[data-fridge-suggest]")) return suggestFromFridge();
    if (event.target.closest("[data-pending-confirm]")) {
      const filed = confirmPending(syncPending());
      draw();
      const parts = [
        filed.food && `${filed.food} to the fridge`,
        filed.supplies && `${filed.supplies} to supplies`,
        filed.medicine && `${filed.medicine} to medicine`,
        filed.other && `${filed.other} to purchases`,
      ].filter(Boolean);
      return toast("RECEIPT FILED", parts.join(" · ") || "Nothing to file.");
    }
    if (event.target.closest("[data-pending-discard]")) { discardPending(); return; }
    const dropIndex = event.target.closest("[data-pending-drop]")?.dataset.pendingDrop;
    if (dropIndex !== undefined) { syncPending(); dropPending(Number(dropIndex)); return; }
    const supplyOut = event.target.closest("[data-supply-out]")?.dataset.supplyOut;
    if (supplyOut) { closeSupply(supplyOut); draw(); return toast("MARKED OUT", "It'll show as due to re-buy."); }
    const supplyBack = event.target.closest("[data-supply-restock]")?.dataset.supplyRestock;
    if (supplyBack) { restockSupply(supplyBack); draw(); return; }
    if (event.target.closest("[data-open-household]")) return navigate("food/fridge");
    const used = event.target.closest("[data-pantry-used]")?.dataset.pantryUsed;
    if (used) { closePantryItem(used, "used"); draw(); return; }
    const binned = event.target.closest("[data-pantry-binned]")?.dataset.pantryBinned;
    if (binned) { closePantryItem(binned, "binned"); draw(); return; }
    const restored = event.target.closest("[data-pantry-restore]")?.dataset.pantryRestore;
    if (restored) { restorePantryItem(restored); draw(); return; }
    const foodDayStep = event.target.closest("[data-food-day]")?.dataset.foodDay;
    if (foodDayStep) { shiftFoodDate(Number(foodDayStep)); draw(); return; }
    const addMeal = event.target.closest("[data-food-add]")?.dataset.foodAdd;
    if (addMeal) return openFoodLogger({ meal: addMeal, date: foodViewDate(), onDone: draw });
    if (event.target.closest("[data-food-scan]")) return openFoodLogger({ mode: "barcode", date: foodViewDate(), onDone: draw });
    const removeMeal = event.target.closest("[data-food-remove]")?.dataset.foodRemove;
    if (removeMeal) { removeLogEntry(removeMeal); draw(); return; }
    const water = event.target.closest("[data-food-water]")?.dataset.foodWater;
    if (water) { addWater(Number(water), foodViewDate()); draw(); return; }
    const plate = event.target.closest("[data-plate-toggle]");
    if (plate) { markPlate(plate.dataset.plateToggle, plate.getAttribute("aria-pressed") !== "true"); draw(); return; }
    if (event.target.closest("[data-food-goals]")) {
      const goals = foodGoals();
      return openModal({
        title: "DAILY GOALS",
        body: ["kcal", "protein", "carbs", "fat", "water"].map(key =>
          `<label class="field"><span>${key.toUpperCase()}${key === "water" ? " (ml)" : key === "kcal" ? "" : " (g)"}</span>
           <input data-goal="${key}" type="number" min="0" value="${goals[key]}"></label>`).join(""),
        actions: [{ label: "SAVE", primary: true, handler: () => {
          const next = {};
          document.querySelectorAll("[data-goal]").forEach(input => { next[input.dataset.goal] = input.value; });
          setFoodGoals(next); closeModal(); draw(); toast("GOALS SAVED", `${next.kcal} kcal a day`);
        } }]
      });
    }
    if (event.target.closest("[data-food-weight]")) {
      return openModal({
        title: "WEIGH IN",
        body: `<label class="field"><span>WEIGHT</span><input data-weight type="number" step="0.1" min="0" placeholder="0.0"></label>
               <label class="field"><span>UNIT</span><select data-weight-unit><option value="lb">lb</option><option value="kg">kg</option></select></label>`,
        actions: [{ label: "RECORD", primary: true, handler: () => {
          const value = document.querySelector("[data-weight]")?.value;
          const unit = document.querySelector("[data-weight-unit]")?.value || "lb";
          if (!logWeight(value, unit, foodViewDate())) return toast("NOT RECORDED", "A number is needed.");
          closeModal(); draw(); toast("WEIGHT RECORDED", `${value} ${unit}`);
        } }]
      });
    }
    const again = event.target.closest("[data-food-again]");
    if (again) return openFoodLogger({ meal: "snack", date: foodViewDate(), prefill: again.dataset.foodAgain, grams: Number(again.dataset.grams) || 100, onDone: draw });
    if (event.target.closest("[data-play-reroll]")) { rerollPlaySomething(); draw(); return; }
    const playEpisode = event.target.closest("[data-play-episode]");
    if (playEpisode) { openTvPlayer(playEpisode.dataset.showId, playEpisode.dataset.episodeId, draw); return; }
    const countdownRemove = event.target.closest("[data-countdown-remove]")?.dataset.countdownRemove;
    if (countdownRemove) { removeCountdown(countdownRemove); draw(); return; }
    if (event.target.closest("[data-countdown-add]")) {
      return openModal({
        title: "ADD A COUNTDOWN",
        body: `<label class="field"><span>WHAT</span><input data-countdown-label maxlength="80" placeholder="Something worth waiting for"></label>
               <label class="field"><span>WHEN</span><input data-countdown-date type="date"></label>`,
        actions: [{
          label: "ADD", primary: true, handler: () => {
            const label = document.querySelector("[data-countdown-label]")?.value;
            const date = document.querySelector("[data-countdown-date]")?.value;
            if (!addCountdown(label, date)) return toast("NOT ADDED", "A name and a date are both needed.");
            closeModal(); draw(); toast("COUNTDOWN ADDED", label);
          }
        }]
      });
    }
    const homeContinue = event.target.closest("[data-home-continue]");
    if (homeContinue) {
      // Straight to the record, in whichever room it lives in.
      const wing = homeContinue.dataset.wing, itemId = homeContinue.dataset.homeContinue;
      return navigate(wing === "tv" ? `tv/${encodeURIComponent(itemId)}` : `${wing}/${encodeURIComponent(itemId)}`);
    }
    if (event.target.closest("[data-master-suggestions]")) return showMasterScanSuggestions();
    if (event.target.closest("[data-master-scan]")) {
      const screen = openAiProgress("SCAN D: DRIVE", "READING D:…", "Read only. The Vault remembers what it finds, so later scans only look at what changed.");
      return runMasterScan({ onProgress: value => screen.update({ phase: value.phase, detail: value.detail, total: value.total }) })
        .then(result => {
          draw();
          const parts = [`${result.fileCount.toLocaleString()} files`, `${result.added} new`, `${result.moved} moved`, `${result.removed} missing`];
          if (result.repointed) parts.push(`${result.repointed} links followed`);
          if (result.flagged) parts.push(`${result.flagged} flagged missing`);
          screen.finish(result.firstRun ? "FIRST SCAN REMEMBERED" : "SCAN COMPLETE",
            `${parts.join(" · ")}. ${result.needsSorting} new files are waiting to be sorted.`);
        })
        .catch(error => screen.fail(error.message));
    }
    // The shelf switch is a pair of buttons, not a select, so it is handled here.
    const musicShelf=event.target.closest("[data-music-select][data-music-value]");
    if(musicShelf){setMusicPreference(musicShelf.dataset.musicSelect,musicShelf.dataset.musicValue);return draw()}
    if(event.target.closest("[data-music-show-more]")){showMoreMusic();return draw()}
    if (event.target.closest('[data-action="discover"]')) return showDiscovery();
  };
  // Wing-level search. The shell has no global search field, so a wing renders its
  // own box and this keeps the caret in place while the wing redraws on each keystroke.
  document.addEventListener("input", event => { handleTriviaGameInput(event); });
  document.addEventListener("click", event => { handleTriviaGameAction(event); });
  view.oninput = event => {
    const field = event.target.closest("[data-wing-search]");
    if (!field) return;
    const caret = field.selectionStart;
    search.value = field.value;
    draw();
    const restored = view.querySelector("[data-wing-search]");
    if (!restored) return;
    restored.focus();
    try { restored.setSelectionRange(caret, caret); } catch {}
  };
  view.onchange = event => {
    const projectStatus=event.target.closest("[data-project-status]");if(projectStatus){setProjectStatus(projectStatus.dataset.projectStatus,projectStatus.value);return draw()}
    const musicSelect=event.target.closest("[data-music-select]");if(musicSelect){setMusicPreference(musicSelect.dataset.musicSelect,musicSelect.value);return draw()}
    const youtubeSelect = event.target.closest("[data-youtube-select]");
    if (youtubeSelect) { setYouTubePreference(youtubeSelect.dataset.youtubeSelect,youtubeSelect.value); return draw(); }
    if (handleComicsChange(event, draw)) return;
    if (handleTvChange(event, draw)) return;
    if (handleTripsChange(event, draw)) return;
    const filter = event.target.closest("[data-workbench-filter]");
    if (filter) { setWorkbenchFilter(filter.dataset.workbenchFilter, filter.value); return draw(); }
    const review = event.target.closest("[data-workbench-review-select]");
    if (review) { toggleWorkbenchReview(review.dataset.workbenchReviewSelect, review.checked); return draw(); }
  };
}

async function openEpisodeFile(fileUrl, showId, episodeId) {
  const parsed = new URL(fileUrl);
  const path = decodeURIComponent(parsed.pathname.replace(/^\/([a-z]:)/i, "$1")).replaceAll("/", "\\");
  return openEpisodePath(path, showId, episodeId);
}

async function openEpisodePath(path, showId, episodeId) {
  try {
    const response = await fetch("./__vault/open", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": "open-episode" },
      body: JSON.stringify({ path })
    });
    if (!response.ok) throw new Error(`Launcher returned ${response.status}.`);
    if (showId && episodeId) { beginPlaybackSession(showId, episodeId, path); recordEpisodePlayback(showId, episodeId); }
    toast("EPISODE OPENED", path.split("\\").pop());
  } catch {
    toast("EPISODE COULD NOT OPEN", "Restart The Vault with its local launcher, then try again.", 6000);
  }
}

function openWorkbenchEditor(itemId) {
  const item = getWorkbenchRecord(itemId);
  if (!item) return toast("RECORD NOT FOUND", itemId);
  const currentArtwork = typeof item.artwork === "string" ? item.artwork : item.artwork?.localPath || item.artwork?.url || "";
  openModal({
    title: `EDIT ARCHIVE FILE`,
    body: `<div class="workbench-editor">
      ${currentArtwork ? `<img data-wb-preview alt="Current artwork">` : ""}
      <label>IMMUTABLE VAULT ID</label><code>${item.id}</code>
      <label>TITLE</label><input data-wb-title>
      <label>YEAR</label><input data-wb-year type="number" min="1800" max="2200">
      <label>GENRES — SEPARATE WITH COMMAS</label><input data-wb-genres>
      <label>ARCHIVE DESCRIPTION</label><textarea data-wb-description rows="4"></textarea>
      <label>PERSONAL FIELD NOTE</label><textarea data-wb-note rows="4"></textarea>
      <label class="workbench-editor__owned"><input data-wb-owned type="checkbox"> OWNED / IN COLLECTION</label>
      <label>LOCAL POSTER — JPG, PNG, OR WEBP; MAX 8 MB</label><input data-wb-artwork type="file" accept="image/jpeg,image/png,image/webp">
    </div>`,
    actions: [{
      label: "FILE CHANGES",
      primary: true,
      async handler(modal) {
        try {
          const title = modal.querySelector("[data-wb-title]").value.trim();
          if (!title) throw new Error("A record must have a title.");
          let artwork = item.artwork;
          const file = modal.querySelector("[data-wb-artwork]").files[0];
          if (file) artwork = (await uploadWorkbenchArtwork(item.id, file)).path;
          const rawYear = modal.querySelector("[data-wb-year]").value.trim();
          const changeId = updateWorkbenchRecord(item.id, {
            title,
            year: rawYear ? Number(rawYear) : null,
            genres: modal.querySelector("[data-wb-genres]").value.split(",").map(value => value.trim()).filter(Boolean),
            description: modal.querySelector("[data-wb-description]").value.trim(),
            note: modal.querySelector("[data-wb-note]").value.trim(),
            owned: modal.querySelector("[data-wb-owned]").checked,
            artwork
          });
          closeModal();
          draw();
          toast(changeId ? "ARCHIVE FILE UPDATED" : "NO CHANGES DETECTED", item.title);
          if (changeId) emit("ITEM_METADATA_CHANGED", { itemId: item.id, wing: item.wing, meta: { title: item.title, changeId } });
        } catch (error) {
          toast("WORKBENCH STOPPED", error.message, 6000);
        }
      }
    }]
  });
  const modal = document.querySelector("#modal-root .modal");
  modal.querySelector("[data-wb-title]").value = item.title || "";
  modal.querySelector("[data-wb-year]").value = item.year || "";
  modal.querySelector("[data-wb-genres]").value = (item.genres || []).join(", ");
  modal.querySelector("[data-wb-description]").value = item.description || "";
  modal.querySelector("[data-wb-note]").value = item.note || "";
  modal.querySelector("[data-wb-owned]").checked = Boolean(item.owned);
  if (currentArtwork) modal.querySelector("[data-wb-preview]").src = currentArtwork;
}

function undoWorkbenchEdit(changeId) {
  try {
    undoWorkbenchChange(changeId);
    emit("ITEM_METADATA_UNDONE", { meta: { title: changeId } });
    draw();
    toast("CHANGE REVERSED", "The prior metadata was restored.");
  } catch (error) {
    toast("UNDO STOPPED", error.message, 6000);
  }
}

async function runWorkbenchBatch(action) {
  if (!getSelectedReviewCount()) return toast("NOTHING SELECTED", "Select review records first.");
  try {
    await createArchiveSnapshot(`Protected snapshot before Stage 2 ${action} batch`, { kind: "review_batch", protected: true });
    const count = resolveWorkbenchBatch(action);
    emit("RECOVERY_REVIEW_BATCHED", { meta: { title: `${count} records`, action } });
    draw();
    toast("BATCH FILED", `${count} compatible decisions recorded.`);
  } catch (error) {
    toast("BATCH STOPPED", error.message, 6000);
  }
}

function editEpisode(showId, episodeId) {
  const show = getState().items[showId], episode = show.episodes[episodeId];
  let rating = Number(episode.rating || 0);
  openModal({
    title: `${show.title} — S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`,
    body: `<label>EPISODE TITLE <input type="text" data-episode-title placeholder="Optional episode title"></label>
    <label><input type="checkbox" data-watched ${episode.status === "completed" ? "checked" : ""}> WATCHED</label>
    <div class="episode-rating">${Array.from({ length: 10 }, (_, index) => `<button data-er="${index + 1}" class="${rating >= index + 1 ? "on" : ""}">◆</button>`).join("")}</div>
    <textarea rows="5" data-note placeholder="Episode notes..."></textarea>
    <label class="episode-rewatch">REWATCHES <input type="number" min="0" data-rewatches value="${episode.rewatches || 0}"></label>`,
    actions: [{
      label: "SAVE EPISODE",
      primary: true,
      handler(modal) {
        update(save => {
          const target = save.items[showId].episodes[episodeId];
          target.title = modal.querySelector("[data-episode-title]").value.trim();
          target.status = modal.querySelector("[data-watched]").checked ? "completed" : Number(target.playbackSeconds || 0) > 0 ? "in_progress" : "backlog";
          target.rating = rating || null;
          target.note = modal.querySelector("[data-note]").value.trim();
          target.rewatches = Math.max(0, Number(modal.querySelector("[data-rewatches]").value || 0));
          sync(save.items[showId]);
        });
        emit("EPISODE_UPDATED", { itemId: showId, episodeId, wing: "tv", meta: { title: `${show.title} S${episode.season}E${episode.number}` } });
        closeModal();
        draw();
        toast("EPISODE RECORD FILED", show.title);
      }
    }]
  });
  document.querySelector("[data-episode-title]").value = episode.title || "";
  document.querySelector("[data-note]").value = episode.note || "";
  const row = document.querySelector(".episode-rating");
  row.onclick = event => {
    const next = Number(event.target.closest("[data-er]")?.dataset.er);
    if (!next) return;
    rating = rating === next ? 0 : next;
    row.querySelectorAll("button").forEach(button => button.classList.toggle("on", Number(button.dataset.er) <= rating));
  };
}

function sync(show) {
  const episodes = Object.values(show.episodes || {}), completed = episodes.filter(episode => episode.status === "completed").length;
  show.progress = { completed, total: episodes.length };
  show.status = completed === episodes.length && completed ? "completed" : completed ? "in_progress" : "backlog";
}

async function scanDrive() {
  try {
    toast("DRIVE SCAN", "Choose D:\\TV Shows or another folder.");
    const result = await chooseAndScanDirectory();
    update(save => {
      save.metadata.driveScans = [...(save.metadata.driveScans || []), { rootName: result.rootName, scannedAt: result.scannedAt, fileCount: result.fileCount }];
      save.metadata.driveReviewQueue = [...(save.metadata.driveReviewQueue || []), ...result.candidates];
    });
    tvScreen = "review";
    draw();
    toast("SCAN COMPLETE", `${result.candidates.length} candidates awaiting review.`);
  } catch (error) {
    if (error.name !== "AbortError") toast("SCAN STOPPED", error.message, 6000);
  }
}

function reviewCandidate(id, accepted) {
  update(save => {
    const item = save.metadata.driveReviewQueue.find(candidate => candidate.id === id);
    item.status = accepted ? "accepted" : "rejected";
    if (accepted) {
      const key = `tv_drive_${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
      if (!save.items[key]) save.items[key] = { id: key, type: "tv", wing: "tv", title: item.title, genres: ["Drive Discoveries"], status: "backlog", owned: true, sourcePaths: item.files.map(file => file.path), episodes: {} };
    }
  });
  emit(accepted ? "DRIVE_CANDIDATE_ACCEPTED" : "DRIVE_CANDIDATE_REJECTED", { meta: { title: id } });
  draw();
}

function reviewRecoveryCandidate(id, action) {
  try {
    resolveReviewItem(id, action);
    emit("RECOVERY_REVIEW_DECIDED", { meta: { title: id, action } });
    draw();
    toast("REVIEW DECISION FILED", action.replaceAll("_", " "));
  } catch (error) {
    toast("REVIEW STOPPED", error.message, 6000);
  }
}

async function createSnapshotFromUi() {
  try {
    const snapshot = await createArchiveSnapshot("Protected manual snapshot", { kind: "milestone", protected: true });
    draw();
    toast("MILESTONE SNAPSHOT SEALED", new Date(snapshot.createdAt).toLocaleString());
  } catch (error) {
    toast("SNAPSHOT FAILED", error.message, 6000);
  }
}

async function showSnapshotManager() {
  try {
    const snapshots = await getArchiveSnapshots();
    const rows = snapshots.slice(0, 30).map(snapshot => `<article class="snapshot-row"><div><b>${snapshot.label}</b><small>${new Date(snapshot.createdAt).toLocaleString()} · ${snapshot.itemCount} RECORDS · ${snapshot.protected ? "PROTECTED" : snapshot.kind.toUpperCase()}</small></div><button class="button" data-restore-snapshot="${snapshot.id}">RESTORE</button></article>`).join("");
    openModal({ title: "ARCHIVE SNAPSHOTS", body: rows || `<div class="empty"><b>NO SNAPSHOTS FOUND</b>The first daily snapshot will appear automatically.</div>` });
    document.querySelector("#modal-root").onclick = async event => {
      const id = event.target.closest("[data-restore-snapshot]")?.dataset.restoreSnapshot;
      if (!id) return;
      if (!confirm("Restore this snapshot? The current archive will be protected first.")) return;
      try {
        await restoreArchiveSnapshot(id);
        normalizeTv();
        closeModal();
        draw();
        toast("ARCHIVE RESTORED", "A protected pre-restore snapshot was also created.");
      } catch (error) {
        toast("RESTORE FAILED", error.message, 6000);
      }
    };
  } catch (error) {
    toast("SNAPSHOT INDEX FAILED", error.message, 6000);
  }
}

function showDiscovery() {
  const result = discover();
  openModal({ title: "THE VAULT HAS SELECTED:", body: `<h3>${escapeHtml(result.item.title)}</h3><ul>${result.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` });
}

function showHealth() {
  const health = runHealthCheck();
  openModal({ title: health.ok ? "ARCHIVE HEALTH: NOMINAL" : "ARCHIVE HEALTH: ATTENTION", body: health.ok ? `<p>${health.checked} records inspected.</p>` : `<p>${safeTextList(health.issues)}</p>` });
}

function exportArchive(prefix = "vault-reconstruction") {
  const anchor = document.createElement("a"), url = URL.createObjectURL(new Blob([exportSave()], { type: "application/json" }));
  anchor.href = url;
  anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function commands() {
  openCommandPalette([
    { label: "life dashboard", run: () => navigate("dashboard") },
    { label: "tonight", run: () => navigate("tonight") },
    { label: "today", run: () => navigate("today") },
    { label: "plan a session", run: () => navigate("session") },
    { label: "vault assistant", run: () => navigate("companion") },
    ...wings.map(wing => ({ label: wing.label.toLowerCase(), run: () => navigate(wing.id) })),
    { label: "scan tv drive", run: scanDrive },
    { label: "review queue", run: () => navigate("tv/review") },
    { label: "random", run: showDiscovery },
    { label: "health", run: showHealth }
  ]);
}

function wireGlobal() {
  // The fridge search is a form, so it submits rather than clicking through the
  // main delegated click handler.
  view.addEventListener("submit", event => {
    const fridge = event.target.closest("[data-fridge-form]");
    if (fridge) {
      event.preventDefault();
      return searchFridge(new FormData(fridge).get("ingredient"));
    }
    const pasted = event.target.closest("[data-fridge-text]");
    if (pasted) {
      event.preventDefault();
      return readGroceries({ text: new FormData(pasted).get("text") });
    }
  });
  // A photographed receipt is read as a data URL and handed straight to the AI;
  // the file itself never leaves this machine except as that one request.
  view.addEventListener("change", event => {
    // Moving a receipt line to another bucket re-sorts the review list. The
    // form is read back first so edits in other rows survive the redraw.
    if (event.target.matches?.('[data-pending="kind"]')) { syncPending(); draw(); return; }
    const picker = event.target.closest("[data-fridge-image]");
    if (!picker?.files?.length) return;
    const reader = new FileReader();
    reader.onload = () => readGroceries({ image: String(reader.result || "") });
    reader.readAsDataURL(picker.files[0]);
  });
  const boot = document.querySelector("#boot");
  if(boot){boot.onclick = boot.onkeydown = () => { boot.classList.add("dismissed"); update(save => { save.preferences.bootSeen = true; }); };if (getState().preferences.bootSeen) boot.classList.add("dismissed")}
  document.querySelector("#palette-button").onclick = commands;
  document.querySelector("#discovery-button").onclick = showDiscovery;
  search.oninput = () => draw();
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      commands();
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      const shortcuts = { h: "home", l: "dashboard", n: "tonight", t: "today", s: "session", a: "companion" };
      const destination = shortcuts[event.key.toLowerCase()];
      if (destination) { event.preventDefault(); navigate(destination); }
    } else if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      search.focus();
    } else if (route === "tonight" && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key) && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      const controls = [...view.querySelectorAll(".couch-action:not([disabled])")];
      if (!controls.length) return;
      event.preventDefault();
      const current = controls.indexOf(document.activeElement), direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      controls[(current + direction + controls.length) % controls.length].focus();
    }
  });
  window.addEventListener("focus", () => { const pending = markPlaybackReturn(); if (pending && route === "tonight") draw();const audible=claimReturningAudibleSession();if(audible)openAudibleProgressDialog(audible,draw,{finishSession:true}); });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("couch-mode"); });
  document.querySelector("#import-input").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error("Archive files larger than 100 MB require an offline recovery review.");
      const candidate = migrateSave(JSON.parse(await file.text()));
      const health = runHealthCheck(candidate);
      if (!health.ok) throw new Error(`Archive validation found ${health.issues.length} issue(s): ${health.issues.slice(0, 4).join(" | ")}`);
      const currentRecords = Object.keys(getState().items || {}).length;
      const incomingRecords = Object.keys(candidate.items || {}).length;
      if (currentRecords > 100 && incomingRecords < currentRecords * 0.8) {
        throw new Error(`Archive restore stopped because it would remove ${currentRecords - incomingRecords} records. Use the protected recovery workflow for an intentional archive replacement.`);
      }
      await replaceState(candidate);
      normalizeTv();
      await flushPersistence();
      draw();
      toast("ARCHIVE RESTORED", "Validation, protected snapshot, and local persistence are complete.");
    } catch (error) {
      toast("IMPORT REJECTED", error.message);
    }
    event.target.value = "";
  };
}

function refresh() {
  const state = getState();
  document.querySelector("#schema-version").textContent = state.schemaVersion;
  document.querySelector("#event-count").textContent = state.events.length;
  document.querySelector("#level-chip").textContent = String(state.profile.level).padStart(2, "0");
  document.querySelector("#observation-strip").innerHTML = `<div class="observation">${getObservation()}</div>`;
}
