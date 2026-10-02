import { getState } from "../core/store.js";
import { closeModal, openModal } from "../ui/modals.js";
import { weatherIcon, weatherMood, weatherWord } from "./weatherIcons.js?v=20260912-v1";

// The two cards at the top of Home: weather and trivia.
//
// Weather is per-city, with a compact card that opens into the full picture —
// alerts, the next three hours, a radar loop of the last two, today by the hour,
// and five days. Trivia is generated from what this archive actually holds and
// keeps a queue, so a question is never asked twice.

const CITIES_KEY = "vault-home-cities-v1";
const WEATHER_KEY = "vault-home-weather-v2";
const RADAR_KEY = "vault-home-radar-v1";
const TRIVIA_KEY = "vault-home-trivia-v1";

const WEATHER_MS = 30 * 60 * 1000;   // the reader asked for a half-hourly refresh
const TRIVIA_MS = 3 * 60 * 60 * 1000;
const QUEUE_TARGET = 12;             // questions kept ready ahead of you
const HOME_CITY = { id: "redfield", label: "Redfield, SD 57469", latitude: 44.87581, longitude: -98.51871, home: true };

let weatherTimer = null, triviaTimer = null, radarTimer = null, notifyChange = () => {};
let radarFrame = 0, radarPlaying = true;

