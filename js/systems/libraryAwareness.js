import { emit } from "../core/events.js";
import { getState, update } from "../core/store.js";

const normalized = value => String(value || "").replaceAll("/", "\\").toLowerCase();

export async function runLibraryAwareness() {
  const response = await fetch("./__vault/inventory", { method: "POST", headers: { "X-Vault-Request": "scan-tv-library" } });
  if (!response.ok) throw new Error(`Library check returned ${response.status}.`);
  const inventory = await response.json(), state = getState();
  const linked = new Set(Object.values(state.items || {}).filter(item => item.wing === "tv").flatMap(item => Object.values(item.episodes || {})).map(episode => normalized(episode.sourcePath)).filter(Boolean));
  const known = inventory.files.filter(file => linked.has(normalized(file.path))), informational = inventory.files.filter(file => !linked.has(normalized(file.path)));
  const prior = state.metadata.lifeDashboard.libraryPulse;
  const pulse = {
    scannedAt: inventory.scannedAt, root: inventory.root, durationMs: inventory.durationMs,
    fileCount: inventory.fileCount, linkedKnown: known.length, informationalCount: informational.length,
    changeSinceLast: prior ? inventory.fileCount - Number(prior.fileCount || 0) : 0,
    sample: informational.slice(0, 12).map(file => ({ name: file.name, path: file.path, bytes: file.bytes })),
    note: "Unfiled video remains informational because DVD rips are intentional."
  };
  update(save => { save.metadata.lifeDashboard.libraryPulse = pulse; });
  emit("LIFE_LIBRARY_CHECKED", { meta: { title: `${pulse.fileCount} TV files observed`, linkedKnown: pulse.linkedKnown, informational: pulse.informationalCount } });
  return pulse;
}
