import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";
import { homeCities } from "./homeCommandCenter.js?v=20261001-home-city-v2";

/* Cards that have nothing to do with the archive.
 *
 * SKY TONIGHT answers one question — is it worth stepping outside — which needs
 * three sources at once. Aurora services tell you there is activity; they do not
 * tell you it is overcast in Redfield, or that it will not be properly dark for
 * another two hours. All three together, or the answer is noise.
 */

const CURIO_TTL = 6 * 60 * 60 * 1000;

let sky = { ready: false, data: null, cityId: "" };
let curios = { apod: null, xkcd: null, rabbit: null, fetchedAt: 0 };
let redraw = () => {};
let cityListenerInstalled = false;

const activeSkyCity = () => {
  const { cities, activeId } = homeCities();
  return cities.find(city => city.id === activeId) || cities[0];
};

const clock = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

async function ask(path, name, payload = {}) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault-Request": name },
      body: JSON.stringify(payload),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/* The single sentence at the top of the card. Everything below it is detail;
 * this is the part that decides whether you put shoes on. */
function skyVerdict(data, latitude) {
  const clouds = data.clouds?.now, aurora = data.aurora || {}, kp = data.space?.kp;
  const band = Number(aurora.band ?? 999);
  const overcast = typeof clouds === "number" && clouds >= 80;
  // Aurora is seen low on the northern horizon from well south of where it sits,
  // so the band creeping within ~10 degrees of the selected city is the thing worth saying.
  const auroraClose = band <= Number(latitude || 0) + 10;
  if (auroraClose && !overcast) {
    return { tone: "alert", line: `Aurora possible — activity down to ${band}°N, low on the northern horizon.` };
  }
  if (overcast) {
    return { tone: "quiet", line: `Overcast — ${clouds}% cloud. Nothing to see tonight.` };
  }
  if (typeof clouds === "number" && clouds <= 25) {
    return { tone: "good", line: `Clear — ${clouds}% cloud.` };
  }
  if (typeof clouds === "number") {
    return { tone: "", line: `Partly cloudy — ${clouds}%.` };
  }
  return { tone: "", line: kp != null ? `Kp ${kp}.` : "Checking conditions…" };
}

function renderSky() {
  const city = activeSkyCity();
  if (!sky.ready || sky.cityId !== city.id) return card("SKY TONIGHT", `<p class="home-card__quiet">Looking up…</p>`, city.label);
  const data = sky.data;
  if (!data) return card("SKY TONIGHT", `<p class="home-card__quiet">Could not reach the sky services.</p>`, city.label);
  const verdict = skyVerdict(data, city.latitude);
  const moon = data.moon || {};
  const planets = data.planets || [];
  const dark = data.dark || {};

  const bits = [];
  if (moon.name) bits.push(`${esc(moon.name)}, ${moon.illumination}% lit${moon.washesOut ? " — bright enough to wash out anything faint" : ""}`);
  if (dark.darkFrom) bits.push(`Properly dark ${esc(clock(dark.darkFrom))} to ${esc(clock(dark.darkUntil))}`);
  if (planets.length) {
    const named = planets.map(planet => `${esc(planet.name)} ${planet.altitude}° ${esc(planet.direction)}`).join(", ");
    bits.push(`${data.planetsNow ? "Up now" : "After dark"}: ${named}`);
  }
  const kp = data.space?.kp;
  if (kp != null) bits.push(`Kp ${kp}${data.space.storm ? ` · ${esc(data.space.storm)} storm` : ""}`);

  // The northward profile, which is the honest way to show a thing that is
  // never directly overhead at this latitude.
  const north = (data.aurora?.north || []).filter(row => row.probability > 0).slice(0, 7);
  const ladder = north.length ? `<ul class="sky-ladder">${north.map(row =>
    `<li><span>${row.lat}°N</span><i style="--fill:${Math.min(100, row.probability)}%"></i><b>${row.probability}%</b></li>`).join("")}</ul>` : "";

  return card("SKY TONIGHT", `
    <p class="home-card__lead sky-verdict${verdict.tone ? ` is-${verdict.tone}` : ""}">${esc(verdict.line)}</p>
    <ul class="sky-facts">${bits.map(bit => `<li>${bit}</li>`).join("")}</ul>
    ${ladder}`, city.label);
}