const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", [String.fromCharCode(34)]: "&quot;", [String.fromCharCode(39)]: "&#39;" }[char]));
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const monthKey = () => new Date().toISOString().slice(0, 7);
const degree = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°` : "—";
const clockLabel = value => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"; };

export const weatherLabel = weatherWord;

// Daylight for a given moment, from that day's own sunrise and sunset.
function isDaylight(payload, when = new Date()) {
  const today = (payload?.daily || [])[0];
  if (!today?.sunrise || !today?.sunset) return Number(payload?.current?.isDay ?? 1) === 1;
  const rise = new Date(today.sunrise), set = new Date(today.sunset);
  return when >= rise && when <= set;
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export function homeCities() {
  const stored = readJson(CITIES_KEY, null);
  if (!stored || !Array.isArray(stored.cities) || !stored.cities.length) return { cities: [HOME_CITY], activeId: HOME_CITY.id };
  const cities = stored.cities.filter(city => city && city.id && Number.isFinite(Number(city.latitude)));
  if (!cities.length) return { cities: [HOME_CITY], activeId: HOME_CITY.id };
  return { cities, activeId: cities.some(city => city.id === stored.activeId) ? stored.activeId : cities[0].id };
}

const activeCity = () => { const { cities, activeId } = homeCities(); return cities.find(city => city.id === activeId) || cities[0]; };
const announceCityChange = () => {
  try { window.dispatchEvent(new Event("vault-home-city-changed")); } catch {}
};

export function addHomeCity(place) {
  const latitude = Number(place?.latitude), longitude = Number(place?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const id = `c${Math.abs(Math.round(latitude * 1000))}_${Math.abs(Math.round(longitude * 1000))}`;
  const { cities } = homeCities();
  if (cities.some(city => city.id === id)) { selectHomeCity(id); return true; }
  const next = [...cities, { id, label: String(place.label || "Added city").slice(0, 120), latitude, longitude }];
  writeJson(CITIES_KEY, { cities: next, activeId: id });
  announceCityChange();
  return true;
}

export function removeHomeCity(id) {
  const { cities, activeId } = homeCities();
  if (cities.length <= 1) return false;
  const next = cities.filter(city => city.id !== id);
  writeJson(CITIES_KEY, { cities: next, activeId: activeId === id ? next[0].id : activeId });
  announceCityChange();
  return true;
}

export function selectHomeCity(id) {
  const { cities } = homeCities();
  if (!cities.some(city => city.id === id)) return false;
  writeJson(CITIES_KEY, { cities, activeId: id });
  announceCityChange();
  return true;
}

export async function searchHomeCity(query) {
  const response = await fetch("./__vault/home/weather/search", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": "weather-search" },
    body: JSON.stringify({ query })
  });
  if (!response.ok) throw new Error("City lookup is unavailable right now.");
  const payload = await response.json();
  return payload.places || [];
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

const weatherStore = () => readJson(WEATHER_KEY, {});
export const weatherFor = (cityId = activeCity().id) => weatherStore()[cityId] || null;

export async function refreshHomeWeather({ force = false, cityId = "" } = {}) {
  const city = cityId ? homeCities().cities.find(entry => entry.id === cityId) || activeCity() : activeCity();
  const store = weatherStore(), existing = store[city.id];
  if (!force && existing?.payload && Date.now() - Number(existing.savedAt || 0) < WEATHER_MS) return existing.payload;
  try {
    const response = await fetch("./__vault/home/weather", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": "home-weather" },
      body: JSON.stringify({ latitude: city.latitude, longitude: city.longitude, label: city.label })
    });
    if (!response.ok) throw new Error("Weather update unavailable");
    const payload = await response.json();
    writeJson(WEATHER_KEY, { ...store, [city.id]: { payload, savedAt: Date.now(), error: "" } });
    notifyChange();
    return payload;
  } catch (error) {
    writeJson(WEATHER_KEY, { ...store, [city.id]: { ...(existing || {}), error: error.message || "Weather update unavailable" } });
    notifyChange();
    return existing?.payload || null;
  }
}

// Radar images rain that has already fallen; nothing publishes radar frames for
// the future. This asks the forecast model about a grid of points around the city
// and returns twelve fifteen-minute frames, which are drawn the same way.
export async function refreshForecastRadar({ cityId = "" } = {}) {
  const city = cityId ? homeCities().cities.find(entry => entry.id === cityId) || activeCity() : activeCity();
  try {
    const response = await fetch("./__vault/home/forecast-radar", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": "weather-forecast-radar" },
      body: JSON.stringify({ latitude: city.latitude, longitude: city.longitude, label: city.label })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

// Precipitation, in inches per fifteen minutes, as colour.
function precipitationColour(value) {
  const amount = Number(value) || 0;
  if (amount <= 0.0005) return null;
  if (amount < 0.004) return [70, 110, 150, 150];
  if (amount < 0.012) return [70, 150, 170, 185];
  if (amount < 0.03) return [95, 185, 140, 205];
  if (amount < 0.06) return [210, 180, 70, 220];
  if (amount < 0.12) return [225, 135, 55, 230];
  return [215, 90, 80, 240];
}

// The grid is drawn tiny and scaled up, so the browser's own smoothing does the
// interpolation between sample points and the result reads like a radar sweep.
function paintForecastFrame(canvas, frame, size) {
  if (!canvas || !frame) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scratch = document.createElement("canvas");
  scratch.width = size; scratch.height = size;
  const small = scratch.getContext("2d");
  const image = small.createImageData(size, size);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const colour = precipitationColour((frame.grid[row] || [])[column]);
      const offset = (row * size + column) * 4;
      image.data[offset] = colour ? colour[0] : 0;
      image.data[offset + 1] = colour ? colour[1] : 0;
      image.data[offset + 2] = colour ? colour[2] : 0;
      image.data[offset + 3] = colour ? colour[3] : 0;
    }
  }
  small.putImageData(image, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(scratch, 0, 0, size, size, 0, 0, canvas.width, canvas.height);
}

export async function refreshHomeRadar({ force = false } = {}) {
  const stored = readJson(RADAR_KEY, null);
  if (!force && stored?.savedAt && Date.now() - stored.savedAt < 5 * 60 * 1000) return stored.payload;
  try {
    const response = await fetch("./__vault/home/radar", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": "weather-radar" }, body: "{}"
    });
    if (!response.ok) throw new Error("Radar unavailable");
    const payload = await response.json();
    writeJson(RADAR_KEY, { payload, savedAt: Date.now() });
    return payload;
  } catch { return stored?.payload || null; }
}

// "dry until 6:15pm" reads faster than a chart, so the chart gets a sentence.
export function rainSentence(payload) {
  const steps = payload?.minutely || [];
  if (!steps.length) return "";
  const wet = step => Number(step.precipitation || 0) > 0 || Number(step.precipitationChance || 0) >= 50;
  const firstWet = steps.findIndex(wet);
  if (firstWet === -1) return "No rain expected in the next three hours.";
  if (firstWet === 0) {
    const clears = steps.findIndex((step, index) => index > 0 && !wet(step));
    return clears === -1 ? "Rain through the next three hours." : `Rain easing around ${clockLabel(steps[clears].time)}.`;
  }
  return `Dry until about ${clockLabel(steps[firstWet].time)}.`;
}

// ---------------------------------------------------------------------------
// Trivia
// ---------------------------------------------------------------------------

function triviaState() {
  const stored = readJson(TRIVIA_KEY, { queue: [], answers: {}, months: {}, asked: [], generatedAt: 0, error: "" });
  stored.queue ||= []; stored.answers ||= {}; stored.months ||= {}; stored.asked ||= [];
  return stored;
}

// The subjects the questions are built from: what this archive actually holds.
export function triviaSubjects(state = getState()) {
  const items = Object.values(state.items || {});
  const pick = (list, count) => list.slice(0, count);
  const byPlays = (a, b) => Number(b.musicMeta?.millisecondsPlayed || 0) - Number(a.musicMeta?.millisecondsPlayed || 0);

  const artists = [...new Set(items.filter(item => item.wing === "music").sort(byPlays)
    .map(item => String(item.creator || "").trim()).filter(Boolean))];
  const shows = items.filter(item => item.wing === "tv").map(item => item.title);
  const films = items.filter(item => item.wing === "movies" && item.sourcePath).map(item => item.title);
  const games = items.filter(item => item.wing === "games" && Number(item.gameMeta?.recordedMinutes || 0) > 60)
    .sort((a, b) => Number(b.gameMeta?.recordedMinutes || 0) - Number(a.gameMeta?.recordedMinutes || 0))
    .map(item => item.title);
  const authors = [...new Set(items.filter(item => item.wing === "books")
    .map(item => String((item.authors || [])[0] || "").trim()).filter(Boolean))];
  const comics = items.filter(item => item.wing === "manga").map(item => item.title);

  // A shuffled spread, so consecutive rounds do not all come from one wing.
  const pool = [...pick(artists, 8), ...pick(games, 5), ...pick(shows.sort(() => Math.random() - 0.5), 6),
                ...pick(authors, 4), ...pick(comics.sort(() => Math.random() - 0.5), 3),
                ...pick(films.sort(() => Math.random() - 0.5), 4)];
  return [...new Set(pool.filter(Boolean))].sort(() => Math.random() - 0.5).slice(0, 20);
}

export async function refreshHomeTrivia({ force = false } = {}) {
  const state = triviaState();
  const unanswered = state.queue.filter(question => !state.answers[question.id]);
  if (!force && unanswered.length >= 4 && Date.now() - Number(state.generatedAt || 0) < TRIVIA_MS) return unanswered.length;
  const subjects = triviaSubjects();
  if (!subjects.length) return unanswered.length;
  try {
    const response = await fetch("./__vault/home/trivia", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Request": "home-trivia" },
      body: JSON.stringify({ subjects, asked: state.asked.slice(-100), count: Math.max(4, QUEUE_TARGET - unanswered.length) })
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error === "ai_not_configured"
        ? "The Vault's AI is not configured, so new questions cannot be written."
        : "New trivia could not be fetched.");
    }
    const payload = await response.json();
    const fresh = (payload.questions || []).filter(question => !state.asked.includes(question.question)
      && !state.queue.some(existing => existing.id === question.id));
    state.queue = [...unanswered, ...fresh];
    state.asked = [...state.asked, ...fresh.map(question => question.question)].slice(-200);
    state.generatedAt = Date.now();
    state.error = "";
    writeJson(TRIVIA_KEY, state);
    notifyChange();
    return state.queue.length;
  } catch (error) {
    state.error = error.message;
    writeJson(TRIVIA_KEY, state);
    notifyChange();
    return unanswered.length;
  }
}

export function answerHomeTrivia(questionId, choice) {
  const state = triviaState();
  const question = state.queue.find(entry => entry.id === questionId);
  if (!question || state.answers[questionId]) return null;
  const correct = Number(choice) === Number(question.correct), month = monthKey();
  state.answers[questionId] = { choice: Number(choice), correct, answeredAt: new Date().toISOString() };
  state.months[month] ||= { correct: 0, missed: 0 };
  state.months[month][correct ? "correct" : "missed"]++;
  writeJson(TRIVIA_KEY, state);
  // Answered questions leave the queue, so the next one is always new.
  const remaining = state.queue.filter(entry => !state.answers[entry.id]);
  if (remaining.length <= 3) refreshHomeTrivia({ force: true });
  return { correct, answer: question.answers[question.correct], note: question.note || "" };
}

export const triviaSummary = () => {
  const state = triviaState();
  const waiting = state.queue.filter(question => !state.answers[question.id]);
  return { waiting: waiting.length, next: waiting[0] || null, month: state.months[monthKey()] || { correct: 0, missed: 0 }, error: state.error || "" };
};

// ---------------------------------------------------------------------------
// Startup and timers
// ---------------------------------------------------------------------------

export function ensureHomeCommandCenter(onChange = () => {}) {
  notifyChange = onChange;
  for (const [file, mark] of [["home-command-center.css?v=20260827-home-adaptive-v1", "homeCommandStyles"], ["home-weather.css?v=20260912-v1", "homeWeatherStyles"], ["weather-card.css?v=20260912-v1", "weatherCardStyles"]]) {
    if (document.querySelector(`link[data-${mark.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase())}]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "./css/" + file; link.dataset[mark] = "";
    document.head.append(link);
  }
  refreshHomeWeather();
  refreshHomeTrivia();
  // Weather and trivia are the only things in the Vault that refresh on their own.
  if (!weatherTimer) weatherTimer = setInterval(() => { refreshHomeWeather({ force: true }); notifyChange(); }, WEATHER_MS);
  if (!triviaTimer) triviaTimer = setInterval(() => { refreshHomeTrivia({ force: true }); }, TRIVIA_MS);
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

