import { getState } from "../core/store.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { escapeHtml } from "../ui/safeHtml.js";
import { autoFillComicArtwork, checkComicReleases, correctAllComicMetadata, dismissComicRecommendation, hideComicCard, markComicThroughLatest, openComicAddDialog, openComicArtworkPicker, openComicEditDialog, openComicMetadataReview, openComicReaderDialog, openComicRecommendationDialog, openComicVolumeArtworkPicker, openKindleAccount, openPreferredComicReader, refreshComicRecommendations, refreshComicVolumes, renameComicCollection, resetComicPreferences, setComicField, setComicOwned, setComicPreference, setComicStatus, toggleComicFavorite, toggleComicVolumeRead } from "../wings/comicsManga.js?v=20260831-comics-v2-v13";
import { setComicOwnershipType, setComicStructure } from "../wings/comicsMangaV2.js?v=20260831-v3";
import { navigate } from "./routeController.js?v=20260913-life-v1";

export async function handleComicsAction(event, { draw, openProgress }) {
  const target = event.target;
  if (target.closest("[data-comic-metadata-review]")) { openComicMetadataReview(draw); return true; }
  const collection = target.closest("[data-comic-collection-rename]")?.dataset.comicCollectionRename;
  if (collection) {
    const fallback = collection.split(":").slice(2).join(":"), current = getState().metadata.comicsManga?.collectionAliases?.[collection] || fallback;
    openModal({ title: "RENAME COMICS / MANGA COLLECTION", body: `<label>COLLECTION NAME<input data-collection-name value="${escapeHtml(current)}" maxlength="100"></label><p class="muted">This changes only the card label. Series metadata and grouping stay intact.</p>`, actions: [{ label: "SAVE NAME", primary: true, handler: dialog => { if (!renameComicCollection(collection, dialog.querySelector("[data-collection-name]").value)) return toast("NAME REQUIRED", "Enter a collection name."); closeModal(); draw(); toast("COLLECTION RENAMED", "Comics / Manga collection label updated."); } }] });
    return true;
  }
  const owned = target.closest("[data-comic-owned]");
  if (owned) { const value = setComicOwned(owned.dataset.comicOwned, owned.dataset.comicOwnedValue === "true"); draw(); toast(value ? "ADDED TO OWNED COLLECTION" : "REMOVED FROM OWNED COLLECTION", getState().items[owned.dataset.comicOwned]?.title || "Comics / Manga"); return true; }
  if (target.closest("[data-comic-metadata-repair]")) {
    openModal({ title: "REFRESH COMICS / MANGA METADATA", body: "<p>The Vault checks only new, changed, incomplete, or stale series. Every completed check is remembered for seven days.</p><p>Reading status, progress, favorites, notes, links, and approved artwork stay intact. The refresh stops automatically when its eligible queue is empty.</p>", actions: [{ label: "REFRESH ELIGIBLE SERIES", primary: true, handler: async () => { const screen = openProgress("REFRESHING COMICS / MANGA", "BUILDING THE ELIGIBLE QUEUE…", "Previously checked current series will be skipped."); try { const result = await correctAllComicMetadata({ onProgress: value => screen.update({ phase: `VERIFYING ${value.title.toUpperCase()}`, detail: `${value.updated} updated · ${value.failed} need review · ${value.skipped} already current`, current: value.processed, total: value.total }) }); draw(); screen.finish(result.total ? "METADATA REFRESH COMPLETE" : "COMICS / MANGA ALREADY CURRENT", `${result.updated} updated · ${result.failed} need review · ${result.skipped} skipped as current.`); } catch (error) { screen.fail(error.message); } } }] });
    return true;
  }
  if (target.closest("[data-comic-add]")) { openComicAddDialog(itemId => { toast("SERIES ADDED", getState().items[itemId]?.title || "Comics / Manga record"); navigate(`manga/${encodeURIComponent(itemId)}`); }); return true; }
  if (target.closest("[data-comic-recommendations-refresh]")) {
    const screen = openProgress("BUILDING RECOMMENDATIONS", "ANALYZING YOUR VAULT INTERESTS…", "Using completed series, favorites, and active reading to verify strong matches.");
    try { const result = await refreshComicRecommendations(); draw(); screen.finish("RECOMMENDATIONS READY", `${result.count} spoiler-free recommendation${result.count === 1 ? "" : "s"} prepared.`); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  const recommendation = target.closest("[data-comic-recommendation]")?.dataset.comicRecommendation;
  if (recommendation) { openComicRecommendationDialog(recommendation, itemId => navigate(`manga/${encodeURIComponent(itemId)}`), draw); return true; }
  const dismiss = target.closest("[data-comic-recommendation-dismiss]")?.dataset.comicRecommendationDismiss;
  if (dismiss) { dismissComicRecommendation(dismiss); draw(); toast("RECOMMENDATION REMOVED", "It will not be suggested again."); return true; }
  if (target.closest("[data-kindle-connect]")) { openKindleAccount(); toast("KINDLE OPENED", "Sign in through Amazon. The Vault does not store your password."); return true; }
  const read = target.closest("[data-comic-read]")?.dataset.comicRead;
  if (read) { const result = openPreferredComicReader(read); if (result.opened) toast("READER OPENED", getState().items[read]?.title || "Series"); else openComicReaderDialog(read, draw); return true; }
  const readerManage = target.closest("[data-comic-reader-manage]")?.dataset.comicReaderManage;
  if (readerManage) { openComicReaderDialog(readerManage, draw); return true; }
  const edit = target.closest("[data-comic-edit-series]")?.dataset.comicEditSeries;
  if (edit) { openComicEditDialog(edit, draw); return true; }
  const open = target.closest("[data-open-comic]")?.dataset.openComic;
  if (open) { navigate(`manga/${encodeURIComponent(open)}`); return true; }
  if (target.closest("[data-comic-back]")) { navigate("manga"); return true; }
  const preference = target.closest("[data-comic-pref]");
  if (preference) { setComicPreference(preference.dataset.comicPref, preference.dataset.comicValue); draw(); return true; }
  if (target.closest("[data-comic-reset]")) { resetComicPreferences(); draw(); return true; }
  const favorite = target.closest("[data-comic-favorite]")?.dataset.comicFavorite;
  if (favorite) { const value = toggleComicFavorite(favorite); draw(); toast(value ? "ADDED TO FAVORITES" : "REMOVED FROM FAVORITES", getState().items[favorite]?.title || "Series"); return true; }
  const hide = target.closest("[data-comic-hide]");
  if (hide) { const itemId = hide.dataset.comicHide, hidden = hide.dataset.comicHidden === "true"; hideComicCard(itemId, hidden); draw(); toast(hidden ? "CARD HIDDEN" : "CARD RESTORED", getState().items[itemId]?.title || "Series"); return true; }
  const status = target.closest("[data-comic-status]");
  if (status) { setComicStatus(status.dataset.comicId, status.dataset.comicStatus); draw(); toast("READING STATUS UPDATED", status.textContent.trim()); return true; }
  const latest = target.closest("[data-comic-mark-latest]")?.dataset.comicMarkLatest;
  if (latest) { markComicThroughLatest(latest); draw(); toast("RELEASES MARKED READ", getState().items[latest]?.title || "Series"); return true; }
  const monitor = target.closest("[data-comic-monitor]");
  if (monitor) { setComicField(monitor.dataset.comicMonitor, "monitoring", monitor.dataset.comicMonitorValue); draw(); toast("RELEASE MONITOR UPDATED", monitor.dataset.comicMonitorValue === "true" ? "Monitoring enabled." : "Monitoring paused."); return true; }
  const ownership = target.closest("[data-comic-ownership]");
  if (ownership) { setComicOwnershipType(ownership.dataset.comicId, ownership.dataset.comicOwnership, ownership.dataset.comicValue === "true"); draw(); toast("OWNERSHIP UPDATED", "The series ownership ledger has been updated."); return true; }
  const artwork = target.closest("[data-comic-artwork]")?.dataset.comicArtwork;
  if (artwork) { openComicArtworkPicker(artwork, draw); return true; }
  const volumeRefresh = target.closest("[data-comic-volumes-refresh]")?.dataset.comicVolumesRefresh;
  if (volumeRefresh) {
    const screen = openProgress("BUILDING VOLUME FILES", "SEARCHING PUBLISHED VOLUME RECORDS…", "Finding source artwork and preparing cover candidates for approval. Large series may take longer.");
    try { const result = await refreshComicVolumes(volumeRefresh); draw(); screen.finish("VOLUME FILES UPDATED", `${result.count} volume card${result.count === 1 ? "" : "s"} · ${result.artworkQueued} cover candidate${result.artworkQueued === 1 ? "" : "s"} queued for approval.`); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  const volumeArt = target.closest("[data-comic-volume-art]");
  if (volumeArt) { openComicVolumeArtworkPicker(volumeArt.dataset.comicId, volumeArt.dataset.comicVolumeArt, draw); return true; }
  const volumeRead = target.closest("[data-comic-volume-read]");
  if (volumeRead) { const value = toggleComicVolumeRead(volumeRead.dataset.comicId, volumeRead.dataset.comicVolumeRead); draw(); toast(value ? "VOLUME MARKED READ" : "VOLUME MARKED UNREAD", `Volume ${volumeRead.dataset.comicVolumeRead}`); return true; }
  if (target.closest("[data-comic-art-backfill]")) {
    openModal({ title: "FILL ALL COMICS / MANGA ART", body: "<p>The Vault will search reputable catalogs, booksellers, publishers, licensed platforms, and established databases for recognizable published covers.</p><p>Generated artwork is not used. Every candidate waits in Artwork Review.</p>", actions: [{ label: "FIND PUBLISHED COVERS", primary: true, handler: async () => { const screen = openProgress("FILLING COMICS / MANGA ART", "PREPARING COVER SEARCH…", "Searching for recognizable published covers."); try { const result = await autoFillComicArtwork({ onProgress: value => screen.update({ phase: "CHECKING PUBLISHED ARTWORK…", detail: `${value.saved} queued · ${value.failed} need manual review`, current: value.processed, total: value.total }) }); draw(); screen.finish("ARTWORK READY FOR REVIEW", `${result.saved} cover candidate${result.saved === 1 ? "" : "s"} queued · ${result.failed} need manual review.`); } catch (error) { draw(); screen.fail(error.message); } } }] });
    return true;
  }
  if (target.closest("[data-comic-rematch]")) { openComicAddDialog(); return true; }
  if (target.closest("[data-comic-check]")) {
    openModal({ title: "CHECK COMICS / MANGA RELEASES", body: "<p>The Vault will send only each monitored series title, creator, release lane, and last known release number to OpenAI for a current web check. Your read-through position, reading status, favorites, notes, and source URLs stay inside The Vault.</p><p>Nothing will be marked read automatically. New counts remain until you mark them read.</p>", actions: [{ label: "CHECK NOW", primary: true, handler: async () => { const screen = openProgress("CHECKING COMICS / MANGA RELEASES", "VERIFYING CURRENT RELEASE SOURCES…", "Nothing will be marked read automatically."); try { const result = await checkComicReleases({ force: true }); draw(); screen.finish("RELEASE CHECK COMPLETE", result.skipped ? "No monitored series are ready to check." : `${result.checked} series checked · ${result.changed.length} updated.`); } catch { screen.fail("The online service could not complete this check. Your records were not changed."); } } }] });
    return true;
  }
  return false;
}

export function handleComicsChange(event, draw) {
  const target = event.target;
  const select = target.closest("[data-comic-select]");
  if (select) { setComicPreference(select.dataset.comicSelect, select.value); draw(); return true; }
  const field = target.closest("[data-comic-field]");
  if (field) { setComicField(field.dataset.comicId, field.dataset.comicField, field.type === "checkbox" ? field.checked : field.value); draw(); return true; }
  const structure = target.closest("[data-comic-structure]");
  if (structure) { setComicStructure(structure.dataset.comicStructure, structure.value); draw(); return true; }
  return false;
}
