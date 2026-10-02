// Pure TV progress rules, shared by the player and regression checks.
export function refreshTvProgress(show) {
  const episodes = Object.values(show.episodes || {});
  const completed = episodes.filter(episode => episode.status === "completed").length;
  show.progress = { completed, total: episodes.length };
  show.status = completed && completed === episodes.length ? "completed" : completed || episodes.some(episode => episode.status === "in_progress") ? "in_progress" : "backlog";
}

export function setEpisodeWatched(episode, watched, at = new Date().toISOString()) {
  episode.playbackManualRevision = Number(episode.playbackManualRevision || 0) + 1;
  episode.status = watched ? "completed" : "backlog";
  if (watched) episode.completedAt ||= at;
  else {
    delete episode.completedAt;
    episode.playbackSeconds = 0;
  }
}

export function applyVlcProgress(show, episode, session, report, at = new Date().toISOString()) {
  if (report.token !== session.token || report.showId !== show.id || report.episodeId !== episode.id) return false;
  const sequence = Number(report.sequence || 0);
  if (!Number.isFinite(sequence) || sequence <= Number(session.sequence || 0)) return false;
  session.sequence = sequence;
  if (!report.started) return false;
  session.startedRecorded = true;
  const cumulative = Math.max(0, Number(report.sessionSeconds) || 0);
  if (!Number.isFinite(cumulative)) return false;
  const delta = Math.max(0, cumulative - Number(session.accountedSeconds || 0));
  session.accountedSeconds = Math.max(cumulative, Number(session.accountedSeconds || 0));
  episode.totalWatchSeconds = Number(episode.totalWatchSeconds || 0) + delta;
  episode.lastPlayedAt = at;
  // A manual watched/unwatched decision made after launch wins over late reports.
  if (Number(episode.playbackManualRevision || 0) === Number(session.manualRevision || 0)) {
    const current = Number(report.currentSeconds), duration = Number(report.durationSeconds);
    if (Number.isFinite(current) && current >= 0) episode.playbackSeconds = current;
    if (Number.isFinite(duration) && duration > 0) episode.durationSeconds = duration;
    if (report.completed) {
      episode.status = "completed";
      episode.completedAt ||= at;
    } else if (current > 0 && episode.status !== "completed") episode.status = "in_progress";
  }
  refreshTvProgress(show);
  return true;
}

export function nextPlayableEpisode(show, episodeId) {
  const episodes = Object.values(show.episodes || {}).sort((a, b) => Number(a.season) - Number(b.season) || Number(a.number) - Number(b.number));
  const index = episodes.findIndex(episode => episode.id === episodeId);
  if (index < 0) return null;
  return episodes.slice(index + 1).find(episode => episode.sourcePath && (episode.linkStatus !== "missing" || episode.alternatePaths?.length)) || null;
}
