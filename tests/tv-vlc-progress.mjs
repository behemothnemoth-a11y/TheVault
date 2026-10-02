import assert from "node:assert/strict";
import { applyVlcProgress, nextPlayableEpisode, setEpisodeWatched, refreshTvProgress } from "../js/systems/tvPlaybackState.js";

const fixture = () => {
  const episode = { id: "e1", season: 1, number: 1, status: "backlog", playbackSeconds: 300, totalWatchSeconds: 30 };
  const show = { id: "show", episodes: { e1: episode } };
  const session = { token: "abc", sequence: 0, accountedSeconds: 0, manualRevision: 0 };
  const report = { token: "abc", showId: "show", episodeId: "e1", started: true, sequence: 1, sessionSeconds: 5, currentSeconds: 305, durationSeconds: 1000, completed: false };
  return { episode, show, session, report };
};
let checks = 0;
function check(name, body) { body(); checks++; console.log(`PASS ${name}`); }
check("startup failure preserves resume and history", () => {
  const { episode, show, session, report } = fixture();
  applyVlcProgress(show, episode, session, { ...report, started: false, currentSeconds: 0 });
  assert.equal(episode.playbackSeconds, 300); assert.equal(episode.totalWatchSeconds, 30); assert.equal(episode.lastPlayedAt, undefined);
});
check("duplicate and stale reports do not double-count", () => {
  const { episode, show, session, report } = fixture();
  applyVlcProgress(show, episode, session, report);
  applyVlcProgress(show, episode, session, report);
  applyVlcProgress(show, episode, session, { ...report, sequence: 2, sessionSeconds: 9 });
  applyVlcProgress(show, episode, session, report);
  assert.equal(episode.totalWatchSeconds, 39);
});
check("browser reload uses durable accounting", () => {
  const { episode, show, session, report } = fixture();
  applyVlcProgress(show, episode, session, report);
  const saved = JSON.parse(JSON.stringify({ show, session }));
  applyVlcProgress(saved.show, saved.show.episodes.e1, saved.session, { ...report, sequence: 2, sessionSeconds: 12 });
  assert.equal(saved.show.episodes.e1.totalWatchSeconds, 42);
});
check("seeking backward saves the new resume position", () => {
  const { episode, show, session, report } = fixture();
  applyVlcProgress(show, episode, session, { ...report, currentSeconds: 20 });
  assert.equal(episode.playbackSeconds, 20);
});
check("manual unwatched wins over late completion", () => {
  const { episode, show, session, report } = fixture();
  setEpisodeWatched(episode, false);
  applyVlcProgress(show, episode, session, { ...report, completed: true, currentSeconds: 990 });
  assert.equal(episode.status, "backlog"); assert.equal(episode.playbackSeconds, 0); assert.equal(episode.completedAt, undefined);
});
check("automatic completion has a date and correct series progress", () => {
  const { episode, show, session, report } = fixture();
  applyVlcProgress(show, episode, session, { ...report, completed: true }, "2026-09-26T00:00:00Z");
  assert.equal(episode.completedAt, "2026-09-26T00:00:00Z"); assert.equal(show.status, "completed");
});
check("foreign session cannot modify episode", () => {
  const { episode, show, session, report } = fixture();
  assert.equal(applyVlcProgress(show, episode, session, { ...report, token: "other" }), false);
  assert.equal(episode.totalWatchSeconds, 30);
});
check("next skips missing files without alternatives", () => {
  const { show } = fixture();
  show.episodes.e2 = { id: "e2", season: 1, number: 2, sourcePath: "missing", linkStatus: "missing" };
  show.episodes.e3 = { id: "e3", season: 1, number: 3, sourcePath: "copy" };
  assert.equal(nextPlayableEpisode(show, "e1").id, "e3");
});
check("manual changes retain other episodes in progress", () => {
  const { show } = fixture();
  show.episodes.e2 = { id: "e2", status: "in_progress" };
  setEpisodeWatched(show.episodes.e1, false); refreshTvProgress(show);
  assert.equal(show.status, "in_progress");
});
console.log(`${checks} VLC progress checks passed.`);
