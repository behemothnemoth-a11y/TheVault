import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";

const ENTITY_TYPES = new Set(["person", "franchise", "place", "experience", "collection", "genre"]);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const slug = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "").slice(0, 80) || "unknown";
function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
const labelForItem = (state, itemId) => state.items[itemId]?.title || itemId;
const nodeKey = (type, id) => `${type}:${id}`;

export function makeRelationshipRecord(input, state = getState()) {
  const fromItemId = clean(input.fromItemId);
  const toType = clean(input.toType).toLowerCase();
  const toLabel = clean(input.toLabel);
  const kind = clean(input.kind).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!state.items[fromItemId]) throw new Error("The source archive record does not exist.");
  if (!ENTITY_TYPES.has(toType)) throw new Error("That relationship target type is not supported.");
  if (!toLabel || !kind) throw new Error("A relationship needs a target and a kind.");
  const toId = `${toType}_${slug(toLabel)}`;
  const identity = `${fromItemId}|${kind}|${toType}|${toId}`;
  return {
    id: `relation_${hash(identity)}_${hash([...identity].reverse().join(""))}_${slug(toLabel).slice(0, 24)}`,
    fromItemId,
    to: { type: toType, id: toId, label: toLabel },
    kind,
    source: clean(input.source || "manual"),
    sourceBatchId: input.sourceBatchId || null,
    evidence: structuredClone(input.evidence || {}),
    createdAt: input.createdAt || new Date().toISOString()
  };
}

export function getExplicitRelationships(state = getState()) {
  return Object.values(state.relationships || {});
}

export function getGraphNodes(state = getState(), { query = "", type = "all", limit = 120 } = {}) {
  const nodes = new Map();
  const add = node => {
    const key = nodeKey(node.type, node.id);
    const existing = nodes.get(key);
    if (existing) existing.connectionCount += node.connectionCount || 1;
    else nodes.set(key, { ...node, key, connectionCount: node.connectionCount || 1 });
  };
  for (const item of Object.values(state.items || {})) {
    if (item.id.startsWith("tv_drive_")) continue;
    add({ type: "item", id: item.id, label: item.title, subtitle: item.wing, connectionCount: (item.genres || []).length });
    for (const genre of item.genres || []) add({ type: "genre", id: `genre_${slug(genre)}`, label: genre, subtitle: "genre" });
  }
  for (const collection of Object.values(state.collections || {})) {
    add({ type: "collection", id: collection.id, label: collection.title, subtitle: "collection", connectionCount: collection.itemIds?.length || 0 });
    for (const itemId of collection.itemIds || []) if (state.items[itemId] && !itemId.startsWith("tv_drive_")) {
      add({ type: "item", id: itemId, label: state.items[itemId].title, subtitle: state.items[itemId].wing });
    }
  }
  for (const relationship of getExplicitRelationships(state)) {
    add({ type: relationship.to.type, id: relationship.to.id, label: relationship.to.label, subtitle: relationship.kind });
    if (state.items[relationship.fromItemId]) add({ type: "item", id: relationship.fromItemId, label: state.items[relationship.fromItemId].title, subtitle: state.items[relationship.fromItemId].wing });
  }
  const term = clean(query).toLowerCase();
  return [...nodes.values()].filter(node => (type === "all" || node.type === type) && (!term || `${node.label} ${node.subtitle} ${node.type}`.toLowerCase().includes(term)))
    .sort((a, b) => b.connectionCount - a.connectionCount || a.label.localeCompare(b.label)).slice(0, limit);
}

