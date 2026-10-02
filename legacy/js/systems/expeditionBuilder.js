import { on } from "../core/events.js";
import { createId } from "../core/ids.js";
import { createArchiveSnapshot, getState, update } from "../core/store.js";
import { closeModal, openModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";

const allowedEvents = ["ITEM_COMPLETED", "EPISODE_COMPLETED", "NOTE_ADDED", "ITEM_RATED", "WING_VISITED", "ANCIENT_BACKLOG_COMPLETED", "COLLECTION_SEALED", "SHOW_SEALED"];
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "quest";

function validateObjectives(objectives) {
  if (!Array.isArray(objectives) || !objectives.length) throw new Error("Add at least one objective.");
  return objectives.map((objective, index) => {
    const eventType = String(objective.eventType || "").toUpperCase();
    if (!allowedEvents.includes(eventType)) throw new Error(`Unsupported event type on objective ${index + 1}.`);
    const target = Math.max(1, Math.min(1000, Number(objective.target || 1)));
    return {
      id: objective.id || createId("objective"), label: String(objective.label || "").trim() || `Objective ${index + 1}`,
      eventType, target, optional: Boolean(objective.optional), hidden: Boolean(objective.hidden),
      uniqueBy: objective.uniqueBy === "wing" ? "wing" : null
    };
  });
}

async function commit(label, definitionId, mutator) {
  const before = definitionId ? structuredClone(getState().metadata.stage19.definitions[definitionId] || null) : null;
  await createArchiveSnapshot(`Protected snapshot before Expedition change: ${label}`, { kind: "pre_expedition_change", protected: true });
  const changeId = createId("expeditionchange");
  update(save => {
    mutator(save);
    const id = definitionId || save.metadata.stage19.pendingCreatedId;
    save.metadata.stage19.changeLog.push({
      id: changeId, definitionId: id, label, before,
      after: structuredClone(save.metadata.stage19.definitions[id] || null),
      status: "applied", appliedAt: new Date().toISOString()
    });
    delete save.metadata.stage19.pendingCreatedId;
  });
  return changeId;
}

export async function createExpeditionDefinition({ title, description = "", reward = "75 XP", objectives }) {
  if (!String(title).trim()) throw new Error("An Expedition needs a title.");
  let id = `expedition_custom_${slug(title)}`;
  if (getState().metadata.stage19.definitions[id]) id = `${id}_${createId("q").split("_").at(-1)}`;
  const clean = validateObjectives(objectives);
  await commit("create Expedition", null, save => {
    save.metadata.stage19.definitions[id] = {
      id, title: String(title).trim(), description: String(description).trim(),
      reward: String(reward).trim(), objectives: clean, createdAt: new Date().toISOString(),
      status: "available", custom: true
    };
    save.metadata.stage19.pendingCreatedId = id;
  });
  return id;
}

export async function editExpeditionDefinition(id, patch) {
  if (!getState().metadata.stage19.definitions[id]) throw new Error("Expedition definition not found.");
  await commit("edit Expedition", id, save => {
    const target = save.metadata.stage19.definitions[id];
    if (patch.title != null && String(patch.title).trim()) target.title = String(patch.title).trim();
    if (patch.description != null) target.description = String(patch.description).trim();
    if (patch.reward != null) target.reward = String(patch.reward).trim();
    if (patch.objectives) target.objectives = validateObjectives(patch.objectives);
  });
}

export async function archiveExpeditionDefinition(id) {
  await commit("archive Expedition", id, save => { save.metadata.stage19.definitions[id].status = "archived"; });
}

export async function undoExpeditionChange(changeId) {
  const change = getState().metadata.stage19.changeLog.find(entry => entry.id === changeId);
  if (!change || change.status !== "applied") throw new Error("Active Expedition change not found.");
  await createArchiveSnapshot(`Protected snapshot before Expedition undo ${changeId}`, { kind: "pre_expedition_undo", protected: true });
  update(save => {
    const live = save.metadata.stage19.changeLog.find(entry => entry.id === changeId);
    if (live.before) save.metadata.stage19.definitions[live.definitionId] = structuredClone(live.before);
    else delete save.metadata.stage19.definitions[live.definitionId];
    live.status = "undone"; live.undoneAt = new Date().toISOString();
  });
}

function parseObjectiveLines(value) {
  return String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [label, eventType, target, flags = ""] = line.split("|").map(part => part.trim());
    return { label, eventType, target, optional: flags.toLowerCase().includes("optional"), hidden: flags.toLowerCase().includes("hidden"), uniqueBy: flags.toLowerCase().includes("unique wing") ? "wing" : null };
  });
}

