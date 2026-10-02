import { getState } from "../core/store.js";
import { triviaSubjects } from "./homeCommandCenter.js?v=20260912-home-cards-v1";

// A trivia game you can actually run with people in the room.
//
// One screen, read aloud by whoever is hosting: the question goes up, teams answer
// out loud, the host reveals and taps who got it. The Vault keeps score. It takes
// over the screen rather than sitting in a dialog, because the point is that
// somebody across the room can read it.

const GAME_KEY = "vault-trivia-game-v1";

export const CATEGORIES = [
  { id: "archive", label: "FROM YOUR ARCHIVE", note: "Your own shows, films, games and music" },
  { id: "pop", label: "POP CULTURE", note: "Film, television, music, famous names" },
  { id: "geek", label: "GAMES, COMICS, SCI-FI + HORROR", note: "The genre end of the shelf" },
  { id: "manga_anime", label: "MANGA VS ANIME", note: "Adaptations, and where they differ" },
  { id: "general", label: "GENERAL KNOWLEDGE", note: "History, science, geography, sport" },
  { id: "random", label: "RANDOM", note: "Anything at all — no warning" }
];
export const DIFFICULTIES = [
  { id: "easy", label: "EASY" }, { id: "medium", label: "MEDIUM" },
  { id: "hard", label: "HARD" }, { id: "mixed", label: "MIXED" }
];

const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", [String.fromCharCode(34)]: "&quot;", [String.fromCharCode(39)]: "&#39;" }[char]));
const read = () => { try { return JSON.parse(localStorage.getItem(GAME_KEY)) || null; } catch { return null; } };
const write = value => { try { localStorage.setItem(GAME_KEY, JSON.stringify(value)); } catch {} };

const blankGame = () => ({
  phase: "setup",
  teams: [{ id: "t1", name: "Team 1", score: 0 }, { id: "t2", name: "Team 2", score: 0 }],
  categories: ["archive", "pop", "geek", "general"],
  difficulty: "mixed",
  count: 10,
  questions: [], index: 0, revealed: false, awarded: {}, loading: false, error: ""
});

let game = read() || blankGame();
let redraw = () => {};
const save = () => { write(game); redraw(); };

export const triviaGameState = () => game;
export const triviaGameRunning = () => game.phase === "play" || game.phase === "done";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function addTriviaTeam(name = "") {
  if (game.teams.length >= 8) return false;
  const id = "t" + (Date.now() % 100000);
  game.teams = [...game.teams, { id, name: String(name || `Team ${game.teams.length + 1}`).slice(0, 28), score: 0 }];
  save(); return true;
}
export function removeTriviaTeam(id) {
  if (game.teams.length <= 1) return false;
  game.teams = game.teams.filter(team => team.id !== id);
  save(); return true;
}
export function renameTriviaTeam(id, name) {
  const team = game.teams.find(entry => entry.id === id);
  if (!team) return false;
  team.name = String(name || team.name).slice(0, 28);
  write(game); return true;
}
export function toggleTriviaCategory(id) {
  const has = game.categories.includes(id);
  const next = has ? game.categories.filter(entry => entry !== id) : [...game.categories, id];
  game.categories = next.length ? next : [id];   // never leave it with nothing to ask about
  save(); return true;
}
export function setTriviaDifficulty(id) { game.difficulty = id; save(); return true; }
export function setTriviaCount(count) { game.count = Math.max(3, Math.min(20, Number(count) || 10)); save(); return true; }

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

