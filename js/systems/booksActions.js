import { getState, update } from "../core/store.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { escapeHtml } from "../ui/safeHtml.js";
import { correctAllBookMetadata, dismissBookRecommendation, findMissingBookCovers, finishBookAudibleSession, openAudibleProgressDialog, openBookAddDialog, openBookCoverPicker, openBookEditDialog, openBookMetadataReview, openBookRecommendationDialog, refreshBookRecommendations, refreshBookSeries, renameBookCollection, setBookAudibleOwned, setBookField, setBookOwned, setBookPreference, startBookAudibleSession, toggleBookFavorite } from "../wings/books.js?v=20260830-metadata-checkpoints-v16";
import { openRemoveCardsDialog } from "./cardRemoval.js?v=20260830-v1";
import { fillReadingGaps, readingDetailGaps } from "./readingDetails.js?v=20260912-reading-details-v1";
import { navigate } from "./routeController.js?v=20260913-life-v1";

export async function handleBooksAction(event, { draw, openProgress }) {
  const target = event.target;
  if (target.closest("[data-reading-fill-gaps]")) {
    const before = readingDetailGaps();
    const screen = openProgress("FILLING COVERS AND DETAILS", "OPENING YOUR OWN FILES…", "Covers and descriptions come out of the books and comics themselves. Nothing is fetched from the network, and anything you set by hand is left alone.");
    try {
      const result = await fillReadingGaps({ onProgress: value => screen.update({ phase: value.phase, detail: value.detail, current: value.current, total: value.total }) });
      draw();
      const after = readingDetailGaps();
      screen.finish("COVERS AND DETAILS FILLED", `${result.covers.applied} covers read from your files · ${result.details.descriptions} descriptions · ${result.details.authors} authors · ${result.details.years} years · ${after.missingArtwork} records still without a cover${after.unreadable ? ` · ${after.unreadable} in a format the reader cannot open` : ""}.`);
    } catch (error) { screen.fail(error.message); }
    return true;
  }
  if (target.closest("[data-book-add]")) { openBookAddDialog(id => navigate(`books/${encodeURIComponent(id)}`)); return true; }
  const cover = target.closest("[data-book-cover]")?.dataset.bookCover;
  if (cover) { openBookCoverPicker(cover, draw); return true; }
  const edit = target.closest("[data-book-edit]")?.dataset.bookEdit;
  if (edit) { openBookEditDialog(edit, draw); return true; }
  const collection = target.closest("[data-book-collection-rename]")?.dataset.bookCollectionRename;
  if (collection) {
    const fallback = collection.replace(/^@(author|format):/, ""), current = getState().metadata.books?.collectionAliases?.[collection] || fallback;
    openModal({ title: "RENAME BOOK COLLECTION", body: `<label>COLLECTION NAME<input data-collection-name value="${escapeHtml(current)}" maxlength="100"></label><p class="muted">This changes only the card label. Book metadata and grouping stay intact.</p>`, actions: [{ label: "SAVE NAME", primary: true, handler: dialog => { if (!renameBookCollection(collection, dialog.querySelector("[data-collection-name]").value)) return toast("NAME REQUIRED", "Enter a collection name."); closeModal(); draw(); toast("COLLECTION RENAMED", "Books collection label updated."); } }] });
    return true;
  }
  if (target.closest("[data-book-art-backfill]")) {
    const screen = openProgress("FINDING BOOK COVERS", "CHECKING EXACT EDITIONS…", "Every result will wait for artwork approval.");
    try { const result = await findMissingBookCovers({ onProgress: value => screen.update({ phase: `CHECKING ${value.title.toUpperCase()}`, detail: `${value.queued} queued · ${value.failed} need review`, current: value.processed, total: value.total }) }); draw(); screen.finish("BOOK COVERS READY FOR REVIEW", `${result.queued} queued · ${result.failed} need manual cover search.`); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  if (target.closest("[data-book-metadata]")) {
    openModal({ title: "REFRESH BOOK METADATA", body: "<p>The Vault checks only new, changed, incomplete, or stale book records. Successfully checked editions are remembered for fourteen days.</p><p>Progress, ownership, favorites, notes, and approved artwork stay intact. The refresh stops automatically when its eligible queue is empty.</p>", actions: [{ label: "REFRESH ELIGIBLE BOOKS", primary: true, handler: async () => { const screen = openProgress("REFRESHING BOOK METADATA", "BUILDING THE ELIGIBLE QUEUE…", "Previously checked current editions will be skipped."); try { const result = await correctAllBookMetadata({ onProgress: value => screen.update({ phase: `VERIFYING ${value.title.toUpperCase()}`, detail: `${value.updated} updated · ${value.failed} need review · ${value.skipped} already current`, current: value.processed, total: value.total }) }); draw(); screen.finish(result.total ? "BOOK METADATA REFRESH COMPLETE" : "BOOK METADATA ALREADY CURRENT", `${result.updated} updated · ${result.failed} need review · ${result.skipped} skipped as current.`); } catch (error) { screen.fail(error.message); } } }] });
    return true;
  }
  if (target.closest("[data-book-metadata-review]")) { openBookMetadataReview(draw); return true; }
  if (target.closest("[data-book-recommendations-refresh]")) {
    const screen = openProgress("BUILDING BOOK RECOMMENDATIONS", "ANALYZING COMPLETED BOOKS + FAVORITES…", "Planned books are excluded as taste evidence.");
    try { const result = await refreshBookRecommendations(); draw(); screen.finish("BOOK RECOMMENDATIONS READY", `${result.count} spoiler-free recommendations prepared.`); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  const recommendation = target.closest("[data-book-recommendation]")?.dataset.bookRecommendation;
  if (recommendation) { openBookRecommendationDialog(recommendation, id => navigate(`books/${encodeURIComponent(id)}`), draw); return true; }
  const dismiss = target.closest("[data-book-recommendation-dismiss]")?.dataset.bookRecommendationDismiss;
  if (dismiss) { dismissBookRecommendation(dismiss); draw(); toast("RECOMMENDATION REMOVED", "It will not be suggested again."); return true; }
  if (target.closest("[data-book-back]")) { navigate("books"); return true; }
  const remove = target.closest("[data-book-remove]")?.dataset.bookRemove;
  if (remove) { openRemoveCardsDialog([remove], getState().items[remove]?.title, () => navigate("books")); return true; }
  const open = target.closest("[data-open-book]")?.dataset.openBook;
  if (open) { navigate(`books/${encodeURIComponent(open)}`); return true; }
  const series = target.closest("[data-open-book-series]")?.dataset.openBookSeries;
  if (series) { navigate(`books/series/${encodeURIComponent(series)}`); return true; }
  if (target.closest("[data-book-series-refresh]")) {
    const screen = openProgress("GROUPING BOOK SERIES", "VERIFYING READING ORDER…", "Only high-confidence matches collapse automatically.");
    try { const result = await refreshBookSeries({ onProgress: value => screen.update({ phase: "VERIFYING SERIES MEMBERSHIP…", detail: `${value.grouped} grouped · ${value.review} need review`, current: value.processed, total: value.total }) }); draw(); screen.finish("BOOK SERIES UPDATED", `${result.grouped} grouped · ${result.review} uncertain records left uncollapsed.`); }
    catch (error) { screen.fail(error.message); }
    return true;
  }
  const owned = target.closest("[data-book-owned]");
  if (owned) { const value = owned.dataset.bookOwnedValue === "true"; setBookOwned(owned.dataset.bookOwned, value); draw(); toast(value ? "ADDED TO PHYSICAL LIBRARY" : "REMOVED FROM PHYSICAL LIBRARY", getState().items[owned.dataset.bookOwned]?.title || "Book"); return true; }
  const favorite = target.closest("[data-book-favorite]")?.dataset.bookFavorite;
  if (favorite) { const value = toggleBookFavorite(favorite); draw(); toast(value ? "ADDED TO FAVORITES" : "REMOVED FROM FAVORITES", getState().items[favorite]?.title || "Book"); return true; }
  const status = target.closest("[data-book-status]");
  if (status) { setBookField(status.dataset.bookId, "status", status.dataset.bookStatus); draw(); return true; }
  const preference = target.closest("[data-book-pref]");
  if (preference) { setBookPreference(preference.dataset.bookPref, preference.dataset.bookValue); draw(); return true; }
  if (target.closest("[data-book-kindle]")) { window.open("https://read.amazon.com/", "_blank", "noopener"); return true; }
  if (target.closest("[data-book-audible]")) { window.open("https://www.audible.com/library/", "_blank", "noopener"); return true; }
  const audibleOwned = target.closest("[data-book-audible-owned]");
  if (audibleOwned) { setBookAudibleOwned(audibleOwned.dataset.bookAudibleOwned, audibleOwned.dataset.bookAudibleValue === "true"); draw(); return true; }
  const audiblePlay = target.closest("[data-book-audible-play]")?.dataset.bookAudiblePlay;
  if (audiblePlay) { startBookAudibleSession(audiblePlay); draw(); toast("AUDIBLE SESSION STARTED", "Return to this book and stop the session when you finish listening."); return true; }
  const audibleStop = target.closest("[data-book-audible-stop]")?.dataset.bookAudibleStop;
  if (audibleStop) { const minutes = finishBookAudibleSession(audibleStop); draw(); toast("LISTENING SESSION SAVED", `${minutes} minute${minutes === 1 ? "" : "s"} added.`); return true; }
  const audibleSync = target.closest("[data-book-audible-sync]")?.dataset.bookAudibleSync;
  if (audibleSync) { openAudibleProgressDialog(audibleSync, draw); return true; }
  const kindleOwned = target.closest("[data-book-kindle-owned]");
  if (kindleOwned) { update(save => { const item = save.items[kindleOwned.dataset.bookKindleOwned]; if (item?.bookMeta) item.bookMeta.kindleOwned = kindleOwned.dataset.bookKindleValue === "true"; }); draw(); return true; }
  const select = target.closest("[data-book-select]");
  if (select) { setBookPreference(select.dataset.bookSelect, select.value); draw(); return true; }
  const field = target.closest("[data-book-field]");
  if (field) { setBookField(field.dataset.bookId, field.dataset.bookField, field.value); draw(); return true; }
  return false;
}
