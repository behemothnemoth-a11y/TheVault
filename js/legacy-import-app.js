import { sampleItems } from "../data/sample-data.js";
import { emit, on } from "./core/events.js";
import { getState, initStore, recordEvent, update } from "./core/store.js";
import { mergeLegacyImport, parseLegacyVault } from "./systems/legacyImport.js";
import { runHealthCheck } from "./systems/health.js";
import { toast } from "./ui/notifications.js";

const fileInput = document.querySelector("#legacy-files");
const reportNode = document.querySelector("#report");
const manifest = document.querySelector("#manifest");
const status = document.querySelector("#status");
const warnings = document.querySelector("#warnings");
let parsedImport = null;

initStore(sampleItems);
on("*", recordEvent);

fileInput.onchange = async () => {
  const files = [...fileInput.files];
  const htmlFile = files.find(file => /\.html?$/i.test(file.name) || file.type === "text/html");
  const jsonFile = files.find(file => /\.json$/i.test(file.name) || file.type === "application/json");
  if (!htmlFile) {
    parsedImport = null;
    reportNode.classList.remove("ready");
    status.textContent = "THE LEGACY HTML FILE IS REQUIRED.";
    return;
  }
  status.textContent = `SCANNING ${htmlFile.name.toUpperCase()}...`;
  try {
    const progress = jsonFile ? JSON.parse(await jsonFile.text()) : {};
    parsedImport = parseLegacyVault(await htmlFile.text(), progress);
    const existing = new Set(Object.keys(getState().items));
    const conflicts = Object.keys(parsedImport.items).filter(id => existing.has(id)).length;
    const values = {
      "TOP-LEVEL RECORDS": parsedImport.report.records,
      "INDIVIDUAL EPISODES": parsedImport.report.episodes,
      "COLLECTIONS": parsedImport.report.collections,
      "COMPLETED RECORDS": parsedImport.report.completed,
      "RATINGS RECOVERED": parsedImport.report.ratings,
      "NOTES RECOVERED": parsedImport.report.notes,
      "ID CONFLICTS": conflicts,
      "WARNINGS": parsedImport.warnings.length
    };
    manifest.innerHTML = Object.entries(values).map(([label, value]) => `<div><b>${value.toLocaleString()}</b>${label}</div>`).join("");
    document.querySelector("#progress-note").className = jsonFile ? "amber" : "muted";
    document.querySelector("#progress-note").textContent = jsonFile
      ? "Legacy progress detected. Checks, ratings, notes, rewatches, and custom seasons will be recovered."
      : "Catalog only: browser progress cannot be recovered from HTML alone. Export progress from the old Vault and rescan both files if possible.";
    warnings.textContent = parsedImport.warnings.length ? parsedImport.warnings.join("\n") : "NO STRUCTURAL WARNINGS.";
    status.textContent = "SCAN COMPLETE. REVIEW THE MANIFEST BELOW.";
    reportNode.classList.add("ready");
  } catch (error) {
    parsedImport = null;
    reportNode.classList.remove("ready");
    status.textContent = `SCAN FAILED: ${error.message}`;
  }
};

document.querySelector("#merge").onclick = () => {
  if (!parsedImport) return;
  const removeSampleData = document.querySelector("#remove-samples").checked;
  let conflicts = [];
  try {
    update(save => { conflicts = mergeLegacyImport(save, parsedImport, { removeSampleData }); });
    emit("LEGACY_IMPORT_COMPLETED", {
      meta: { title: "vault.v1", ...parsedImport.report, conflicts: conflicts.length }
    });
    const health = runHealthCheck();
    if (!health.ok) throw new Error(health.issues.slice(0, 3).join(" "));
    toast("LEGACY ARCHIVE MERGED", `${parsedImport.report.records.toLocaleString()} records and ${parsedImport.report.episodes.toLocaleString()} episodes recovered.`, 8000);
    status.textContent = `MERGE COMPLETE. ${conflicts.length} EXISTING RECORDS WERE PRESERVED INSTEAD OF OVERWRITTEN.`;
    document.querySelector("#merge").disabled = true;
    document.querySelector("#merge").textContent = "IMPORT ARCHIVED";
  } catch (error) {
    toast("MERGE HALTED", error.message, 8000);
    status.textContent = `MERGE HALTED: ${error.message}`;
  }
};