export function connectionsForNode(type, id, state = getState()) {
  const connections = [];
  const explicit = getExplicitRelationships(state);
  if (type === "item") {
    const item = state.items[id];
    if (!item) return [];
    for (const genre of item.genres || []) connections.push({
      id: `derived_${hash(`${id}|genre|${genre}`)}`, kind: "filed_under", derived: true,
      from: { type: "item", id, label: item.title }, to: { type: "genre", id: `genre_${slug(genre)}`, label: genre },
      source: "record.genres", evidence: { itemId: id, field: "genres", value: genre }
    });
    for (const collection of Object.values(state.collections || {})) if (collection.itemIds?.includes(id)) connections.push({
      id: `derived_${hash(`${id}|collection|${collection.id}`)}`, kind: "member_of", derived: true,
      from: { type: "item", id, label: item.title }, to: { type: "collection", id: collection.id, label: collection.title },
      source: "collection.itemIds", evidence: { itemId: id, collectionId: collection.id }
    });
    for (const relationship of explicit) if (relationship.fromItemId === id) connections.push({
      ...relationship, from: { type: "item", id, label: item.title }, derived: false
    });
  } else if (type === "genre") {
    const genreSlug = id.replace(/^genre_/, "");
    for (const item of Object.values(state.items || {})) {
      const genre = (item.genres || []).find(value => slug(value) === genreSlug);
      if (genre) connections.push({
        id: `derived_${hash(`${item.id}|genre|${genre}`)}`, kind: "contains", derived: true,
        from: { type: "genre", id, label: genre }, to: { type: "item", id: item.id, label: item.title },
        source: "record.genres", evidence: { itemId: item.id, field: "genres", value: genre }
      });
    }
  } else if (type === "collection") {
    const collection = state.collections?.[id];
    for (const itemId of collection?.itemIds || []) if (state.items[itemId]) connections.push({
      id: `derived_${hash(`${itemId}|collection|${id}`)}`, kind: "contains", derived: true,
      from: { type: "collection", id, label: collection.title }, to: { type: "item", id: itemId, label: labelForItem(state, itemId) },
      source: "collection.itemIds", evidence: { itemId, collectionId: id }
    });
  } else {
    for (const relationship of explicit) if (relationship.to.type === type && relationship.to.id === id) connections.push({
      ...relationship, from: { type: "item", id: relationship.fromItemId, label: labelForItem(state, relationship.fromItemId) }, derived: false
    });
  }
  return connections.sort((a, b) => a.kind.localeCompare(b.kind) || a.to.label.localeCompare(b.to.label));
}

