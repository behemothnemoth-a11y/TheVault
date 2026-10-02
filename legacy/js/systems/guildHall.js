import { emit, on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";
import { toast } from "../ui/notifications.js";
import { getExpeditions } from "./expeditions.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const complete = item => item?.status === "completed";

function seedCollections(save) {
  save.collections ||= {};
  const items = Object.values(save.items || {}).filter(item => !item.id.startsWith("tv_drive_"));
  const seeds = [
    {
      id: "collection_horror_archive", title: "The Horror Archive",
      description: "Every record filed under Horror.", rule: "genre:horror",
      itemIds: items.filter(item => (item.genres || []).some(genre => genre.toLowerCase().includes("horror"))).map(item => item.id)
    },
    {
      id: "collection_television_wing", title: "Television Wing",
      description: "The complete reconstructed television registry.", rule: "wing:tv",
      itemIds: items.filter(item => item.wing === "tv").map(item => item.id)
    },
    {
      id: "collection_owned_unfinished", title: "Owned & Unfinished",
      description: "Things already on the shelf that still have somewhere to go.", rule: "owned:unfinished",
      itemIds: items.filter(item => item.owned && !complete(item)).map(item => item.id)
    }
  ];
  for (const seed of seeds) {
    save.collections[seed.id] ||= {
      ...seed, createdAt: new Date().toISOString(), notes: "", milestones: [], status: "open"
    };
    if (save.collections[seed.id].rule) save.collections[seed.id].itemIds = seed.itemIds;
  }
  for (const [key, collection] of Object.entries(save.collections)) {
    if (!collection || typeof collection !== "object") continue;
    collection.id ||= key;
    collection.title ||= collection.name || key.replaceAll("_", " ");
    collection.description ||= "Legacy collection preserved during reconstruction.";
    collection.itemIds ||= Array.isArray(collection.items) ? collection.items.map(item => typeof item === "string" ? item : item?.id).filter(id => save.items[id]) : [];
    collection.createdAt ||= new Date().toISOString();
    collection.notes ||= ""; collection.milestones ||= []; collection.status ||= "open";
  }
}

export function refreshCollections() {
  update(seedCollections);
  return getState().collections;
}

export function collectionReport(collection, state = getState()) {
  const items = collection.itemIds.map(id => state.items[id]).filter(Boolean);
  const completed = items.filter(complete).length;
  return { items, completed, total: items.length, percent: items.length ? Math.round(completed / items.length * 100) : 0 };
}

export function sealCollection(collectionId) {
  const collection = getState().collections?.[collectionId];
  if (!collection) throw new Error("Collection not found.");
  const report = collectionReport(collection);
  if (!report.total || report.completed !== report.total) throw new Error("A collection can only be sealed at 100%.");
  update(save => {
    const target = save.collections[collectionId];
    target.status = "sealed";
    target.sealedAt = new Date().toISOString();
    target.milestones.push({ id: createId("milestone"), type: "sealed", at: target.sealedAt });
  });
  emit("COLLECTION_SEALED", { meta: { title: collection.title, collectionId, total: report.total } });
}

function startExpedition(id) {
  update(save => {
    save.expeditions[id] = { status: "active", startedAt: new Date().toISOString(), history: save.expeditions[id]?.history || [] };
  });
  emit("EXPEDITION_STARTED", { meta: { title: id, expeditionId: id } });
}

function abandonExpedition(id) {
  update(save => {
    const expedition = save.expeditions[id];
    expedition.history ||= [];
    expedition.history.push({ status: "abandoned", at: new Date().toISOString(), startedAt: expedition.startedAt });
    expedition.status = "available";
    expedition.startedAt = null;
  });
  emit("EXPEDITION_ABANDONED", { meta: { title: id, expeditionId: id } });
}

function claimExpedition(id) {
  const expedition = getExpeditions().find(entry => entry.id === id);
  if (!expedition?.complete || expedition.status !== "active") throw new Error("The Expedition objectives are not complete.");
  update(save => {
    const target = save.expeditions[id];
    target.status = "completed";
    target.completedAt = new Date().toISOString();
    target.history ||= [];
    target.history.push({ status: "completed", at: target.completedAt, startedAt: target.startedAt });
  });
  emit("EXPEDITION_COMPLETED", { meta: { title: expedition.title, expeditionId: id, reward: expedition.reward } });
}

export function renderGuildHall() {
  if (location.hash !== "#/guild") return;
  const state = getState();
  const collections = Object.values(state.collections || {});
  const expeditions = getExpeditions();
  document.querySelector("#view").innerHTML = `<section class="guild-hero panel"><span class="eyebrow">STAGE 12 // COLLECTIONS & EXPEDITIONS</span><h2>THE GUILD HALL</h2>
    <p>Collections are curated archive objects. Expeditions reward curiosity and can be abandoned without punishment.</p></section>
    <section class="panel guild-toolbar"><button class="button" data-refresh-collections>REFRESH RULE-BASED MEMBERSHIP</button><span>${collections.length} COLLECTIONS · ${expeditions.length} EXPEDITIONS</span></section>
    <div class="guild-grid">${collections.map(collection => { const report = collectionReport(collection, state); return `<article class="panel guild-card ${collection.status === "sealed" ? "sealed" : ""}"><small>${esc(collection.id)} · ${collection.status.toUpperCase()}</small><h3>${esc(collection.title)}</h3><p>${esc(collection.description)}</p>
      <div class="progress"><span style="width:${report.percent}%"></span></div><b>${report.completed}/${report.total} · ${report.percent}%</b>
      ${collection.status !== "sealed" && report.total && report.completed === report.total ? `<button class="button primary" data-seal-collection="${collection.id}">SEAL COLLECTION</button>` : ""}</article>`; }).join("")}</div>
    <section class="panel guild-board"><div class="panel__header"><h2>EXPEDITION BOARD</h2><span class="panel__code">FAILURE-FREE</span></div>${expeditions.map(expedition => `<article class="guild-quest"><header><div><small>${expedition.status.toUpperCase()}</small><h3>${esc(expedition.title)}</h3><p>${esc(expedition.description)}</p></div><b>${esc(expedition.reward)}</b></header>
      ${expedition.objectives.map(objective => `<div class="expedition-objective ${objective.done ? "done" : ""}"><span>${objective.done ? "☒" : "☐"}</span><span>${esc(objective.label)} (${objective.count}/${objective.target})</span></div>`).join("")}
      <div class="button-row">${expedition.status === "available" ? `<button class="button primary" data-start-quest="${expedition.id}">BEGIN</button>` : expedition.status === "active" ? `<button class="button" data-abandon-quest="${expedition.id}">ABANDON WITHOUT PENALTY</button>${expedition.complete ? `<button class="button primary" data-claim-quest="${expedition.id}">COMPLETE EXPEDITION</button>` : ""}` : `<span class="guild-stamp">EXPEDITION COMPLETE</span>`}</div></article>`).join("")}</section>`;
  document.querySelector("#view-title").textContent = "The Guild Hall";
  document.querySelector("#view-code").textContent = "VAULT://GUILD";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!document.querySelector("link[data-guild-styles]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "./css/guild-hall.css"; link.dataset.guildStyles = ""; document.head.append(link);
  }
  update(save => {
    seedCollections(save);
    save.metadata.stage12 ||= { startedAt: new Date().toISOString(), firstClassCollections: true, failureFreeExpeditions: true };
  });
  document.addEventListener("click", event => {
    const start = event.target.closest("[data-start-quest]");
    const abandon = event.target.closest("[data-abandon-quest]");
    const claim = event.target.closest("[data-claim-quest]");
    const seal = event.target.closest("[data-seal-collection]");
    const refresh = event.target.closest("[data-refresh-collections]");
    if (!start && !abandon && !claim && !seal && !refresh) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (start) startExpedition(start.dataset.startQuest);
      else if (abandon) abandonExpedition(abandon.dataset.abandonQuest);
      else if (claim) claimExpedition(claim.dataset.claimQuest);
      else if (seal) sealCollection(seal.dataset.sealCollection);
      else refreshCollections();
      renderGuildHall();
      toast("GUILD LEDGER UPDATED", "The archive recorded the decision.");
    } catch (error) { toast("GUILD ACTION STOPPED", error.message, 6000); }
  }, true);
  on("WING_VISITED", event => { if (event.wing === "guild") setTimeout(renderGuildHall, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderGuildHall, 0));
  setTimeout(renderGuildHall, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
