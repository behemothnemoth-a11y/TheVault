import {
  addTriviaTeam, awardTriviaPoint, bindTriviaGame, closeTriviaGame, nextTriviaQuestion,
  playTriviaAgain, removeTriviaTeam, renameTriviaTeam, renderTriviaGame, revealTriviaAnswer,
  setTriviaCount, setTriviaDifficulty, startTriviaRound, toggleTriviaCategory, triviaGameState
} from "./triviaGame.js?v=20260912-trivia-game-v1";

// The game takes over the screen rather than sitting inside the wing, so it can be
// read from across a room. This owns the overlay element and the host's keys.

let host = null;

function ensureStyles() {
  if (document.querySelector("link[data-trivia-game-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/trivia-game.css?v=20260912-v1";
  link.dataset.triviaGameStyles = "";
  document.head.append(link);
}

function paint() {
  if (!host) return;
  const focused = document.activeElement?.dataset?.tgTeam || "";
  const caret = document.activeElement?.selectionStart ?? null;
  host.innerHTML = renderTriviaGame();
  if (focused) {
    const field = host.querySelector(`[data-tg-team="${focused}"]`);
    if (field) { field.focus(); try { field.setSelectionRange(caret, caret); } catch {} }
  }
}

export function openTriviaGame() {
  ensureStyles();
  if (!host) {
    host = document.createElement("div");
    host.className = "trivia-game-host";
    document.body.append(host);
    bindTriviaGame(paint);
    document.addEventListener("keydown", onKey);
  }
  document.body.dataset.triviaOpen = "true";
  paint();
}

export function closeTriviaHost() {
  if (!host) return;
  host.remove();
  host = null;
  delete document.body.dataset.triviaOpen;
  document.removeEventListener("keydown", onKey);
  bindTriviaGame(null);
}

// Hosting with a keyboard: space moves the round on, number keys award the point.
function onKey(event) {
  if (!host) return;
  const game = triviaGameState();
  if (event.key === "Escape") { closeTriviaGame(); closeTriviaHost(); return; }
  if (game.phase !== "play") return;
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (!game.revealed) revealTriviaAnswer();
    else if (game.awarded[game.index]) nextTriviaQuestion();
    return;
  }
  if (!game.revealed || game.awarded[game.index]) return;
  if (event.key === "0") { event.preventDefault(); awardTriviaPoint("nobody"); return; }
  const position = Number(event.key);
  if (Number.isInteger(position) && position >= 1 && position <= game.teams.length) {
    event.preventDefault();
    awardTriviaPoint(game.teams[position - 1].id);
  }
}

export async function handleTriviaGameAction(event) {
  if (!host || !host.contains(event.target)) return false;
  const target = event.target;

  if (target.closest("[data-tg-close]")) { closeTriviaGame(); closeTriviaHost(); return true; }
  if (target.closest("[data-tg-team-add]")) { addTriviaTeam(); return true; }
  const removeTeam = target.closest("[data-tg-team-remove]")?.dataset.tgTeamRemove;
  if (removeTeam) { removeTriviaTeam(removeTeam); return true; }
  const category = target.closest("[data-tg-category]")?.dataset.tgCategory;
  if (category) { toggleTriviaCategory(category); return true; }
  const difficulty = target.closest("[data-tg-difficulty]")?.dataset.tgDifficulty;
  if (difficulty) { setTriviaDifficulty(difficulty); return true; }
  const count = target.closest("[data-tg-count]")?.dataset.tgCount;
  if (count) { setTriviaCount(count); return true; }
  if (target.closest("[data-tg-start]")) { await startTriviaRound(); return true; }
  if (target.closest("[data-tg-reveal]")) { revealTriviaAnswer(); return true; }
  if (target.closest("[data-tg-next]")) { nextTriviaQuestion(); return true; }
  const award = target.closest("[data-tg-award]")?.dataset.tgAward;
  if (award) { awardTriviaPoint(award); return true; }
  if (target.closest("[data-tg-again]")) { playTriviaAgain(); return true; }
  return false;
}

export function handleTriviaGameInput(event) {
  if (!host || !host.contains(event.target)) return false;
  const team = event.target.closest("[data-tg-team]")?.dataset.tgTeam;
  if (!team) return false;
  renameTriviaTeam(team, event.target.value);
  return true;
}
