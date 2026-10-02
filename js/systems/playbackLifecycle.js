import { emit } from "../core/events.js";
import { createId } from "../core/ids.js";
import { getState, update } from "../core/store.js";

export function beginPlaybackSession(showId, episodeId, fileName = "") {
  const state = getState(), show = state.items?.[showId], episode = show?.episodes?.[episodeId];
  if (!show || !episode) return null;
  const existing = (state.metadata.lifeDashboard.playbackSessions || []).find(session => session.status === "pending" && session.showId === showId && session.episodeId === episodeId);
  if (existing) return existing;
  const session = { id: createId("playback"), showId, episodeId, fileName: String(fileName).split(/[\\/]/).pop(), startedAt: new Date().toISOString(), returnedAt: null, resolvedAt: null, status: "pending", rating: null };
  update(save => { save.metadata.lifeDashboard.playbackSessions = [session, ...(save.metadata.lifeDashboard.playbackSessions || [])].slice(0, 500); });
  // Picking an episode back up is a different thing from starting it, and the
  // record already knows which this is. Half a minute of prior playback is the
  // line — below that it is a stray second from opening the file, not progress.
  const resumed = Number(episode.playbackSeconds || 0) > 30 && episode.status !== "completed";
  emit("PLAYBACK_SESSION_STARTED", { itemId: showId, episodeId, wing: "tv", resumed, meta: { title: `${show.title} playback started`, sessionId: session.id } });
  return session;
}

export function markPlaybackReturn() {
  const pending = getPlaybackPrompt();
  if (!pending || pending.returnedAt) return pending;
  const at = new Date().toISOString();
  update(save => { const session = save.metadata.lifeDashboard.playbackSessions.find(entry => entry.id === pending.id); if (session) session.returnedAt = at; });
  return getPlaybackPrompt();
}

export function ratePlaybackSession(sessionId, rating) {
  const value = Math.max(1, Math.min(10, Number(rating || 0)));
  let result = null;
  update(save => {
    const session = save.metadata.lifeDashboard.playbackSessions.find(entry => entry.id === sessionId);
    const episode = session ? save.items?.[session.showId]?.episodes?.[session.episodeId] : null;
    if (!session || !episode) return;
    session.rating = value; episode.rating = value; result = session;
  });
  if (result) emit("EPISODE_RATED", { itemId: result.showId, episodeId: result.episodeId, wing: "tv", meta: { title: `${value}/10`, explicitPlaybackFollowup: true } });
  return result;
}

export function resolvePlaybackSession(sessionId, decision) {
  if (!["finished", "not_yet"].includes(decision)) return null;
  let result = null;
  update(save => {
    const session = save.metadata.lifeDashboard.playbackSessions.find(entry => entry.id === sessionId);
    const show = session ? save.items?.[session.showId] : null, episode = show?.episodes?.[session.episodeId];
    if (!session || !episode || session.status !== "pending") return;
    const at = new Date().toISOString();
    session.status = decision; session.resolvedAt = at;
    if (decision === "finished") {
      if (episode.status === "completed") episode.rewatches = Number(episode.rewatches || 0) + 1;
      episode.status = "completed"; episode.completedAt ||= at;
      const episodes = Object.values(show.episodes || {}), completed = episodes.filter(entry => entry.status === "completed").length;
      show.progress = { completed, total: episodes.length };
      show.status = completed === episodes.length && completed ? "completed" : completed ? "in_progress" : "backlog";
    }
    result = { ...session, showTitle: show.title };
  });
  if (result) emit(decision === "finished" ? "PLAYBACK_CONFIRMED_FINISHED" : "PLAYBACK_LEFT_UNFINISHED", { itemId: result.showId, episodeId: result.episodeId, wing: "tv", meta: { title: result.showTitle, sessionId } });
  return result;
}

export function getPlaybackPrompt(state = getState()) {
  const session = (state.metadata?.lifeDashboard?.playbackSessions || []).find(entry => entry.status === "pending");
  if (!session) return null;
  const show = state.items?.[session.showId], episode = show?.episodes?.[session.episodeId];
  if (!show || !episode) return null;
  return { ...session, show, episode, code: `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}` };
}
