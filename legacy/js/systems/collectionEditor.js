import { on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";

let selectedId = null;
let search = "";
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "untitled";
}

async function commit(label, collectionId, mutator) {
  const before = collectionId ? structuredClone(getState().collections?.[collectionId] || null) : null;
  await createArchiveSnapshot(`Protected snapshot before collection change: ${label}`, {
    kind: "pre_collection_change", protected: true
  });
  const changeId = createId("collectionchange");
  update(save => {
    mutator(save);
    const afterId = collectionId || save.metadata.stage18.pendingCreatedId;
    const after = afterId ? structuredClone(save.collections?.[afterId] || null) : null;
    save.metadata.stage18.changeLog.push({
      id: changeId, label, collectionId: afterId || collectionId,
      before, after, status: "applied", appliedAt: new Date().toISOString()
    });
    delete save.metadata.stage18.pendingCreatedId;
  });
  return changeId;
}

export async function createCustomCollection({ title, description = "", notes = "" }) {
  if (!String(title).trim()) throw new Error("A collection needs a title.");
  let id = `collection_custom_${slug(title)}`;
  if (getState().collections[id]) id = `${id}_${createId("c").split("_").at(-1)}`;
  await commit("create collection", null, save => {
    save.collections[id] = {
      id, title: String(title).trim(), description: String(description).trim(),
      notes: String(notes).trim(), createdAt: new Date().toISOString(),
      itemIds: [], milestones: [], status: "open", custom: true
    };
    save.metadata.stage18.pendingCreatedId = id;
  });
  selectedId = id;
  return id;
}

export async function editCustomCollection(collectionId, patch) {
  const collection = getState().collections?.[collectionId];
  if (!collection) throw new Error("Collection not found.");
  await commit("edit collection file", collectionId, save => {
    const target = save.collections[collectionId];
    if (patch.title != null && String(patch.title).trim()) target.title = String(patch.title).trim();
    if (patch.description != null) target.description = String(patch.description).trim();
    if (patch.notes != null) target.notes = String(patch.notes).trim();
  });
}

export async function toggleCollectionMember(collectionId, itemId) {
  const state = getState();
  if (!state.collections?.[collectionId] || !state.items?.[itemId]) throw new Error("Collection or record not found.");
  await commit("change collection membership", collectionId, save => {
    const ids = save.collections[collectionId].itemIds;
    const index = ids.indexOf(itemId);
    if (index >= 0) ids.splice(index, 1);
    else ids.push(itemId);
  });
}