function openBuilder(definition = null) {
  const lines = definition?.objectives?.map(objective => `${objective.label} | ${objective.eventType} | ${objective.target} | ${[objective.optional ? "optional" : "", objective.hidden ? "hidden" : "", objective.uniqueBy ? "unique wing" : ""].filter(Boolean).join(", ")}`).join("\n") || "Archive three items | ITEM_COMPLETED | 3 |\nVisit three wings | WING_VISITED | 3 | unique wing";
  openModal({
    title: definition ? "EDIT EXPEDITION" : "BUILD EXPEDITION",
    body: `<label>TITLE</label><input data-quest-title value="${esc(definition?.title || "")}"><label>DESCRIPTION</label><textarea data-quest-description>${esc(definition?.description || "")}</textarea><label>REWARD</label><input data-quest-reward value="${esc(definition?.reward || "75 XP")}"><label>OBJECTIVES — LABEL | EVENT | TARGET | OPTIONAL/HIDDEN/UNIQUE WING</label><textarea rows="8" data-quest-objectives>${esc(lines)}</textarea><small>EVENTS: ${allowedEvents.join(", ")}</small>`,
    actions: [{ label: definition ? "FILE CHANGES" : "CREATE EXPEDITION", primary: true, async handler(modal) {
      try {
        const patch = {
          title: modal.querySelector("[data-quest-title]").value,
          description: modal.querySelector("[data-quest-description]").value,
          reward: modal.querySelector("[data-quest-reward]").value,
          objectives: parseObjectiveLines(modal.querySelector("[data-quest-objectives]").value)
        };
        if (definition) await editExpeditionDefinition(definition.id, patch);
        else await createExpeditionDefinition(patch);
        closeModal(); renderExpeditionBuilder(); toast("EXPEDITION FILED", patch.title);
      } catch (error) { toast("EXPEDITION STOPPED", error.message, 6500); }
    }}]
  });
}

export function renderExpeditionBuilder() {
  if (location.hash !== "#/expedition-builder") return;
  const stage = getState().metadata.stage19;
  const definitions = Object.values(stage.definitions).filter(definition => definition.status !== "archived");
  const changes = [...stage.changeLog].reverse();
  document.querySelector("#view").innerHTML = `<section class="guild-hero panel"><span class="eyebrow">STAGE 19 // QUEST AUTHORING</span><h2>EXPEDITION BUILDER</h2><p>Build failure-free quests from canonical events. Optional and classified objectives remain evidence-based.</p></section>
    <section class="panel guild-toolbar"><button class="button primary" data-new-expedition>BUILD EXPEDITION</button><span>${definitions.length} CUSTOM DEFINITIONS</span></section>
    <div class="guild-grid">${definitions.map(definition => `<article class="panel guild-card"><small>${esc(definition.id)} · ${definition.status.toUpperCase()}</small><h3>${esc(definition.title)}</h3><p>${esc(definition.description)}</p>${definition.objectives.map(objective => `<div class="expedition-objective"><span>${objective.hidden ? "▓" : "☐"}</span><span>${objective.hidden ? "CLASSIFIED OBJECTIVE" : esc(objective.label)} · ${objective.target} ${objective.eventType}${objective.optional ? " · OPTIONAL" : ""}</span></div>`).join("")}<div class="button-row"><button class="button" data-edit-expedition="${definition.id}">EDIT</button><button class="button danger" data-archive-expedition="${definition.id}">ARCHIVE</button></div></article>`).join("") || `<div class="panel empty"><b>NO CUSTOM EXPEDITIONS.</b>The standard Guild board remains available.</div>`}</div>
    <section class="panel ops-history"><h3>REVERSIBLE CHANGE LEDGER</h3>${changes.slice(0, 30).map(change => `<article class="ops-ledger"><span>${new Date(change.appliedAt).toLocaleString()}</span><b>${esc(change.label)}</b><em>${change.status.toUpperCase()}</em>${change.status === "applied" ? `<button class="button" data-undo-expedition="${change.id}">UNDO</button>` : ""}</article>`).join("") || "<p>NO EXPEDITION CHANGES YET.</p>"}</section>`;
  document.querySelector("#view-title").textContent = "Expedition Builder";
  document.querySelector("#view-code").textContent = "VAULT://EXPEDITION_BUILDER";
}

function install() {
  if (!getState() || !document.querySelector("#view")) return false;
  if (!getState().metadata.stage19) update(save => { save.metadata.stage19 = { startedAt: new Date().toISOString(), definitions: {}, changeLog: [], protectedChanges: true }; });
  document.addEventListener("click", async event => {
    const edit = event.target.closest("[data-edit-expedition]");
    const archive = event.target.closest("[data-archive-expedition]");
    const undo = event.target.closest("[data-undo-expedition]");
    if (event.target.closest("[data-new-expedition]")) { event.preventDefault(); event.stopImmediatePropagation(); return openBuilder(); }
    if (edit) { event.preventDefault(); event.stopImmediatePropagation(); return openBuilder(getState().metadata.stage19.definitions[edit.dataset.editExpedition]); }
    if (!archive && !undo) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (archive) await archiveExpeditionDefinition(archive.dataset.archiveExpedition);
      else await undoExpeditionChange(undo.dataset.undoExpedition);
      renderExpeditionBuilder(); toast("EXPEDITION UPDATED", "Protected change recorded.");
    } catch (error) { toast("EXPEDITION STOPPED", error.message, 6500); }
  }, true);
  on("WING_VISITED", event => { if (event.wing === "expedition-builder") setTimeout(renderExpeditionBuilder, 0); });
  window.addEventListener("hashchange", () => setTimeout(renderExpeditionBuilder, 0));
  setTimeout(renderExpeditionBuilder, 100);
  return true;
}
function schedule(attempt = 0) { if (install() || attempt >= 200) return; setTimeout(() => schedule(attempt + 1), 25); }
setTimeout(() => schedule(), 0);