async function fetchQuestions(count) {
  const wantsArchive = game.categories.includes("archive");
  const subjects = wantsArchive ? triviaSubjects(getState()) : [];
  const asked = (read()?.askedEver || []).slice(-120);
  const batches = [];
  // The endpoint answers up to twelve at a time, so a longer round is two passes.
  let remaining = count;
  while (remaining > 0) {
    const size = Math.min(12, remaining);
    const response = await fetch("./__vault/home/trivia", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": "home-trivia" },
      body: JSON.stringify({
        subjects, asked: [...asked, ...batches.flat().map(entry => entry.question)],
        count: size, categories: game.categories, difficulty: game.difficulty
      })
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error === "ai_not_configured"
        ? "The Vault's AI is not configured, so it cannot write questions."
        : "Questions could not be written just now. Try again in a moment.");
    }
    const payload = await response.json();
    const fresh = (payload.questions || []).filter(question =>
      !batches.flat().some(existing => existing.id === question.id));
    if (!fresh.length) break;
    batches.push(fresh);
    remaining -= fresh.length;
  }
  return batches.flat().slice(0, count);
}

export async function startTriviaRound() {
  game.loading = true; game.error = ""; save();
  try {
    const questions = await fetchQuestions(game.count);
    if (!questions.length) throw new Error("No questions came back. Try again.");
    const stored = read() || {};
    write({ ...stored, askedEver: [...(stored.askedEver || []), ...questions.map(q => q.question)].slice(-300) });
    game.questions = questions;
    game.index = 0; game.revealed = false; game.awarded = {};
    game.teams = game.teams.map(team => ({ ...team, score: 0 }));
    game.phase = "play"; game.loading = false;
    save();
    return true;
  } catch (error) {
    game.loading = false; game.error = error.message; game.phase = "setup"; save();
    return false;
  }
}

export function revealTriviaAnswer() { game.revealed = true; save(); return true; }

// Who got it. "nobody" is a real answer and is recorded as one.
export function awardTriviaPoint(teamId) {
  if (!game.revealed) return false;
  const already = game.awarded[game.index];
  if (already) return false;
  if (teamId !== "nobody") {
    const team = game.teams.find(entry => entry.id === teamId);
    if (!team) return false;
    team.score += 1;
  }
  game.awarded[game.index] = teamId;
  save(); return true;
}

export function nextTriviaQuestion() {
  if (game.index + 1 >= game.questions.length) { game.phase = "done"; save(); return true; }
  game.index += 1; game.revealed = false; save(); return true;
}

export function playTriviaAgain() {
  game.phase = "setup"; game.questions = []; game.index = 0; game.revealed = false; game.awarded = {};
  game.error = ""; save(); return true;
}
export function closeTriviaGame() { game.phase = "setup"; save(); return true; }
export function bindTriviaGame(onChange) { redraw = onChange || (() => {}); }

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

const scoreboard = () => `<div class="tg-scores">${[...game.teams]
  .map(team => `<span><b>${esc(team.name)}</b><em>${team.score}</em></span>`).join("")}</div>`;

function setupScreen() {
  return `<div class="tg-setup">
    <header><span class="eyebrow">TRIVIA // HOST AND TEAMS</span><h2>SET UP THE ROUND</h2>
      <p>You read the questions out. Teams answer aloud. Tap who got it and the Vault keeps score.</p></header>
    ${game.error ? `<p class="tg-error">${esc(game.error)}</p>` : ""}

    <section><h3>TEAMS</h3>
      <div class="tg-teams">${game.teams.map(team => `<div class="tg-team">
        <input data-tg-team="${esc(team.id)}" value="${esc(team.name)}" maxlength="28" aria-label="Team name">
        ${game.teams.length > 1 ? `<button data-tg-team-remove="${esc(team.id)}" title="Remove team">✕</button>` : ""}
      </div>`).join("")}</div>
      ${game.teams.length < 8 ? `<button class="button" data-tg-team-add>+ ADD TEAM</button>` : ""}
    </section>

    <section><h3>CATEGORIES</h3>
      <div class="tg-cats">${CATEGORIES.map(category => `<button class="tg-cat ${game.categories.includes(category.id) ? "on" : ""}" data-tg-category="${category.id}">
        <b>${esc(category.label)}</b><small>${esc(category.note)}</small></button>`).join("")}</div>
    </section>

    <section class="tg-row"><div><h3>DIFFICULTY</h3>
      <div class="tg-chips">${DIFFICULTIES.map(level => `<button class="${game.difficulty === level.id ? "on" : ""}" data-tg-difficulty="${level.id}">${level.label}</button>`).join("")}</div></div>
      <div><h3>QUESTIONS</h3>
      <div class="tg-chips">${[5, 10, 15, 20].map(count => `<button class="${game.count === count ? "on" : ""}" data-tg-count="${count}">${count}</button>`).join("")}</div></div>
    </section>

    <footer><button class="button primary tg-start" data-tg-start ${game.loading ? "disabled" : ""}>${game.loading ? "WRITING QUESTIONS…" : "START ROUND"}</button>
      <button class="button" data-tg-close>CLOSE</button></footer>
  </div>`;
}