export async function moveCollectionMember(collectionId, itemId, direction) {
  await commit("reorder collection", collectionId, save => {
    const ids = save.collections[collectionId].itemIds;
    const from = ids.indexOf(itemId);
    const to = Math.max(0, Math.min(ids.length - 1, from + Number(direction)));
    if (from < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
  });
}

export async function archiveCustomCollection(collectionId) {
  const collection = getState().collections?.[collectionId];
  if (!collection) throw new Error("Collection not found.");
  await commit("archive collection", collectionId, save => {
    save.collections[collectionId].status = "archived";
    save.collections[collectionId].archivedAt = new Date().toISOString();
  });
}

export async function undoCollectionChange(changeId) {
  const change = getState().metadata.stage18?.changeLog?.find(entry => entry.id === changeId);
  if (!change || change.status !== "applied") throw new Error("Active collection change not found.");
  await createArchiveSnapshot(`Protected snapshot before undoing collection change ${changeId}`, {
    kind: "pre_collection_undo", protected: true
  });
  update(save => {
    const live = save.metadata.stage18.changeLog.find(entry => entry.id === changeId);
    if (live.before) save.collections[live.collectionId] = structuredClone(live.before);
    else delete save.collections[live.collectionId];
    live.status = "undone";
    live.undoneAt = new Date().toISOString();
  });
}

function openEditor(collection) {
  openModal({
    title: collection ? "EDIT COLLECTION FILE" : "CREATE COLLECTION",
    body: `<label>TITLE</label><input data-collection-title value="${esc(collection?.title || "")}">
      <label>DESCRIPTION</label><textarea data-collection-description rows="4">${esc(collection?.description || "")}</textarea>
      <label>CURATOR NOTES</label><textarea data-collection-notes rows="4">${esc(collection?.notes || "")}</textarea>`,
    actions: [{
      label: collection ? "FILE CHANGES" : "CREATE FILE", primary: true,
      async handler(modal) {
        try {
          const patch = {
            title: modal.querySelector("[data-collection-title]").value,
            description: modal.querySelector("[data-collection-description]").value,
            notes: modal.querySelector("[data-collection-notes]").value
          };
          if (collection) await editCustomCollection(collection.id, patch);
          else await createCustomCollection(patch);
          closeModal(); renderCollectionEditor(); toast("COLLECTION FILED", patch.title);
        } catch (error) { toast("COLLECTION STOPPED", error.message, 6000); }
      }
    }]
  });
}

export function renderCollectionEditor() {
  if (location.hash !== "#/collection-editor") return;
  const state = getState();
  const collections = Object.values(state.collections || {}).filter(collection => collection.status !== "archived");
  selectedId = state.collections[selectedId]?.status !== "archived" ? selectedId : collections[0]?.id;
  const selected = state.collections[selectedId];
  const members = selected?.itemIds?.map(id => state.items[id]).filter(Boolean) || [];
  const catalog = Object.values(state.items || {}).filter(item =>
    !item.id.startsWith("tv_drive_") && (!search || `${item.title} ${item.wing} ${(item.genres || []).join(" ")}`.toLowerCase().includes(search))
  ).sort((a, b) => Number(selected?.itemIds?.includes(b.id)) - Number(selected?.itemIds?.includes(a.id)) || a.title.localeCompare(b.title));
  const changes = [...(state.metadata.stage18?.changeLog || [])].reverse();
  document.querySelector("#view").innerHTML = `<section class="guild-hero panel"><span class="eyebrow">STAGE 18 // PERSONAL CURATION</span><h2>COLLECTION EDITOR</h2><p>Create ordered personal shelves without deleting or rewriting the preserved legacy collections.</p></section>
    <section class="panel collection-toolbar"><button class="button primary" data-new-collection>NEW COLLECTION</button><input type="search" data-collection-search aria-label="Search all collection records" placeholder="SEARCH ALL RECORDS" value="${esc(search)}"></section>
    <div class="collection-workspace"><aside class="panel collection-index">${collections.map(collection => `<button class="${collection.id === selectedId ? "active" : ""}" data-select-collection="${collection.id}"><b>${esc(collection.title)}</b><span>${collection.itemIds?.length || 0} RECORDS · ${collection.custom ? "CUSTOM" : "PRESERVED"}</span></button>`).join("")}</aside>
    <main>${selected ? `<section class="panel collection-file"><header><div><small>${esc(selected.id)} · ${selected.status.toUpperCase()}</small><h3>${esc(selected.title)}</h3><p>${esc(selected.description)}</p></div><div><button class="button" data-edit-collection="${selected.id}">EDIT FILE</button>${selected.custom ? `<button class="button danger" data-archive-collection="${selected.id}">ARCHIVE</button>` : ""}</div></header>
      <h4>ORDERED MEMBERSHIP</h4>${members.map((item, index) => `<article class="collection-member"><span>${String(index + 1).padStart(3, "0")}</span><b>${esc(item.title)}</b><small>${esc(item.wing)}</small><button data-move-member="${item.id}" data-direction="-1">↑</button><button data-move-member="${item.id}" data-direction="1">↓</button></article>`).join("") || "<p>THIS SHELF IS EMPTY.</p>"}</section>
      <section class="panel collection-catalog"><h4>ARCHIVE RECORDS</h4>${catalog.slice(0, 80).map(item => `<article><div><b>${esc(item.title)}</b><small>${esc(item.wing)} · ${esc((item.genres || [])[0] || "UNFILED")}</small></div><button class="button ${selected.itemIds.includes(item.id) ? "primary" : ""}" data-toggle-member="${item.id}">${selected.itemIds.includes(item.id) ? "REMOVE" : "ADD"}</button></article>`).join("")}</section>` : `<div class="panel empty"><b>NO COLLECTION SELECTED.</b>Create a personal shelf.</div>`}</main></div>
    <section class="panel ops-history"><h3>REVERSIBLE CHANGE LEDGER</h3>${changes.slice(0, 30).map(change => `<article class="ops-ledger"><span>${new Date(change.appliedAt).toLocaleString()}</span><b>${esc(change.label)}</b><em>${change.status.toUpperCase()}</em>${change.status === "applied" ? `<button class="button" data-undo-collection="${change.id}">UNDO</button>` : ""}</article>`).join("") || "<p>NO COLLECTION CHANGES YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Collection Editor";
  document.querySelector("#view-code").textContent = "VAULT://COLLECTION_EDITOR";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-collection-editor-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/collection-editor.css"; link.dataset.collectionEditorStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage18) update(save => { save.metadata.stage18 = { startedAt: new Date().toISOString(), changeLog: [], protectedChanges: true }; });
  document.addEventListener("click", async event => {
    const select = event.target.closest("[data-select-collection]");
    const add = event.target.closest("[data-toggle-member]");
    const move = event.target.closest("[data-move-member]");
    const edit = event.target.closest("[data-edit-collection]");
    const archive = event.target.closest("[data-archive-collection]");
    const undo = event.target.closest("[data-undo-collection]");
    if (event.target.closest("[data-new-collection]")) { event.preventDefault(); event.stopImmediatePropagation(); return openEditor(null); }
    if (select) { event.preventDefault(); event.stopImmediatePropagation(); selectedId = select.dataset.selectCollection; return renderCollectionEditor(); }
    if (edit) { event.preventDefault(); event.stopImmediatePropagation(); return openEditor(getState().collections[edit.dataset.editCollection]); }
    if (!add && !move && !archive && !undo) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (add) await toggleCollectionMember(selectedId, add.dataset.toggleMember);
      else if (move) await moveCollectionMember(selectedId, move.dataset.moveMember, move.dataset.direction);
      else if (archive) await archiveCustomCollection(archive.dataset.archiveCollection);
      else await undoCollectionChange(undo.dataset.undoCollection);
      renderCollectionEditor(); toast("COLLECTION UPDATED", "Protected change recorded.");
    } catch (error) { toast("COLLECTION STOPPED", error.message, 6000); }
  }, true);
  document.addEventListener("input", event => {
    if (!event.target.matches("[data-collection-search]")) return;
    search = event.target.value.trim().toLowerCase(); renderCollectionEditor();
  }, true);
  on("WING_VISITED", event => { if (event.wing === "collection-editor") setTimeout(renderCollectionEditor, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderCollectionEditor, 0));
  setTimeout(renderCollectionEditor, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
