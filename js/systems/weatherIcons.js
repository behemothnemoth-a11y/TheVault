// Weather icons, drawn here rather than fetched.
//
// Inline SVG keeps them on the Vault's own palette, scales cleanly at any
// interface size, needs no network and no asset files, and lets a clear night
// look different from a clear day. Every icon is a single <svg> string built
// from the same 64×64 box so they line up wherever they are used.

const SUN = "#f2bd4b", SUN_DIM = "#a86f20", CLOUD = "#c8bfa8", CLOUD_DARK = "#8d8471";
const RAIN = "#71a9b8", SNOW = "#dCE7EA", BOLT = "#f2bd4b", MOON = "#e0d8c0";

const open = size => `<svg class="wx" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-hidden="true">`;

const sunDisc = (cx = 26, cy = 26, r = 11) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUN}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${SUN_DIM}" stroke-width="1.5"/>`;

const sunRays = (cx = 26, cy = 26) => Array.from({ length: 8 }, (_, index) => {
  const angle = index * Math.PI / 4;
  const inner = 15, outer = 21;
  return `<line x1="${(cx + Math.cos(angle) * inner).toFixed(1)}" y1="${(cy + Math.sin(angle) * inner).toFixed(1)}"
                x2="${(cx + Math.cos(angle) * outer).toFixed(1)}" y2="${(cy + Math.sin(angle) * outer).toFixed(1)}"
                stroke="${SUN}" stroke-width="2.5" stroke-linecap="round"/>`;
}).join("");

const moonDisc = (cx = 26, cy = 25, r = 12) => `
  <path d="M ${cx + r * 0.45} ${cy - r} a ${r} ${r} 0 1 0 ${r * 0.55} ${r * 1.25}
           a ${r * 0.85} ${r * 0.85} 0 1 1 ${-r * 0.55} ${-r * 1.25} z" fill="${MOON}"/>`;

const cloud = (x = 0, y = 0, fill = CLOUD) => `
  <g transform="translate(${x} ${y})">
    <path d="M18 44 a11 11 0 0 1 1.5 -21.9 a15 15 0 0 1 28.4 4.2 a10 10 0 0 1 -2.4 19.7 z"
          fill="${fill}" stroke="${CLOUD_DARK}" stroke-width="1.5" stroke-linejoin="round"/>
  </g>`;

const drops = (count, colour = RAIN, y = 46) => Array.from({ length: count }, (_, index) => {
  const x = 20 + index * 9;
  return `<line x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + 9}" stroke="${colour}" stroke-width="2.6" stroke-linecap="round"/>`;
}).join("");

const flakes = (count, y = 50) => Array.from({ length: count }, (_, index) => {
  const x = 21 + index * 9;
  return `<g stroke="${SNOW}" stroke-width="1.8" stroke-linecap="round">
    <line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}"/>
    <line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}"/>
    <line x1="${x - 2}" y1="${y - 2}" x2="${x + 2}" y2="${y + 2}"/>
    <line x1="${x + 2}" y1="${y - 2}" x2="${x - 2}" y2="${y + 2}"/>
  </g>`;
}).join("");

const bolt = () => `<path d="M33 42 L26 55 L32 55 L28 64 L40 51 L33 51 L38 42 z" fill="${BOLT}" stroke="${SUN_DIM}" stroke-width="1"/>`;

// Open-Meteo WMO codes → a drawing. Day and night differ where it matters.
export function weatherIcon(code, { day = true, size = 44 } = {}) {
  const value = Number(code);
  const box = open(size);
  const close = "</svg>";

  if (value === 0) return box + (day ? sunRays() + sunDisc() : moonDisc()) + close;
  if (value === 1 || value === 2) {
    return box + (day ? sunRays(24, 22) + sunDisc(24, 22, 9) : moonDisc(24, 21, 10)) + cloud(4, 4) + close;
  }
  if (value === 3) return box + cloud(2, 0, CLOUD_DARK) + cloud(6, 6) + close;
  if (value === 45 || value === 48) {
    return box + cloud(4, -4) + `<g stroke="${CLOUD_DARK}" stroke-width="3" stroke-linecap="round">
      <line x1="14" y1="48" x2="50" y2="48"/><line x1="18" y1="55" x2="46" y2="55"/></g>` + close;
  }
  if ([51, 53, 55, 56, 57].includes(value)) return box + cloud(4, -4) + drops(3, RAIN, 44) + close;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return box + cloud(4, -6) + drops(4, RAIN, 42) + close;
  if ([71, 73, 75, 77, 85, 86].includes(value)) return box + cloud(4, -6) + flakes(3, 50) + close;
  if ([95, 96, 99].includes(value)) return box + cloud(4, -8, CLOUD_DARK) + bolt() + close;
  return box + cloud(4, 2) + close;
}

// A short word for the same code, matching the icon.
export function weatherWord(code) {
  const value = Number(code);
  if (value === 0) return "CLEAR";
  if (value === 1) return "MOSTLY CLEAR";
  if (value === 2) return "PARTLY CLOUDY";
  if (value === 3) return "OVERCAST";
  if ([45, 48].includes(value)) return "FOG";
  if ([51, 53, 55, 56, 57].includes(value)) return "DRIZZLE";
  if ([61, 63].includes(value)) return "RAIN";
  if ([65, 82].includes(value)) return "HEAVY RAIN";
  if ([66, 67].includes(value)) return "FREEZING RAIN";
  if ([80, 81].includes(value)) return "SHOWERS";
  if ([71, 73, 85].includes(value)) return "SNOW";
  if ([75, 86].includes(value)) return "HEAVY SNOW";
  if (value === 77) return "SNOW GRAINS";
  if (value === 95) return "THUNDERSTORMS";
  if ([96, 99].includes(value)) return "STORMS WITH HAIL";
  return "CONDITIONS UNKNOWN";
}

// A background wash for the hero, so a storm does not look like a clear morning.
export function weatherMood(code, day = true) {
  const value = Number(code);
  if (value === 0 || value === 1) return day ? "clear-day" : "clear-night";
  if (value === 2 || value === 3) return "cloud";
  if ([45, 48].includes(value)) return "fog";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "snow";
  if ([95, 96, 99].includes(value)) return "storm";
  return "rain";
}