export function renderHomeCommandCenter() {
  const city = activeCity();
  const stored = weatherFor(city.id) ? weatherStore()[city.id] : null;
  const payload = stored?.payload;
  const current = payload?.current || {};
  const days = (payload?.daily || []).slice(0, 5);
  const alerts = payload?.alerts || [];
  const trivia = triviaSummary();

  const day = isDaylight(payload);
  const mood = payload ? weatherMood(current.weatherCode, day) : "cloud";
  const weatherCard = `<section class="home-command-card home-weather wx-mood-${mood}">
    <header><div><span class="eyebrow">${esc(city.label)}</span><h2>WEATHER</h2></div>
      <div class="home-weather-tools"><button data-home-weather-refresh title="Refresh weather">↻</button></div></header>
    ${alerts.length ? `<button class="home-weather-alert" data-home-weather-open><i></i><span>${esc(alerts[0].event || "WEATHER ALERT")}</span></button>` : ""}
    ${payload ? `<button class="home-weather-open" data-home-weather-open>
      <div class="wx-hero">
        <div class="wx-hero-icon">${weatherIcon(current.weatherCode, { day, size: 76 })}</div>
        <div class="wx-hero-read"><b class="wx-temp">${degree(current.temperature)}</b>
          <strong>${esc(weatherWord(current.weatherCode))}</strong>
          <small>FEELS LIKE ${degree(current.apparentTemperature)}</small></div>
        <dl class="wx-hero-facts">
          <div><dt>HUMIDITY</dt><dd>${Math.round(Number(current.humidity || 0))}%</dd></div>
          <div><dt>WIND</dt><dd>${Math.round(Number(current.windSpeed || 0))} MPH</dd></div>
          <div><dt>GUSTS</dt><dd>${Math.round(Number(current.windGusts || 0))} MPH</dd></div>
        </dl>
      </div>
      ${fiveDayRow(days)}
      <small class="home-weather-hint">${esc(rainSentence(payload))} <em>OPEN FOR RADAR AND DETAIL →</em></small>
    </button>` : `<div class="home-command-empty"><b>WEATHER LINK OFFLINE</b><span>${esc(stored?.error || "The Vault will retry on its own and keep the last forecast.")}</span></div>`}
    <footer>UPDATED ${esc(clockLabel(payload?.updatedAt) || "—")}</footer></section>`;

  const triviaCard = `<section class="home-command-card home-trivia">
    <header><div><span class="eyebrow">FROM YOUR ARCHIVE // ${trivia.waiting} WAITING</span><h2>TRIVIA</h2></div>
      <span class="home-trivia-score"><b>${trivia.month.correct}</b> CORRECT <b>${trivia.month.missed}</b> MISSED</span></header>
    <button class="home-trivia-play" data-trivia-game>▶ RUN A TRIVIA GAME<small>Teams, categories and difficulty — for a night with company</small></button>
    ${trivia.next ? `<div class="home-trivia-question"><span>${esc(trivia.next.subject || "YOUR INTERESTS")}</span><h3>${esc(trivia.next.question)}</h3>
      <div>${trivia.next.answers.map((answer, index) => `<button data-trivia-answer="${index}" data-trivia-question="${esc(trivia.next.id)}"><i>${String.fromCharCode(65 + index)}</i>${esc(answer)}</button>`).join("")}</div></div>`
      : `<div class="home-trivia-complete"><b>${trivia.error ? "TRIVIA PAUSED" : "WRITING NEW QUESTIONS"}</b><span>${esc(trivia.error || "The next set is being built from what your archive holds.")}</span><button class="button" data-trivia-refresh>GET NEW QUESTIONS</button></div>`}
    <footer>NEW QUESTIONS EVERY 3 HOURS // MONTHLY TOTAL ${trivia.month.correct + trivia.month.missed}</footer></section>`;

  return `<section class="home-command-center">${weatherCard}${triviaCard}</section>`;
}