function playScreen() {
  const question = game.questions[game.index];
  if (!question) return setupScreen();
  const awarded = game.awarded[game.index];
  const category = CATEGORIES.find(entry => entry.id === question.category);
  return `<div class="tg-play">
    <header>
      <div><span class="eyebrow">${esc(category?.label || question.category || "TRIVIA")} · ${esc(String(question.difficulty || "").toUpperCase())}</span>
        <b>QUESTION ${game.index + 1} OF ${game.questions.length}</b></div>
      ${scoreboard()}
    </header>

    <h2 class="tg-question">${esc(question.question)}</h2>

    <ol class="tg-answers ${game.revealed ? "revealed" : ""}">
      ${question.answers.map((answer, index) => `<li class="${game.revealed && index === question.correct ? "correct" : ""}">
        <i>${String.fromCharCode(65 + index)}</i><span>${esc(answer)}</span></li>`).join("")}
    </ol>

    ${game.revealed && question.note ? `<p class="tg-note">${esc(question.note)}</p>` : ""}

    <footer>
      ${!game.revealed
        ? `<button class="button primary tg-big" data-tg-reveal>REVEAL ANSWER</button><small>SPACE</small>`
        : awarded
          ? `<button class="button primary tg-big" data-tg-next>${game.index + 1 >= game.questions.length ? "SEE FINAL SCORES" : "NEXT QUESTION"}</button><small>SPACE</small>`
          : `<div class="tg-award"><span>WHO GOT IT?</span>
              ${game.teams.map((team, index) => `<button data-tg-award="${esc(team.id)}"><i>${index + 1}</i>${esc(team.name)}</button>`).join("")}
              <button class="tg-nobody" data-tg-award="nobody"><i>0</i>NOBODY</button></div>`}
      <button class="button tg-quit" data-tg-close>END GAME</button>
    </footer>
  </div>`;
}

function doneScreen() {
  const ranked = [...game.teams].sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  const winners = ranked.filter(team => team.score === best && best > 0);
  return `<div class="tg-done">
    <header><span class="eyebrow">ROUND COMPLETE</span>
      <h2>${winners.length === 0 ? "NOBODY SCORED" : winners.length > 1 ? "IT IS A TIE" : esc(winners[0].name) + " WINS"}</h2></header>
    <ol class="tg-final">${ranked.map((team, index) => `<li class="${team.score === best && best > 0 ? "won" : ""}">
      <i>${index + 1}</i><b>${esc(team.name)}</b><em>${team.score} / ${game.questions.length}</em></li>`).join("")}</ol>
    <footer><button class="button primary" data-tg-again>ANOTHER ROUND</button>
      <button class="button" data-tg-close>CLOSE</button></footer>
  </div>`;
}

export function renderTriviaGame() {
  const screen = game.phase === "play" ? playScreen() : game.phase === "done" ? doneScreen() : setupScreen();
  return `<div class="trivia-game" role="dialog" aria-label="Trivia game">${screen}</div>`;
}
