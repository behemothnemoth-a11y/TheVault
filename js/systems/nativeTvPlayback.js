import { getState, update, flushPersistence } from "../core/store.js";
import { openModal, closeModal } from "../ui/modals.js";
import { toast } from "../ui/notifications.js";
import { escapeHtml } from "../ui/safeHtml.js";
import { beginPlaybackSession } from "./playbackLifecycle.js";
import { applyVlcProgress, nextPlayableEpisode, refreshTvProgress, setEpisodeWatched } from "./tvPlaybackState.js";

const terminalStates = new Set(["closed", "ended", "error"]);
const monitors = new Map();
let launching = false;
let changed = () => {};
const sessions = () => getState().metadata?.vlcPlaybackSessions || [];
if (globalThis.vaultDesktopReady) window.addEventListener("vault-desktop-player-closed", () => closeModal());

async function request(action, body) {
  if (action === "start" && globalThis.vaultDesktopReady) {
    const bridge = await globalThis.vaultDesktopReady;
    const result = JSON.parse(await new Promise(resolve => bridge.startPlayback(JSON.stringify(body), resolve)));
    if (!result.ready) throw new Error(result.error || "The embedded player could not open.");
    return result;
  }
  const response = await fetch(`./__vault/media/native/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": `native-${action}` }, body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The Vault player is unavailable. Restart the Vault launcher to load the player update.");
  return payload;
}

function monitor(token) {
  if (monitors.has(token)) return monitors.get(token);
  const context = { timer: null, busy: null, report: null, failures: 0, closed: false, lastSaved: 0, lastState: "" };
  context.poll = () => {
    if (context.busy) return context.busy;
    context.busy = (async () => {
      const session = sessions().find(value => value.token === token);
      if (!session) return;
      try {
        const report = await request("status", { token });
        context.report = report;
        context.failures = 0;
        const saveNow = terminalStates.has(report.state) || report.started && (!session.startedRecorded || Date.now() - context.lastSaved >= 10000 || report.state !== context.lastState);
        if (saveNow) {
          if (report.started && !session.startedRecorded) beginPlaybackSession(session.showId, session.episodeId, report.path);
          update(state => {
          const stored = state.metadata.vlcPlaybackSessions?.find(value => value.token === token);
          const show = state.items[session.showId], episode = show?.episodes?.[session.episodeId];
          if (stored && episode) applyVlcProgress(show, episode, stored, report);
          if (terminalStates.has(report.state)) state.metadata.vlcPlaybackSessions = (state.metadata.vlcPlaybackSessions || []).filter(value => value.token !== token);
          });
          await flushPersistence();
          context.lastSaved = Date.now();
          // The native surface covers the library. Rebuilding every card for
          // each progress checkpoint adds work without changing anything visible.
          if (terminalStates.has(report.state)) changed();
        }
        context.lastState = report.state;
        const label = document.querySelector(`[data-vlc-status="${token}"]`);
        if (label) label.textContent = report.error || `${report.state.toUpperCase()} · ${Math.floor((report.currentSeconds || 0) / 60)}:${String(Math.floor((report.currentSeconds || 0) % 60)).padStart(2, "0")}${report.alternateUsed ? " · USING READABLE ALTERNATE COPY" : ""}`;
        if (terminalStates.has(report.state)) {
          context.closed = true;
          clearTimeout(context.timer);
          if (report.state === "error") toast("VLC PLAYBACK STOPPED", report.error || "The player could not continue.", 10000);
        }
      } catch (error) {
        context.failures++;
        if (context.failures === 3) toast("PLAYER CONNECTION INTERRUPTED", "VLC can keep playing. Progress will reconnect when the Vault server returns.", 10000);
      }
    })().finally(() => {
      context.busy = null;
      if (!context.closed && sessions().some(value => value.token === token)) context.timer = setTimeout(context.poll, 2000);
    });
    return context.busy;
  };
  monitors.set(token, context);
  context.poll();
  return context;
}

export function restoreVlcPlayback(onChanged = () => {}) {
  changed = onChanged;
  // Resume only the reports for user-started sessions; never launch media at startup.
  for (const session of sessions()) monitor(session.token);
}

export async function flushNativePlayback() {
  for (const session of [...sessions()]) {
    const context = monitor(session.token);
    if (context.busy) await context.busy;
    await context.poll();
  }
  await flushPersistence();
}

async function stopSession(token) {
  const context = monitor(token);
  if (context.closed) return;
  await request("control", { token, action: "stop" });
  for (let attempt = 0; attempt < 20 && !context.closed; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    clearTimeout(context.timer);
    await context.poll();
  }
  if (!context.closed) throw new Error("The current player is still closing. Please close its window before continuing.");
}

export async function openNativeTvPlayer(showId, episodeId, onChanged, openNext, browserFallback) {
  if (launching) return false;
  let show = getState().items[showId], episode = show?.episodes?.[episodeId];
  if (!episode?.sourcePath) return false;
  changed = onChanged;
  launching = true;
  try {
    const existing = sessions()[0];
    if (existing) {
      const context = monitor(existing.token);
      await context.poll();
      if (!context.closed) await stopSession(existing.token);
    }
    // Closing the previous window may have saved a newer resume position.
    show = getState().items[showId];
    episode = show?.episodes?.[episodeId];
    if (!episode?.sourcePath) return false;
    const code = `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`;
    openModal({ title: "OPENING VLC PLAYER", body: `<p>Checking the saved copies of ${escapeHtml(show.title)} · ${code}.</p><p>${globalThis.vaultDesktopReady ? "The episode will play inside this Vault window." : "Your library stays here while the episode opens in the Vault player window."}</p>` });
    const result = await request("start", { kind: "tv", showId, episodeId, title: `${show.title} — ${code}`, paths: [...new Set([episode.sourcePath, ...(episode.alternatePaths || [])])].slice(0, 24), resumeSeconds: episode.status === "completed" ? 0 : Number(episode.playbackSeconds || 0) });
    update(state => {
      state.metadata.vlcPlaybackSessions ||= [];
      state.metadata.vlcPlaybackSessions.push({ token: result.token, showId, episodeId, sequence: 0, accountedSeconds: 0, manualRevision: Number(episode.playbackManualRevision || 0), startedRecorded: false });
    });
    await flushPersistence();
    monitor(result.token);
    const next = nextPlayableEpisode(show, episodeId);
    const action = handler => async () => { try { await handler(); } catch (error) { toast("PLAYER ACTION PAUSED", error.message, 10000); } };
    openModal({ title: `${show.title} — ${code}`, body: `<p>${globalThis.vaultDesktopReady ? "VLC playback is built into this Vault window. Choose Show player to resume, or select the next episode below." : "The episode is open in the VLC-powered Vault player. Volume, audio tracks, subtitles, fullscreen, and seeking are in that window."}</p><p data-vlc-status="${result.token}">OPENING${result.alternateUsed ? " · USING READABLE ALTERNATE COPY" : ""}</p><p class="muted">${globalThis.vaultDesktopReady ? "Return to Vault saves your position. Your library and playback controls stay in one window." : "Closing this panel leaves playback running. Use Stop player or Return to Vault in the player window to stop."}</p>`, actions: [
      { label: "SHOW PLAYER", handler: action(async () => { if (monitor(result.token).closed) return openNext(showId, episodeId, onChanged); await request("control", { token: result.token, action: "focus" }); }) },
      { label: "START OVER", handler: action(async () => { if (monitor(result.token).closed) { update(state => { state.items[showId].episodes[episodeId].playbackSeconds = 0; }); return openNext(showId, episodeId, onChanged); } await request("control", { token: result.token, action: "restart" }); }) },
      { label: "MARK WATCHED", handler: action(async () => { update(state => { const item = state.items[showId]; setEpisodeWatched(item.episodes[episodeId], true); refreshTvProgress(item); }); await flushPersistence(); onChanged(); toast("EPISODE WATCHED", `${show.title} · ${code}`); }) },
      { label: "MARK UNWATCHED", handler: action(async () => { await stopSession(result.token); update(state => { const item = state.items[showId]; setEpisodeWatched(item.episodes[episodeId], false); refreshTvProgress(item); }); await flushPersistence(); onChanged(); closeModal(); }) },
      ...(next ? [{ label: `NEXT · S${String(next.season).padStart(2, "0")}E${String(next.number).padStart(2, "0")}`, handler: action(async () => { await stopSession(result.token); closeModal(); await openNext(showId, next.id, onChanged); }) }] : []),
      { label: "STOP PLAYER", handler: action(async () => { await stopSession(result.token); closeModal(); }) }
    ] });
    return true;
  } catch (error) {
    openModal({ title: "VLC PLAYER COULD NOT OPEN", body: `<p>${escapeHtml(error.message)}</p><p>Your original files and episode links have not been changed.</p>`, actions: [{ label: "USE BROWSER PLAYER", handler: () => browserFallback(showId, episodeId, onChanged) }] });
    return false;
  } finally {
    launching = false;
  }
}