// ---------------------------------------------------------------------------
// The opened weather card
// ---------------------------------------------------------------------------

// The five-day row on the compact card: icon, day, high/low.
function fiveDayRow(days) {
  return `<div class="wx-days">${days.map((day, index) => `<span>
    <small>${index === 0 ? "TODAY" : new Date(day.date + "T12:00:00").toLocaleDateString([], { weekday: "short" }).toUpperCase()}</small>
    ${weatherIcon(day.weatherCode, { day: true, size: 30 })}
    <b>${degree(day.high)}</b><i>${degree(day.low)}</i>
    ${Number(day.precipitationChance || 0) >= 20 ? `<em>${Math.round(Number(day.precipitationChance))}%</em>` : `<em class="dry"></em>`}
  </span>`).join("")}</div>`;
}

// Five days as range bars: each day's high-to-low drawn against the week's own
// span, which is how a forecast reads at a glance in a real weather app.
function fiveDayDetail(days) {
  const highs = days.map(day => Number(day.high)).filter(Number.isFinite);
  const lows = days.map(day => Number(day.low)).filter(Number.isFinite);
  if (!highs.length) return "";
  const top = Math.max(...highs), bottom = Math.min(...lows), span = Math.max(1, top - bottom);
  return `<div class="wx-five">${days.map((dayEntry, index) => {
    const high = Number(dayEntry.high), low = Number(dayEntry.low);
    const left = Number.isFinite(low) ? (low - bottom) / span * 100 : 0;
    const width = Number.isFinite(high) && Number.isFinite(low) ? Math.max(6, (high - low) / span * 100) : 100;
    return `<article>
      <b>${index === 0 ? "TODAY" : new Date(dayEntry.date + "T12:00:00").toLocaleDateString([], { weekday: "long" }).toUpperCase()}</b>
      <span class="wx-five-icon">${weatherIcon(dayEntry.weatherCode, { day: true, size: 28 })}</span>
      <i class="wx-five-low">${degree(dayEntry.low)}</i>
      <div class="wx-five-track"><span style="--left:${left.toFixed(1)}%;--width:${width.toFixed(1)}%"></span></div>
      <i class="wx-five-high">${degree(dayEntry.high)}</i>
      <em>${Math.round(Number(dayEntry.precipitationChance || 0))}%</em>
      <small>${esc(weatherWord(dayEntry.weatherCode))} · SUN ${esc(clockLabel(dayEntry.sunrise))}–${esc(clockLabel(dayEntry.sunset))}</small>
    </article>`;
  }).join("")}</div>`;
}

