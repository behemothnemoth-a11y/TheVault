import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";
import { openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { dismissTvRecommendation, enrichOwnedTvCatalogs, enrichTvSeries, findAllOwnedTvSeasonArtwork, findAllTvSeasonArtwork, hideTvCard, openTvAddDialog, openTvSeasonArtworkPicker, quickCompleteEpisode, recordSeriesOpened, refreshTvMetadata, resetTvPreferences, restoreTvCard, setTvPage, setTvPreference, setTvRating, setTvRecommendationsHidden, setTvSeasonWatched, toggleTvFavorite } from "../wings/tv.js?v=20260926-desktop-v3";
import { openTvPlayer } from "./tvPlayer.js?v=20260926-desktop-v3";
import { episodeDetailGaps, fillEpisodeDetails } from "./tvEpisodeDetails.js?v=20260911-episode-details-v1";
import { navigate } from "./routeController.js?v=20260913-life-v1";

export async function handleTvAction(event, { draw, editEpisode, openEpisodeFile, openProgress, scanDrive, view }) {
  const target = event.target;
  const section = target.closest("[data-tv-section]")?.dataset.tvSection;
  if (section) { navigate(section === "library" ? "tv" : `tv/${section}`); return true; }
  const genre = target.closest("[data-tv-genre-open]")?.dataset.tvGenreOpen;
  if (genre) { setTvPreference("genre", genre); navigate("tv"); return true; }
  const episodePlayer = target.closest("[data-show-id][data-episode-id]:not([data-edit-episode])");
  if (episodePlayer) { event.preventDefault(); openTvPlayer(episodePlayer.dataset.showId, episodePlayer.dataset.episodeId, draw); return true; }
  const seasonWatched = target.closest("[data-tv-season-watched]");
  if (seasonWatched) { const watched = seasonWatched.dataset.tvSeasonWatched === "true", changed = setTvSeasonWatched(seasonWatched.dataset.showId, seasonWatched.dataset.season, watched); draw(); toast(watched ? "SEASON MARKED WATCHED" : "SEASON MARKED UNWATCHED", `${changed} episode${changed === 1 ? "" : "s"} updated.`); return true; }
  const seasonArtPick = target.closest("[data-tv-season-art-pick]");
  if (seasonArtPick) { openTvSeasonArtworkPicker(seasonArtPick.dataset.showId, seasonArtPick.dataset.tvSeasonArtPick, draw); return true; }

  if (target.closest("[data-tv-add]")) {
    openTvAddDialog(itemId => { const item = getState().items[itemId]; if (item && !item.owned) update(save => { const show = save.items[itemId]; if (show) { show.status = "planned"; show.tvMeta ||= {}; show.tvMeta.planned = true; } }); draw(); navigate(`tv/${encodeURIComponent(itemId)}`); });
    return true;
  }
  const enrichSeries = target.closest("[data-tv-enrich-series]")?.dataset.tvEnrichSeries;
  if (enrichSeries) {
    const progress = openProgress("UPDATING SERIES CATALOG", "VERIFYING CURRENT SERIES RECORD…", "Checking seasons and episodes through the latest verified release.");
    try { const result = await enrichTvSeries(enrichSeries); draw(); progress.finish("SERIES CATALOG CURRENT", `${result.seasons} seasons · ${result.episodes} episodes in the reference catalog.`); }
    catch (error) { progress.fail(error.message); }
    return true;
  }
  if (target.closest("[data-tv-episode-details]")) {
    const before = episodeDetailGaps();
    const screen = openProgress("FILLING EPISODE DETAILS", "READING FILENAMES…", "Filenames first, then the TVMaze catalog. Titles, dates and notes you entered yourself are never overwritten.");
    try {
      const result = await fillEpisodeDetails({ onProgress: value => screen.update({ phase: value.phase, detail: value.detail, current: value.current, total: value.total }) });
      draw();
      const after = episodeDetailGaps();
      screen.finish("EPISODE DETAILS FILLED", `${result.fromFiles} titles read from filenames · ${result.fromCatalog} details from TVMaze · ${before.untitled - after.untitled} episodes gained a title · ${result.phantomsRetired} empty slots retired · ${after.untitled} still without a title${result.seriesUnavailable ? ` · ${result.seriesUnavailable} series the catalog could not answer` : ""}.`);
    } catch (error) { screen.fail(error.message); }
    return true;
  }
  if (target.closest("[data-tv-refresh-metadata]")) {
    openModal({ title: "REFRESH TELEVISION METADATA", body: "<p>The Vault checks new, changed, incomplete, or stale tracked series, including current episode metadata. Every completed check is remembered for seven days.</p><p>Local file links, watch history, ratings, ownership, and approved artwork stay intact. The refresh stops automatically when its eligible queue is empty.</p>", actions: [{ label: "REFRESH ELIGIBLE SERIES", primary: true, handler: async () => { const screen = openProgress("REFRESHING TELEVISION METADATA", "BUILDING THE ELIGIBLE QUEUE…", "Previously checked current series will be skipped."); try { const result = await refreshTvMetadata({ onProgress: value => screen.update({ phase: `CHECKING ${value.title.toUpperCase()}`, detail: `${value.updated} updated · ${value.failed} failed · ${value.skipped} already current`, current: value.processed, total: value.total }) }); draw(); screen.finish(result.total ? "TELEVISION METADATA REFRESH COMPLETE" : "TELEVISION METADATA ALREADY CURRENT", `${result.updated} updated · ${result.failed} failed · ${result.skipped} skipped as current.`); } catch (error) { screen.fail(error.message); } } }] });
    return true;
  }
  if(target.closest("[data-tv-link-audit]")){
    const screen=openProgress("VERIFYING EPISODE LINKS","CHECKING EVERY OWNED EPISODE…","Valid files stay untouched. Missing paths are relinked only when one clear season-and-episode match exists.");
    try{
      const state=getState(),episodes=Object.values(state.items||{}).filter(item=>item.wing==="tv"&&item.owned).flatMap(show=>Object.values(show.episodes||{}).filter(episode=>episode.sourcePath).map(episode=>({showId:show.id,episodeId:episode.id,showTitle:show.title,season:episode.season,episode:episode.number,path:episode.sourcePath})));
      const response=await fetch("./__vault/tv/link-audit",{method:"POST",headers:{"Content-Type":"application/json","X-Vault-Request":"tv-link-audit"},body:JSON.stringify({episodes})}),report=await response.json().catch(()=>({}));if(!response.ok)throw new Error("The episode-link audit could not finish.");
      update(save=>{for(const result of report.results||[]){const episode=save.items[result.showId]?.episodes?.[result.episodeId];if(!episode)continue;if(result.status==="relinked")episode.sourcePath=result.path;episode.linkStatus=result.status;episode.linkCheckedAt=new Date().toISOString()}save.metadata.tvLinkAudit={...report,results:undefined,checkedAt:new Date().toISOString()}});
      draw();screen.finish("EPISODE LINKS VERIFIED",`${report.working} already working · ${report.relinked} safely relinked · ${report.missing} genuinely missing.`);
    }catch(error){screen.fail(error.message)}
    return true;
  }
  if (target.closest("[data-tv-enrich-owned]")) {
    openModal({ title: "UPDATE ALL OWNED TELEVISION", body: "<p>The Vault will match each owned series to its current full catalog, add missing season and episode records, and preserve your files and watch history.</p><p>This may take a while for a large collection. Nothing is marked owned unless a matching local episode already exists.</p>", actions: [{ label: "START FULL UPDATE", primary: true, handler: async () => { const screen = openProgress("UPDATING OWNED TELEVISION", "PREPARING OWNED SERIES…", "Building the full current catalog while preserving local files and watch history."); try { const result = await enrichOwnedTvCatalogs({ onProgress: value => screen.update({ phase: `CHECKING ${value.title.toUpperCase()}`, detail: `${value.updated} updated · ${value.failed} need review`, current: value.processed, total: value.total }) }); draw(); screen.finish("OWNED CATALOG UPDATE COMPLETE", `${result.updated} updated · ${result.failed} need another pass.`); } catch (error) { screen.fail(error.message); } } }] });
    return true;
  }
  if (target.closest("[data-tv-season-art-owned]")) {
    openModal({ title: "REFRESH OWNED SEASON ART", body: "<p>The Vault will search every owned series for season-specific posters, keep each show in one matching poster family where possible, and retain the main series poster whenever no confident match exists.</p><p>Every result waits in Artwork Review. Nothing changes until you approve it.</p>", actions: [{ label: "START ARTWORK PASS", primary: true, handler: async () => { const screen = openProgress("REFRESHING OWNED SEASON ART", "PREPARING POSTER SEARCH…", "Matching one consistent poster family per television series."); try { const result = await findAllOwnedTvSeasonArtwork({ onProgress: value => screen.update({ phase: `MATCHING ${value.title.toUpperCase()}`, detail: `${value.saved} queued for approval · ${value.failed} fallbacks retained`, current: value.processed, total: value.total }) }); draw(); screen.finish("SEASON ART READY FOR REVIEW", `${result.saved} posters queued for approval · ${result.failed} seasons kept their current fallback.`); } catch (error) { screen.fail(error.message); } } }] });
    return true;
  }

  const hide = target.closest("[data-tv-card-hide]")?.dataset.tvCardHide;
  if (hide) { const title = getState().items[hide]?.title || "TV series"; hideTvCard(hide); draw(); toast("CARD HIDDEN", `${title} remains safely in your archive.`); return true; }
  const restore = target.closest("[data-tv-card-restore]")?.dataset.tvCardRestore;
  if (restore) { const title = getState().items[restore]?.title || "TV series"; restoreTvCard(restore); draw(); toast("CARD RESTORED", `${title} is visible on your television shelves again.`); return true; }
  const show = target.closest("[data-open-series]")?.dataset.openSeries;
  if (show) { recordSeriesOpened(show); navigate(`tv/${encodeURIComponent(show)}`); return true; }
  const season = target.closest("[data-open-season]");
  if (season) { navigate(`tv/${encodeURIComponent(season.dataset.showId)}/season/${encodeURIComponent(season.dataset.openSeason)}`); return true; }
  const allSeasonArt = target.closest("[data-tv-season-art-all]")?.dataset.tvSeasonArtAll;
  if (allSeasonArt) {
    const screen = openProgress("FINDING SEASON ART", "MATCHING A CONSISTENT POSTER FAMILY…", "Every candidate will wait for your approval.");
    try { const result = await findAllTvSeasonArtwork(allSeasonArt); draw(); screen.finish(result.saved ? "SEASON ART READY FOR REVIEW" : "NO SEASON ART FOUND", result.saved ? `${result.saved} of ${result.total} posters queued · ${result.failed} fallbacks retained.` : "The main show artwork was kept for every season."); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  const rating = target.closest("[data-tv-rating]");
  if (rating) { const value = setTvRating(rating.dataset.showId, rating.dataset.tvRating); draw(); return toast(value ? "SERIES RATED" : "RATING CLEARED", value ? `${getState().items[rating.dataset.showId]?.title || "Series"} · ${value}/10` : "The series rating was removed."); }
  const favorite = target.closest("[data-tv-favorite]")?.dataset.tvFavorite;
  if (favorite) { const enabled = toggleTvFavorite(favorite); draw(); toast(enabled ? "ADDED TO FAVORITES" : "REMOVED FROM FAVORITES", getState().items[favorite]?.title || "TV series"); return true; }
  const dismiss = target.closest("[data-tv-dismiss]")?.dataset.tvDismiss;
  if (dismiss) { const title = getState().items[dismiss]?.title || "TV suggestion"; dismissTvRecommendation(dismiss); draw(); toast("RECOMMENDATION REMOVED", title); return true; }
  const recommendations = target.closest("[data-tv-recommendations]")?.dataset.tvRecommendations;
  if (recommendations) { setTvRecommendationsHidden(recommendations === "hide"); draw(); toast(recommendations === "hide" ? "RECOMMENDATIONS HIDDEN" : "RECOMMENDATIONS RESTORED", "Your owned collection is unchanged."); return true; }
  const filter = target.closest("[data-tv-filter]");
  if (filter) { setTvPreference(filter.dataset.tvFilter, filter.dataset.tvValue); draw(); return true; }
  if (target.closest("[data-tv-reset]")) { resetTvPreferences(); draw(); return true; }
  const page = target.closest("[data-tv-page]")?.dataset.tvPage;
  if (page) { setTvPage(page); draw(); view.focus(); return true; }
  const quickEpisode = target.closest("[data-quick-episode]");
  if (quickEpisode) { const showId = quickEpisode.dataset.showId, episodeId = quickEpisode.dataset.quickEpisode; if (quickCompleteEpisode(showId, episodeId)) emit("EPISODE_UPDATED", { itemId: showId, episodeId, wing: "tv", meta: { title: `${getState().items[showId]?.title || "TV"} ${episodeId}` } }); draw(); toast("EPISODE ARCHIVED", getState().items[showId]?.title || "Television"); return true; }
  if (target.closest("[data-tv-back]")) { navigate("tv"); return true; }
  if (target.closest("[data-review-queue]")) { navigate("tv/review"); return true; }
  if (target.closest("[data-drive-scan]")) { scanDrive(); return true; }
  const episodeFile = target.closest('a.episode-main[href^="file:///"]');
  if (episodeFile) { event.preventDefault(); openEpisodeFile(episodeFile.href, episodeFile.dataset.showId, episodeFile.dataset.episodeId); return true; }
  const edit = target.closest("[data-edit-episode]");
  if (edit) { editEpisode(edit.dataset.showId, edit.dataset.editEpisode); return true; }
  return false;
}

export function handleTvChange(event, draw) {
  const select = event.target.closest("[data-tv-select]");
  if (!select) return false;
  setTvPreference(select.dataset.tvSelect, select.value);
  draw();
  return true;
}
