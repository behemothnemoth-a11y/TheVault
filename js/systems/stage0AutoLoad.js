const STORAGE_KEY = "vault_reconstruction_v1";
const RECOVERY_URL = new URL("../../recovery/vault-reconstruction-stage-0-repaired-2026-07-29.json", import.meta.url);
const EXPECTED_SHA256 = "4A2603A0495FB275BE05C159B8764B02D638BD822B3FCF42F29CC61EA3D10C34";
const FAILURE_KEY = "vault_stage0_auto_load_failure";

function hasStage0Recovery(raw) {
  if (!raw) return false;
  try {
    return Boolean(JSON.parse(raw)?.metadata?.stage0Recovery?.completedAt);
  } catch {
    return false;
  }
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function compactForBrowser(save) {
  let removedEpisodeLegacyKeys = 0;
  let removedEmptyDefaults = 0;
  for (const item of Object.values(save.items || {})) {
    for (const name of ["rating", "note", "addedAt", "year"]) {
      if (item[name] == null || item[name] === "") {
        if (Object.hasOwn(item, name)) removedEmptyDefaults++;
        delete item[name];
      }
    }
    if (item.wing !== "tv") continue;
    for (const episode of Object.values(item.episodes || {})) {
      if (Object.hasOwn(episode, "legacyKey")) {
        delete episode.legacyKey;
        removedEpisodeLegacyKeys++;
      }
      for (const name of ["rating", "note"]) {
        if (episode[name] == null || episode[name] === "") {
          if (Object.hasOwn(episode, name)) removedEmptyDefaults++;
          delete episode[name];
        }
      }
      if (episode.rewatches === 0) {
        delete episode.rewatches;
        removedEmptyDefaults++;
      }
    }
  }
  save.metadata.stage0Recovery.runtimeCompaction = {
    removedEpisodeLegacyKeys,
    removedEmptyDefaults,
    fullAuditCopy: "recovery/vault-reconstruction-stage-0-repaired-2026-07-29.json"
  };
  return save;
}

function validate(save) {
  const items = Object.values(save.items || {});
  const episodes = items.filter(item => item.wing === "tv").flatMap(item => Object.values(item.episodes || {}));
  const linked = episodes.filter(episode => episode.sourcePath).length;
  const recovery = save.metadata?.stage0Recovery?.imported;
  if (items.length !== 3543) throw new Error(`Expected 3543 items; found ${items.length}.`);
  if (episodes.length !== 13055) throw new Error(`Expected 13055 TV episodes; found ${episodes.length}.`);
  if (linked !== 11941) throw new Error(`Expected 11941 linked episodes; found ${linked}.`);
  if (recovery?.restoredCombinedFileEpisodes !== 25) throw new Error("Combined-file recovery marker is invalid.");
}

function showFailure(message) {
  const render = () => {
    if (document.querySelector("[data-stage0-load-error]")) return;
    const notice = document.createElement("div");
    notice.dataset.stage0LoadError = "";
    notice.setAttribute("role", "alert");
    notice.style.cssText = "position:fixed;z-index:99999;left:20px;right:20px;bottom:20px;padding:16px 18px;background:#301915;color:#ffe9d2;border:1px solid #b85b48;font:600 13px/1.5 monospace;box-shadow:0 12px 40px #000";
    notice.textContent = `STAGE 0 DATA IS SAFE ON D: â€” AUTOMATIC LOAD PAUSED: ${message}`;
    document.body.append(notice);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
}

async function loadStage0Once() {
  // Desktop migration explicitly transfers the current archive in initStore.
  // The historical recovery seed must not replace that transfer on a new profile.
  if (globalThis.vaultDesktopReady) return;
  // Existing saves belong to the user even when they predate the recovery marker.
  if (localStorage.getItem(STORAGE_KEY)) {
    sessionStorage.removeItem(FAILURE_KEY);
    return;
  }
  try {
    const response = await fetch(RECOVERY_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Recovery file returned ${response.status}.`);
    const bytes = await response.arrayBuffer();
    const checksum = hex(await crypto.subtle.digest("SHA-256", bytes));
    if (checksum !== EXPECTED_SHA256) throw new Error("Recovery checksum did not match.");
    const save = JSON.parse(new TextDecoder().decode(bytes));
    validate(save);
    const compact = JSON.stringify(compactForBrowser(save));
    localStorage.setItem(STORAGE_KEY, compact);
    sessionStorage.removeItem(FAILURE_KEY);
    location.reload();
  } catch (error) {
    const message = error?.name === "QuotaExceededError"
      ? "the browser needs a larger storage system before this archive can be loaded"
      : error.message;
    sessionStorage.setItem(FAILURE_KEY, message);
    showFailure(message);
    throw error;
  }
}

export const stage0Ready = loadStage0Once();