// Today by the hour: a temperature curve over precipitation bars, one drawing
// rather than a row of boxes.
function hourlyChart(hours, payload) {
  if (hours.length < 2) return "";
  const width = 560, height = 132, padTop = 22, padBottom = 34;
  const temps = hours.map(hour => Number(hour.temperature)).filter(Number.isFinite);
  const top = Math.max(...temps), bottom = Math.min(...temps), span = Math.max(1, top - bottom);
  const step = width / (hours.length - 1);
  const pointFor = (hour, index) => {
    const value = Number(hour.temperature);
    const y = padTop + (1 - (value - bottom) / span) * (height - padTop - padBottom);
    return [index * step, y];
  };
  const points = hours.map(pointFor);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height - padBottom} ${line} ${width},${height - padBottom}`;
  const bars = hours.map((hour, index) => {
    const chance = Math.max(0, Math.min(100, Number(hour.precipitationChance || 0)));
    const barHeight = chance / 100 * (height - padTop - padBottom);
    return `<rect x="${(index * step - step * 0.3).toFixed(1)}" y="${(height - padBottom - barHeight).toFixed(1)}"
      width="${(step * 0.6).toFixed(1)}" height="${barHeight.toFixed(1)}" fill="#71a9b8" opacity=".45"/>`;
  }).join("");
  const labels = hours.map((hour, index) => index % 2 === 0
    ? `<text x="${(index * step).toFixed(1)}" y="${height - 12}" text-anchor="middle" class="wx-axis">${esc(new Date(hour.time).toLocaleTimeString([], { hour: "numeric" }).replace(" ", ""))}</text>`
    : "").join("");
  const marks = points.map(([x, y], index) => index % 2 === 0
    ? `<text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="wx-mark">${degree(hours[index].temperature)}</text>`
    : "").join("");
  return `<svg class="wx-hourly" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
      aria-label="Temperature and chance of precipitation by the hour">
    ${bars}
    <polygon points="${area}" fill="url(#wxfill)"/>
    <polyline points="${line}" fill="none" stroke="#f2bd4b" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#f2bd4b"/>`).join("")}
    ${marks}${labels}
    <defs><linearGradient id="wxfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f2bd4b" stop-opacity=".28"/><stop offset="100%" stop-color="#f2bd4b" stop-opacity="0"/>
    </linearGradient></defs>
  </svg>`;
}

// The next three hours, in fifteen-minute steps.
function rainChart(steps) {
  if (!steps.length) return "";
  const peak = Math.max(20, ...steps.map(step => Number(step.precipitationChance || 0)));
  // Label the hour marks only — a label under all twelve fifteen-minute steps
  // does not fit and ends up truncated.
  return `<div class="wx-rain">${steps.map(step => {
    const chance = Math.max(0, Number(step.precipitationChance || 0));
    const at = new Date(step.time);
    const onTheHour = at.getMinutes() === 0;
    return `<span title="${esc(clockLabel(step.time))} · ${Math.round(chance)}%">
      <i style="--fill:${(chance / peak * 100).toFixed(0)}%"></i>
      <small>${onTheHour ? esc(at.toLocaleTimeString([], { hour: "numeric" }).replace(" ", "")) : ""}</small>
    </span>`;
  }).join("")}</div>`;
}

function radarMarkup(radar, payload, forecast) {
  const frames = [...(radar?.past || []), ...(radar?.nowcast || [])];
  const ahead = forecast?.frames || [];
  if (!frames.length || !radar?.host) return `<p class="home-radar-empty">Radar frames are unavailable right now.</p>`;
  // Tiles are 256px; zoom 7 keeps a few counties in view around the point.
  const zoom = 7;
  const scale = 1 << zoom;
  const x = Math.floor((Number(payload.longitude) + 180) / 360 * scale);
  const latitudeRadians = Number(payload.latitude) * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2 * scale);
  const tiles = frames.map((frame, index) =>
    `<img class="home-radar-frame${index === 0 ? " visible" : ""}" data-radar-index="${index}" data-radar-time="${frame.time}" src="${esc(radar.host + frame.path)}/256/${zoom}/${x}/${y}/4/1_1.png" alt="">`).join("");
  return `<div class="home-radar" data-radar-count="${frames.length}" data-forecast-count="${ahead.length}">
    <div class="home-radar-stage">${tiles}
      <canvas class="home-radar-forecast" data-radar-canvas width="256" height="256" hidden></canvas>
      <span class="home-radar-clock" data-radar-clock>${esc(clockLabel(frames[0].time * 1000))}</span>
      <span class="home-radar-phase" data-radar-phase>OBSERVED</span></div>
    <div class="home-radar-controls"><button data-radar-toggle>${radarPlaying ? "PAUSE" : "PLAY"}</button>
      <small>${frames.length} OBSERVED${ahead.length ? ` + ${ahead.length} PREDICTED` : ""} · TWO HOURS BACK${ahead.length ? ", THREE AHEAD" : ""}</small></div>
    <p class="home-radar-note">${ahead.length
      ? "Observed frames are radar. Predicted frames are the forecast model sampled across a 130-mile grid — radar itself cannot see forward."
      : "Radar shows what has already fallen. Clear sky means empty rings."}</p></div>`;
}

export async function openWeatherCard(onChanged = () => {}) {
  const city = activeCity();
  const payload = await refreshHomeWeather();
  const radar = await refreshHomeRadar();
  const forecast = await refreshForecastRadar();
  const { cities, activeId } = homeCities();
  if (!payload) { openModal({ title: "WEATHER", body: "<p>The forecast could not be loaded.</p>", actions: [{ label: "CLOSE", primary: true, handler: () => closeModal() }] }); return; }

  const alerts = payload.alerts || [];
  const days = payload.daily || [];
  const hours = (payload.hourly || []).slice(0, 12);
  const steps = payload.minutely || [];
  const today = days[0] || {};
  const daylight = isDaylight(payload);

  openModal({
    title: `WEATHER · ${city.label.toUpperCase()}`,
    body: `<div class="home-weather-full">
      ${alerts.length ? `<section class="home-weather-alerts">${alerts.map(alert => `<article><b>${esc(alert.event)}</b><small>${esc(alert.severity || "")}${alert.ends ? ` · until ${esc(clockLabel(alert.ends))}` : ""}</small><p>${esc(alert.headline || alert.description || "")}</p></article>`).join("")}</section>` : ""}

      <section class="home-weather-cities"><span>CITIES</span>
        <div>${cities.map(entry => `<button class="${entry.id === activeId ? "active" : ""}" data-weather-city="${esc(entry.id)}">${esc(entry.label)}</button>`).join("")}</div>
        <div class="home-weather-add"><input data-weather-search placeholder="Add a city" autocomplete="off"><button data-weather-search-go>FIND</button></div>
        <div data-weather-results class="home-weather-results"></div>
        ${cities.length > 1 && !city.home ? `<button class="home-weather-remove" data-weather-remove="${esc(city.id)}">REMOVE ${esc(city.label)}</button>` : ""}
      </section>

      <section class="wx-full-hero wx-mood-${weatherMood(payload.current?.weatherCode, daylight)}">
        <div class="wx-full-icon">${weatherIcon(payload.current?.weatherCode, { day: daylight, size: 92 })}</div>
        <div class="wx-full-read">
          <b>${degree(payload.current?.temperature)}</b>
          <strong>${esc(weatherWord(payload.current?.weatherCode))}</strong>
          <small class="wx-facts"><span>FEELS LIKE ${degree(payload.current?.apparentTemperature)}</span><span>WIND ${Math.round(Number(payload.current?.windSpeed || 0))} MPH</span><span>HUMIDITY ${Math.round(Number(payload.current?.humidity || 0))}%</span></small>
        </div>
        <div class="wx-sun">
          <span><i class="wx-sunrise"></i>SUNRISE<b>${esc(clockLabel(today.sunrise))}</b></span>
          <span><i class="wx-sunset"></i>SUNSET<b>${esc(clockLabel(today.sunset))}</b></span>
        </div>
      </section>

      <section class="home-weather-block"><h3>NEXT THREE HOURS</h3>
        <p class="home-weather-sentence">${esc(rainSentence(payload))}</p>
        ${rainChart(steps)}
      </section>

      <section class="home-weather-block"><h3>TODAY BY THE HOUR</h3>${hourlyChart(hours, payload)}</section>

      <section class="home-weather-block"><h3>RADAR</h3>${radarMarkup(radar, payload, forecast)}</section>

      <section class="home-weather-block"><h3>FIVE DAYS</h3>${fiveDayDetail(days)}</section>
    </div>`,
    // openModal supplies its own close control; a second one just crowds the footer.
    actions: []
  });

  bindWeatherCard(onChanged);
  startRadarLoop(forecast);
}

function stopRadarLoop() { if (radarTimer) { clearInterval(radarTimer); radarTimer = null; } }

// One timeline: the observed radar frames, then the predicted ones. Observed
// frames are tile images; predicted frames are painted onto the canvas.
function startRadarLoop(forecast) {
  stopRadarLoop();
  const stage = document.querySelector("#modal-root .home-radar");
  if (!stage) return;
  const frames = [...stage.querySelectorAll(".home-radar-frame")];
  const ahead = forecast?.frames || [];
  const total = frames.length + ahead.length;
  if (total < 2) return;
  const canvas = stage.querySelector("[data-radar-canvas]");
  const clock = stage.querySelector("[data-radar-clock]");
  const phase = stage.querySelector("[data-radar-phase]");
  radarFrame = 0;
  const show = index => {
    const predicted = index >= frames.length;
    frames.forEach((frame, position) => frame.classList.toggle("visible", !predicted && position === index));
    if (canvas) canvas.hidden = !predicted;
    if (predicted && canvas) paintForecastFrame(canvas, ahead[index - frames.length], forecast.size || 9);
    if (clock) {
      clock.textContent = predicted
        ? clockLabel(ahead[index - frames.length].time)
        : clockLabel(Number(frames[index].dataset.radarTime) * 1000);
    }
    if (phase) {
      phase.textContent = predicted ? "PREDICTED" : "OBSERVED";
      phase.classList.toggle("predicted", predicted);
    }
  };
  show(0);
  radarTimer = setInterval(() => {
    if (!document.querySelector("#modal-root .home-radar")) return stopRadarLoop();
    if (!radarPlaying) return;
    radarFrame = (radarFrame + 1) % total;
    show(radarFrame);
  }, 550);
}

function bindWeatherCard(onChanged) {
  const root = document.querySelector("#modal-root .home-weather-full");
  if (!root) return;
  const results = root.querySelector("[data-weather-results]");

  const runSearch = async () => {
    const field = root.querySelector("[data-weather-search]");
    const query = String(field?.value || "").trim();
    if (query.length < 2) return;
    results.innerHTML = `<small>SEARCHING…</small>`;
    try {
      const places = await searchHomeCity(query);
      results.innerHTML = places.length
        ? places.map(place => `<button data-weather-pick='${esc(JSON.stringify(place))}'>${esc(place.label)}</button>`).join("")
        : `<small>NOTHING FOUND FOR THAT NAME.</small>`;
    } catch (error) { results.innerHTML = `<small>${esc(error.message)}</small>`; }
  };

  root.onclick = async event => {
    const pick = event.target.closest("[data-weather-pick]");
    if (pick) {
      try { addHomeCity(JSON.parse(pick.dataset.weatherPick)); } catch {}
      stopRadarLoop(); closeModal(); await openWeatherCard(onChanged); onChanged(); return;
    }
    const select = event.target.closest("[data-weather-city]")?.dataset.weatherCity;
    if (select) { selectHomeCity(select); stopRadarLoop(); closeModal(); await openWeatherCard(onChanged); onChanged(); return; }
    const remove = event.target.closest("[data-weather-remove]")?.dataset.weatherRemove;
    if (remove) { removeHomeCity(remove); stopRadarLoop(); closeModal(); await openWeatherCard(onChanged); onChanged(); return; }
    if (event.target.closest("[data-weather-search-go]")) return runSearch();
    const toggle = event.target.closest("[data-radar-toggle]");
    if (toggle) { radarPlaying = !radarPlaying; toggle.textContent = radarPlaying ? "PAUSE" : "PLAY"; }
  };
  root.onkeydown = event => { if (event.key === "Enter" && event.target.closest("[data-weather-search]")) { event.preventDefault(); runSearch(); } };
}