function renderApod() {
  const data = curios.apod;
  if (!data) return card("PICTURE OF THE DAY", `<p class="home-card__quiet">Asking NASA…</p>`);
  // On video days NASA supplies a still, so there is always something to see.
  const media = data.url
    ? `<img class="curio-image" src="${esc(data.url)}" alt="${esc(data.title)}" loading="lazy">`
    : "";
  return card("PICTURE OF THE DAY", `
    ${media}
    ${data.mediaType !== "image" ? `<p class="home-card__quiet">Today's entry is a video.</p>` : ""}
    <p class="home-card__lead"><b>${esc(data.title)}</b></p>
    <p class="home-card__note curio-clamp">${esc(data.explanation)}</p>
    ${data.credit ? `<p class="home-card__quiet">${esc(data.credit)}</p>` : ""}`);
}

function renderXkcd() {
  const data = curios.xkcd;
  if (!data) return card("XKCD", `<p class="home-card__quiet">Loading…</p>`);
  return card("XKCD", `
    <img class="curio-image xkcd" src="${esc(data.img)}" alt="${esc(data.title)}" loading="lazy">
    <p class="home-card__lead"><b>${esc(data.title)}</b></p>
    <p class="home-card__note">${esc(data.alt)}</p>`, `#${data.number}`);
}

function renderRabbitHole() {
  const data = curios.rabbit;
  if (!data) return card("RABBIT HOLE", `<p class="home-card__quiet">Finding something…</p>`);
  return card("RABBIT HOLE", `
    <p class="home-card__lead"><b>${esc(data.title)}</b></p>
    <p class="home-card__note curio-clamp">${esc(data.extract)}</p>
    <button class="home-card__open" data-rabbit-again>ANOTHER</button>`);
}

/* Countdowns are the one card here with no source at all — just dates you care
 * about, kept in the archive like everything else. */
export function countdowns(state = getState()) {
  return (state.metadata?.countdowns || [])
    .map(entry => ({ ...entry, days: Math.ceil((new Date(entry.date) - Date.now()) / 86400000) }))
    .filter(entry => Number.isFinite(entry.days))
    .sort((left, right) => left.days - right.days);
}

export function addCountdown(label, date) {
  const clean = String(label || "").trim().slice(0, 80);
  if (!clean || Number.isNaN(new Date(date).getTime())) return false;
  update(save => {
    save.metadata.countdowns = [...(save.metadata.countdowns || []),
      { id: `cd_${Date.now().toString(36)}`, label: clean, date }];
  });
  return true;
}

export function removeCountdown(id) {
  update(save => {
    save.metadata.countdowns = (save.metadata.countdowns || []).filter(entry => entry.id !== id);
  });
}

function renderCountdown() {
  const rows = countdowns();
  if (!rows.length) {
    return card("COUNTDOWN", `
      <p class="home-card__quiet">Nothing counted down yet.</p>
      <button class="home-card__open" data-countdown-add>ADD ONE</button>`);
  }
  const list = rows.slice(0, 5).map(entry => {
    const when = entry.days === 0 ? "today" : entry.days === 1 ? "tomorrow"
      : entry.days < 0 ? `${Math.abs(entry.days)}d ago` : `${entry.days} days`;
    return `<li${entry.days < 0 ? ' class="past"' : ""}>
      <b>${esc(entry.label)}</b><span>${esc(when)}</span>
      <button data-countdown-remove="${esc(entry.id)}" title="Remove">×</button>
    </li>`;
  }).join("");
  return card("COUNTDOWN", `
    <ul class="countdown-list">${list}</ul>
    <button class="home-card__open" data-countdown-add>ADD ONE</button>`);
}

const card = (label, body, badge = "") => `<article class="home-card">
  <header><span class="eyebrow">${esc(label)}</span>${badge ? `<small>${esc(badge)}</small>` : ""}</header>
  ${body}
</article>`;

export function renderHomeCuriosities() {
  return `<section class="home-cards home-curios" aria-label="Tonight and elsewhere">
    ${renderSky()}
    ${renderCountdown()}
    ${renderApod()}
    ${renderXkcd()}
    ${renderRabbitHole()}
  </section>`;
}

/* Cocktails and cooking belong with the food records, not on Home. Exported
 * here because the fetching and shaping are the same as the other curios. */
export async function foodCurio(kind) {
  return ask("./__vault/food/curio", "food-curio", { kind });
}

export async function refreshRabbitHole() {
  curios.rabbit = await ask("./__vault/sky/curio", "sky-curio", { kind: "rabbit" });
  redraw();
}

async function refreshSkyForActiveCity() {
  const city = activeSkyCity();
  if (sky.ready && sky.cityId === city.id) return sky.data;
  sky = { ready: false, data: null, cityId: city.id };
  try { redraw(); } catch {}
  const data = await ask("./__vault/sky/tonight", "sky-tonight", {
    latitude: city.latitude,
    longitude: city.longitude,
    label: city.label
  });
  if (activeSkyCity().id !== city.id) return data;
  sky = { ready: true, data, cityId: city.id };
  try { redraw(); } catch {}
  return data;
}

export function ensureHomeCuriosities(onChanged = () => {}) {
  redraw = onChanged;
  // Everything here loads after the first paint. Home draws from what it already
  // has and these fill in as the answers arrive.
  refreshSkyForActiveCity();
  if (!cityListenerInstalled) {
    cityListenerInstalled = true;
    window.addEventListener("vault-home-city-changed", () => {
      sky = { ready: false, data: null, cityId: "" };
      refreshSkyForActiveCity();
    });
  }
  if (Date.now() - curios.fetchedAt > CURIO_TTL) {
    curios.fetchedAt = Date.now();
    ask("./__vault/sky/curio", "sky-curio", { kind: "apod" }).then(data => { curios.apod = data; redraw(); });
    ask("./__vault/sky/curio", "sky-curio", { kind: "xkcd" }).then(data => { curios.xkcd = data; redraw(); });
  }
  if (!curios.rabbit) refreshRabbitHole();
}