export function getGraphSummary(state = getState()) {
  const items = Object.values(state.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const explicit = getExplicitRelationships(state);
  return {
    items: items.length,
    explicit: explicit.length,
    genres: new Set(items.flatMap(item => (item.genres || []).map(slug))).size,
    collections: Object.keys(state.collections || {}).length,
    entities: new Set(explicit.map(relationship => nodeKey(relationship.to.type, relationship.to.id))).size
  };
}

async function recordProtectedChange(label, mutator) {
  await createArchiveSnapshot(`Protected snapshot before relationship change: ${label}`, {
    kind: "pre_relationship_change", protected: true
  });
  const changeId = createId("relationchange");
  update(save => {
    const change = mutator(save);
    save.metadata.stage29.changeLog.push({ id: changeId, label, status: "applied", appliedAt: new Date().toISOString(), ...change });
  });
  return changeId;
}

export async function createManualRelationship(input) {
  const note = clean(input.evidenceNote);
  if (!note) throw new Error("Write a short evidence note explaining the connection.");
  const relationship = makeRelationshipRecord({
    ...input, source: "manual", evidence: { note, recordedBy: "archivist" }
  });
  if (getState().relationships?.[relationship.id]) throw new Error("That relationship is already filed.");
  await recordProtectedChange("create relationship", save => {
    save.relationships[relationship.id] = relationship;
    return { relationshipId: relationship.id, before: null, after: structuredClone(relationship) };
  });
  emit("RELATIONSHIP_CREATED", { itemId: relationship.fromItemId, wing: getState().items[relationship.fromItemId]?.wing, meta: { title: relationship.to.label, relationshipId: relationship.id } });
  return relationship.id;
}

export async function removeManualRelationship(relationshipId) {
  const relationship = getState().relationships?.[relationshipId];
  if (!relationship || relationship.source !== "manual") throw new Error("Only manually filed relationships can be removed here.");
  await recordProtectedChange("remove relationship", save => {
    const before = structuredClone(save.relationships[relationshipId]);
    delete save.relationships[relationshipId];
    return { relationshipId, before, after: null };
  });
  emit("RELATIONSHIP_REMOVED", { itemId: relationship.fromItemId, meta: { title: relationship.to.label, relationshipId } });
}

export async function undoRelationshipChange(changeId) {
  const change = getState().metadata.stage29?.changeLog?.find(entry => entry.id === changeId);
  if (!change || change.status !== "applied") throw new Error("Active relationship change not found.");
  await createArchiveSnapshot(`Protected snapshot before undoing relationship change ${changeId}`, {
    kind: "pre_relationship_undo", protected: true
  });
  update(save => {
    const live = save.metadata.stage29.changeLog.find(entry => entry.id === changeId);
    if (live.before) save.relationships[live.relationshipId] = structuredClone(live.before);
    else delete save.relationships[live.relationshipId];
    live.status = "undone";
    live.undoneAt = new Date().toISOString();
  });
}

let graphQuery = "";
let graphType = "all";
let selectedKey = "";

export function renderRelationshipGraph() {
  if (location.hash !== "#/relationships") return;
  const state = getState();
  const nodes = getGraphNodes(state, { query: graphQuery, type: graphType });
  if (!nodes.some(node => node.key === selectedKey)) selectedKey = nodes[0]?.key || "";
  const selected = nodes.find(node => node.key === selectedKey) || null;
  const connections = selected ? connectionsForNode(selected.type, selected.id, state) : [];
  const summary = getGraphSummary(state);
  const changes = [...(state.metadata.stage29?.changeLog || [])].reverse().slice(0, 20);
  document.querySelector("#view").innerHTML = `<section class="graph-hero panel"><div><span class="eyebrow">STAGE 29 // EVIDENCE-CARRYING CONNECTIONS</span><h2>RELATIONSHIP ATLAS</h2><p>Explore people, franchises, genres, places, collections, and experiences without losing the record that proves each link.</p></div><div class="graph-mark">NODES</div></section>
    <div class="voice-vitals"><div class="panel"><b>${summary.items}</b><span>ARCHIVE RECORDS</span></div><div class="panel"><b>${summary.entities}</b><span>EXPLICIT ENTITIES</span></div><div class="panel"><b>${summary.explicit}</b><span>EVIDENCE LINKS</span></div><div class="panel"><b>${summary.genres + summary.collections}</b><span>DERIVED SHELVES</span></div></div>
    <section class="panel graph-tools"><input type="search" data-graph-search aria-label="Search relationship nodes" placeholder="SEARCH TITLES, PEOPLE, FRANCHISES, PLACES" value="${esc(graphQuery)}"><select data-graph-type aria-label="Relationship node type">${["all","item","person","franchise","place","experience","genre","collection"].map(type => `<option value="${type}" ${type === graphType ? "selected" : ""}>${type.toUpperCase()}</option>`).join("")}</select></section>
    <div class="graph-workspace"><aside class="panel graph-node-list">${nodes.map(node => `<button class="${node.key === selectedKey ? "active" : ""}" data-graph-node="${esc(node.key)}"><b>${esc(node.label)}</b><span>${esc(node.type)} / ${node.connectionCount} LINKS</span></button>`).join("") || `<div class="empty"><b>NO MATCHING NODE.</b>Try a different search.</div>`}</aside>
    <main>${selected ? `<section class="panel graph-focus"><small>${esc(selected.type.toUpperCase())}</small><h3>${esc(selected.label)}</h3><p>${connections.length} visible evidence-backed connections</p></section>
      <section class="graph-connections">${connections.slice(0, 120).map(connection => `<article class="panel graph-edge"><span>${esc(connection.kind.replaceAll("_", " ").toUpperCase())}</span><h4>${esc(connection.to.label)}</h4><small>${esc(connection.to.type)} / ${connection.derived ? "DERIVED" : "FILED"}</small><details><summary>SHOW EVIDENCE</summary><pre>${esc(JSON.stringify(connection.evidence, null, 2))}</pre></details>${!connection.derived && connection.source === "manual" ? `<button class="button danger" data-remove-relationship="${connection.id}">REMOVE LINK</button>` : ""}</article>`).join("") || `<div class="panel empty"><b>NO CONNECTIONS FILED.</b>This node is ready for evidence.</div>`}</section>
      ${selected.type === "item" ? `<section class="panel graph-editor"><h3>FILE A RELATIONSHIP</h3><div class="graph-form"><select data-relation-type aria-label="Relationship target type"><option value="person">PERSON / CREATOR</option><option value="franchise">FRANCHISE / SERIES</option><option value="place">PLACE</option><option value="experience">EXPERIENCE</option></select><input data-relation-label aria-label="Relationship name" placeholder="NAME"><select data-relation-kind aria-label="Relationship kind"><option value="created_by">CREATED BY</option><option value="part_of">PART OF</option><option value="adapted_from">ADAPTED FROM</option><option value="located_at">LOCATED AT</option><option value="experienced_with">EXPERIENCED WITH</option></select><textarea data-relation-evidence rows="3" aria-label="Relationship evidence" placeholder="WHY IS THIS CONNECTION TRUE?"></textarea><button class="button primary" data-create-relationship="${esc(selected.id)}">FILE LINK</button></div></section>` : ""}` : `<div class="panel empty"><b>SELECT A NODE.</b>The Atlas will show its connections.</div>`}</main></div>
    <section class="panel ops-history"><h3>PROTECTED RELATIONSHIP LEDGER</h3>${changes.map(change => `<article class="ops-ledger"><span>${new Date(change.appliedAt).toLocaleString()}</span><b>${esc(change.label)}</b><em>${change.status.toUpperCase()}</em>${change.status === "applied" ? `<button class="button" data-undo-relationship="${change.id}">UNDO</button>` : ""}</article>`).join("") || "<p>NO MANUAL RELATIONSHIP CHANGES.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Relationship Atlas";
  document.querySelector("#view-code").textContent = "VAULT://RELATIONSHIPS";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-import-graph-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/import-graph.css"; link.dataset.importGraphStyles = ""; document.head.append(link);
  }
  if (!getState().metadata.stage29) update(save => {
    save.relationships ||= {};
    save.metadata.stage29 = { startedAt: new Date().toISOString(), changeLog: [], evidenceRequired: true, derivedLinks: true, protectedChanges: true };
  });
  document.addEventListener("click", async event => {
    const node = event.target.closest("[data-graph-node]");
    const create = event.target.closest("[data-create-relationship]");
    const remove = event.target.closest("[data-remove-relationship]");
    const undo = event.target.closest("[data-undo-relationship]");
    if (!node && !create && !remove && !undo) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (node) selectedKey = node.dataset.graphNode;
      else if (create) await createManualRelationship({
        fromItemId: create.dataset.createRelationship,
        toType: document.querySelector("[data-relation-type]").value,
        toLabel: document.querySelector("[data-relation-label]").value,
        kind: document.querySelector("[data-relation-kind]").value,
        evidenceNote: document.querySelector("[data-relation-evidence]").value
      });
      else if (remove) await removeManualRelationship(remove.dataset.removeRelationship);
      else await undoRelationshipChange(undo.dataset.undoRelationship);
      renderRelationshipGraph();
      if (!node) toast("RELATIONSHIP LEDGER UPDATED", "The evidence-backed graph changed safely.");
    } catch (error) { toast("RELATIONSHIP STOPPED", error.message, 7000); }
  }, true);
  document.addEventListener("input", event => {
    if (!event.target.matches("[data-graph-search]")) return;
    graphQuery = event.target.value; renderRelationshipGraph();
  }, true);
  document.addEventListener("change", event => {
    if (!event.target.matches("[data-graph-type]")) return;
    graphType = event.target.value; selectedKey = ""; renderRelationshipGraph();
  }, true);
  on("WING_VISITED", event => { if (event.wing === "relationships") setTimeout(renderRelationshipGraph, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderRelationshipGraph, 0));
  setTimeout(renderRelationshipGraph, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
