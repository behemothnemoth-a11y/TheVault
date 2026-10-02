import { getState, update } from "../core/store.js";
import { createId } from "../core/ids.js";
import { renderAtomicWingShell } from "../ui/atomicWingShell.js";
import { closeModal, openModal } from "../ui/modals.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

// PROJECTS: things you are making, whatever the medium. Woodwork, props, drawing,
// pixel art, restorations. Game-related building stays in the Games Workshop.

export const STATUS = {
  idea: "IDEA",
  active: "IN PROGRESS",
  paused: "PAUSED",
  done: "FINISHED",
  abandoned: "SET ASIDE"
};
const ORDER = ["active", "idea", "paused", "done", "abandoned"];

const meta = item => item.projectMeta || {};
export const projectRecords = (state = getState()) =>
  Object.values(state.items || {}).filter(item => item.wing === "projects");

export function ensureProjectModel() {
  const missing = projectRecords().filter(item => !item.projectMeta);
  if (!missing.length) return;
  update(save => {
    for (const item of missing) {
      const record = save.items[item.id];
      if (!record) continue;
      record.projectMeta = { status: "idea", notes: "", medium: "", startedAt: "", finishedAt: "" };
    }
  });
}

export function setProjectStatus(id, status) {
  if (!STATUS[status]) return false;
  update(save => {
    const record = save.items[id];
    if (!record) return;
    record.projectMeta ||= {};
    record.projectMeta.status = status;
    const stamp = new Date().toISOString();
    if (status === "active" && !record.projectMeta.startedAt) record.projectMeta.startedAt = stamp;
    if (status === "done") record.projectMeta.finishedAt = stamp;
  });
  return true;
}

export function openProjectEditor(id, onChanged = () => {}) {
  const item = getState().items[id];
  if (!item) return;
  const data = meta(item);
  openModal({
    title: "EDIT PROJECT",
    body: `<div class="games3-edit"><label>TITLE<input data-project-title value="${esc(item.title)}"></label><label>MEDIUM<input data-project-medium value="${esc(data.medium || "")}" placeholder="woodwork, drawing, props, restoration…"></label><label>NOTES<textarea data-project-notes>${esc(data.notes || item.description || "")}</textarea></label></div>`,
    actions: [{
      label: "SAVE", primary: true, handler: dialog => {
        const title = dialog.querySelector("[data-project-title]").value.trim();
        const medium = dialog.querySelector("[data-project-medium]").value.trim();
        const notes = dialog.querySelector("[data-project-notes]").value;
        update(save => {
          const record = save.items[id];
          if (!record) return;
          if (title) record.title = title;
          record.projectMeta ||= {};
          record.projectMeta.medium = medium;
          record.projectMeta.notes = notes;
        });
        closeModal();
        onChanged();
      }
    }]
  });
}

export function openProjectAdd(onCreated = () => {}) {
  openModal({
    title: "NEW PROJECT",
    body: `<div class="games3-edit"><label>TITLE<input data-project-title autofocus></label><label>MEDIUM<input data-project-medium placeholder="woodwork, drawing, props, restoration…"></label><label>NOTES<textarea data-project-notes></textarea></label></div>`,
    actions: [{
      label: "CREATE", primary: true, handler: dialog => {
        const title = dialog.querySelector("[data-project-title]").value.trim();
        if (!title) return;
        const id = createId("project");
        update(save => {
          save.items[id] = {
            id, wing: "projects", type: "project", title,
            description: "", artwork: "", favorite: false,
            addedAt: new Date().toISOString(),
            projectMeta: {
              status: "idea",
              medium: dialog.querySelector("[data-project-medium]").value.trim(),
              notes: dialog.querySelector("[data-project-notes]").value,
              startedAt: "", finishedAt: ""
            }
          };
        });
        closeModal();
        onCreated(id);
      }
    }]
  });
}

function card(item) {
  const data = meta(item);
  const note = String(data.notes || item.description || "").trim();
  const facts = [STATUS[data.status] || "IDEA", data.medium || ""].filter(Boolean);
  return `<article class="projects-card"><header><h3>${esc(item.title)}</h3><span>${esc(facts.join(" · "))}</span></header><p>${esc(note || "No notes yet.")}</p><div><select data-project-status="${esc(item.id)}">${ORDER.map(key => `<option value="${key}" ${data.status === key ? "selected" : ""}>${STATUS[key]}</option>`).join("")}</select><button data-project-edit="${esc(item.id)}">EDIT</button></div></article>`;
}

export function renderProjects(search = "") {
  ensureProjectModel();
  const query = String(search || "").trim().toLowerCase();
  const all = projectRecords().filter(item => !query
    || `${item.title} ${meta(item).medium || ""} ${meta(item).notes || ""}`.toLowerCase().includes(query));
  const groups = ORDER
    .map(status => ({ status, items: all.filter(item => (meta(item).status || "idea") === status) }))
    .filter(group => group.items.length);
  const content = `<div class="projects-wing">
    <section class="projects-command panel"><div><span class="eyebrow">VAULT WING // PROJECTS</span><h2>THINGS YOU ARE MAKING</h2></div><aside><button class="button primary" data-project-add>+ NEW PROJECT</button></aside></section>
    ${all.length ? groups.map(group => `<section class="games2-panel"><header><div><h2>${STATUS[group.status]} · ${group.items.length}</h2></div></header><div class="projects-grid">${group.items.map(card).join("")}</div></section>`).join("")
      : `<section class="games2-panel"><h2>NOTHING HERE YET</h2><p>Projects are things you are making, whatever the medium. Game building lives in the Games Workshop.</p></section>`}
  </div>`;
  return renderAtomicWingShell({ active: "projects", title: "PROJECTS", section: "WORKSHOP", content, footer: "PROJECTS // THINGS YOU ARE MAKING" });
}
