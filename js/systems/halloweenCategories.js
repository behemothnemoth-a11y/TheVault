const FACETS = {
  tone: new Set(["fun","camp","comedy","dark-comedy","wtf","weird","surreal","family"]),
  subgenre: new Set([
    "slasher","creature","ghost","haunted","supernatural","zombie","vampire","werewolf",
    "witch","occult","possession","body-horror","found-footage","folk","cosmic","lovecraft",
    "psychological","sci-fi","alien","demon","curse","cannibal","infection","survival"
  ]),
  presentation: new Set(["anthology","mockumentary","animation","anime","musical"]),
  flavor: new Set([
    "classic","international","holiday","halloween","gothic","teen","punk","metal","giallo",
    "grindhouse","stephen-king","urban-legend","liminal","satanic-panic"
  ]),
  intensity: new Set(["gore","extreme","disturbing","gross"])
};

const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
const unique = values => [...new Set(values.filter(Boolean))];

function decadeFor(year) {
  const value = Number(year || 0);
  return value ? `${Math.floor(value / 10) * 10}s` : "";
}

export function categorizeHalloweenEntry(entry = {}) {
  const tags = unique((entry.tags || []).map(normalize));
  const facets = Object.fromEntries(Object.entries(FACETS).map(([name, allowed]) => [
    name,
    tags.filter(tag => allowed.has(tag))
  ]));
  const assigned = new Set(Object.values(facets).flat());
  return {
    kind: entry.kind || "",
    format: entry.format || (entry.kind === "show" ? "series" : "movie"),
    decade: decadeFor(entry.year),
    tags,
    facets,
    other: tags.filter(tag => !assigned.has(tag))
  };
}

export function halloweenCategoryIds(entry = {}) {
  const categories = entry.categories || categorizeHalloweenEntry(entry);
  return unique([
    categories.kind && `kind:${categories.kind}`,
    categories.format && `format:${categories.format}`,
    categories.decade && `decade:${categories.decade}`,
    ...Object.entries(categories.facets || {}).flatMap(([facet, values]) =>
      values.map(value => `${facet}:${value}`)
    ),
    ...(categories.other || []).map(value => `tag:${value}`)
  ]);
}
