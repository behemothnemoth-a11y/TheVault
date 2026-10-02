import { getState } from "../core/store.js";
import { openModal, closeModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { openTripDialog, removeTrip, setTripPreference, setTripStatus, toggleTripFavorite } from "../wings/trips.js?v=20260906-v3";
import { navigate } from "./routeController.js?v=20260913-life-v1";

export function handleTripsAction(event, draw) {
  const target = event.target;
  if (target.closest("[data-trip-add]")) { openTripDialog("", id => { draw(); navigate(`trips/${encodeURIComponent(id)}`); toast("TRIP ADDED", getState().items[id]?.title || "Trip file"); }); return true; }
  const open = target.closest("[data-open-trip]")?.dataset.openTrip;
  if (open) { navigate(`trips/${encodeURIComponent(open)}`); return true; }
  if (target.closest("[data-trip-back]")) { navigate("trips"); return true; }
  const edit = target.closest("[data-trip-edit]")?.dataset.tripEdit;
  if (edit) { openTripDialog(edit, () => { draw(); toast("TRIP UPDATED", getState().items[edit]?.title || "Trip file"); }); return true; }
  const favorite=target.closest("[data-trip-favorite]")?.dataset.tripFavorite;
  if(favorite){const active=toggleTripFavorite(favorite);draw();toast(active?"TRIP FAVORITED":"TRIP UNFAVORITED",getState().items[favorite]?.title||"Trip file");return true}
  const status = target.closest("[data-trip-status]");
  if (status) { setTripStatus(status.dataset.tripId, status.dataset.tripStatus); draw(); toast("TRIP STATUS UPDATED", getState().items[status.dataset.tripId]?.title || "Trip file"); return true; }
  const filter = target.closest("[data-trip-filter]")?.dataset.tripFilter;
  if (filter) { setTripPreference("status", filter); draw(); return true; }
  const remove = target.closest("[data-trip-remove]")?.dataset.tripRemove;
  if (remove) { const title = getState().items[remove]?.title || "Trip"; openModal({ title: "REMOVE TRIP FILE?", body: `<p>${title} will be removed from the Travel Archive. This does not touch files anywhere else on your computer.</p>`, actions: [{ label: "CANCEL", handler: () => closeModal() }, { label: "REMOVE", primary: true, handler: () => { removeTrip(remove); closeModal(); navigate("trips"); draw(); toast("TRIP REMOVED", title); } }] }); return true; }
  return false;
}

export function handleTripsChange(event, draw) {
  const sort = event.target.closest("[data-trip-sort]");
  if (!sort) return false;
  setTripPreference("sort", sort.value);
  draw();
  return true;
}
