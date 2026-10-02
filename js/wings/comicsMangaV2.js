import { getState, update } from "../core/store.js";
import { escapeHtml as esc } from "../ui/safeHtml.js";

export const COMIC_STRUCTURE_MODES = Object.freeze({
  manga: "volumes_chapters",
  comic: "issues_collections",
  graphic_novel: "editions",
  webcomic: "seasons_chapters",
  mixed: "mixed"
});

export const COMIC_OWNERSHIP_TYPES = Object.freeze(["physical", "localDigital", "kindle", "otherDigital"]);

const artFor = item => typeof item?.artwork === "string" ? item.artwork : item?.artwork?.localPath || item?.artwork?.url || "";
const metaFor = item => item?.comicMeta || {};
const structureForFormat = format => COMIC_STRUCTURE_MODES[format] || COMIC_STRUCTURE_MODES.mixed;
const ownershipFor = item => ({
  physical: Boolean(item?.owned),
  localDigital: Boolean(item?.sourcePath || metaFor(item).sourcePath),
  kindle: Boolean(metaFor(item).readingAccess?.kindleOwned),
  otherDigital: false,
  ...(metaFor(item).ownership || {})
});
const ownsAnything = item => Object.values(ownershipFor(item)).some(Boolean);
const newCount = item => {
  const meta = metaFor(item);
  if (meta.readingStatus === "planned") return 0;
  const releases = (meta.releases || []).filter(value => value.status !== "read").length;
  if (releases) return releases;
  return Math.max(0, Math.ceil(Number(meta.latestKnown || 0) - Number(meta.readThrough || 0)));
};
const compactCover = item => artFor(item)
  ? `<img src="${esc(artFor(item))}" alt="Cover for ${esc(item.title)}">`
  : `<b>${esc(String(item.title || "CM").split(/\s+/).slice(0, 2).map(value => value[0]).join("").toUpperCase())}</b>`;

export function ensureComicsMangaV2() {
  const state = getState();
  const records=Object.values(state.items||{}).filter(value=>value.wing==="manga"&&value.comicMeta);
  if (Number(state.metadata?.comicsManga?.version || 0) >= 6 && !records.some(item=>!item.comicMeta.structure||!item.comicMeta.ownership||!item.comicMeta.metadataAuthority)) return;
  update(save => {
    const stage = save.metadata.comicsManga ||= {};
    for (const item of Object.values(save.items || {}).filter(value => value.wing === "manga" && value.comicMeta)) {
      const meta = item.comicMeta;
      meta.structure ||= { mode: structureForFormat(meta.format), override: false };
      if (!Object.values(COMIC_STRUCTURE_MODES).includes(meta.structure.mode)) meta.structure.mode = structureForFormat(meta.format);
      meta.ownership = { ...ownershipFor(item), ...(meta.ownership || {}) };
      item.owned = Object.values(meta.ownership).some(Boolean);
      meta.metadataAuthority ||= { manualFields: [], fieldSources: {}, conflicts: [], policyVersion: 1 };
      meta.artworkReview ||= { status: artFor(item) ? "approved_existing" : "missing", reviewedAt: null };
      meta.monitoringOverride ??= null;
      item.genres=(item.genres||[]).filter(value=>String(value).trim().toLowerCase()!=="books");
      if(String(item.title||"").trim().toLowerCase()==="one piece"){
        if(!item.creator) item.creator="Eiichiro Oda";
        if(!item.publisher) item.publisher="Shueisha / VIZ Media";
        item.genres=[...new Set(["Manga","Adventure","Fantasy",...(item.genres||[])])].slice(0,8);
        meta.metadataAuthority.fieldSources.creator||={source:"verified_vault_seed",checkedAt:new Date().toISOString()};
        meta.metadataAuthority.fieldSources.publisher||={source:"verified_vault_seed",checkedAt:new Date().toISOString()};
      }
    }
    stage.version = 6;
    stage.v2StartedAt ||= new Date().toISOString();
    stage.virtualCollections ||= { threshold: 5, enabledKinds: ["creator", "format", "publisher", "genre"], pinned: [], hidden: [] };
    stage.identityReview ||= [];
    stage.metadataReview ||= stage.metadataReview || [];
  });
}

export function setComicStructure(itemId, mode) {
  if (!Object.values(COMIC_STRUCTURE_MODES).includes(mode)) return false;
  update(save => {
    const meta = save.items[itemId]?.comicMeta;
    if (!meta) return;
    meta.structure = { mode, override: true, changedAt: new Date().toISOString() };
  });
  return true;
}

export function setComicOwnershipType(itemId, type, value) {
  if (!COMIC_OWNERSHIP_TYPES.includes(type)) return false;
  update(save => {
    const item = save.items[itemId];
    if (!item?.comicMeta) return;
    item.comicMeta.ownership = { ...ownershipFor(item), [type]: Boolean(value) };
    item.owned = Object.values(item.comicMeta.ownership).some(Boolean);
    item.comicMeta.ownershipUpdatedAt = new Date().toISOString();
  });
  return true;
}

export function comicMonitoringEligible(item) {
  const meta = metaFor(item);
  if (typeof meta.monitoringOverride === "boolean") return meta.monitoringOverride;
  if (item.favorite) return true;
  if (!["reading", "cooking"].includes(meta.readingStatus)) return false;
  return !(meta.readingStatus === "completed" && meta.publicationStatus === "complete");
}

function shelfCard(item, note = "") {
  const meta = metaFor(item), fresh = newCount(item), percent = Math.max(0, Math.min(100, Number(meta.readerPercent || 0)));
  return `<button class="comic-v2-shelf-card" data-open-comic="${esc(item.id)}"><i>${compactCover(item)}</i><span><b>${esc(item.title)}</b><small>${esc(note || String(meta.format || "comic").replaceAll("_", " ").toUpperCase())}</small>${percent > 0 && percent < 100 ? `<em>${percent}% READ</em>` : fresh ? `<em>${fresh} NEW</em>` : `<em>${esc(String(meta.readingStatus || "planned").replaceAll("_", " ").toUpperCase())}</em>`}</span></button>`;
}

function shelf(title, eyebrow, items, emptyText, className = "") {
  return `<section class="panel comic-v2-shelf ${className}"><header><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><span>${items.length}</span></header>${items.length ? `<div class="comic-v2-shelf-track">${items.slice(0, 12).map(item => shelfCard(item)).join("")}</div>` : `<p class="comic-v2-shelf-empty">${esc(emptyText)}</p>`}</section>`;
}

function virtualCollections(records) {
  const threshold=Number(getState().metadata?.comicsManga?.virtualCollections?.threshold||5),buckets=[];
  const add=(kind,label,test)=>{const items=records.filter(test);if(label&&items.length>=threshold)buckets.push({kind,label,items})};
  const creators=new Set(records.map(item=>item.creator).filter(Boolean)),publishers=new Set(records.map(item=>item.publisher).filter(Boolean)),formats=new Set(records.map(item=>String(metaFor(item).format||item.type||"comic").replaceAll("_"," ").toUpperCase())),genres=new Set(records.flatMap(item=>item.genres||[]).filter(value=>!["manga","comics"].includes(String(value).toLowerCase())));
  creators.forEach(label=>add("creator",label,item=>item.creator===label));
  publishers.forEach(label=>add("publisher",label,item=>item.publisher===label));
  formats.forEach(label=>add("format",label,item=>String(metaFor(item).format||item.type||"comic").replaceAll("_"," ").toUpperCase()===label));
  genres.forEach(label=>add("genre",label,item=>(item.genres||[]).includes(label)));
  const aliases=getState().metadata?.comicsManga?.collectionAliases||{};
  return buckets.sort((a,b)=>b.items.length-a.items.length||a.label.localeCompare(b.label)).slice(0,16).map(group=>{const key=`__group__:${group.kind}:${group.label}`,display=aliases[key]||group.label,representative=group.items.find(item=>artFor(item))||group.items[0],fresh=group.items.reduce((sum,item)=>sum+newCount(item),0);return`<button class="comic-v2-collection-card" data-open-comic="${esc(key)}"><i>${compactCover(representative)}</i><span><b>${esc(display)}</b><small>${esc(group.kind.toUpperCase())} COLLECTION · ${group.items.length} SERIES</small><em>${fresh?`${fresh} NEW RELEASES`:"OPEN COLLECTION"}</em></span></button>`}).join("");
}

export function renderComicsV2Shelves(records = []) {
  const visible = records.filter(item => !metaFor(item).hidden);
  const identification=(getState().metadata?.readingDriveScan?.files||[]).filter(file=>file.status==="pending"&&(["CBZ","CBR","CB7","CBT"].includes(String(file.extension||"").toUpperCase())||file.kind==="comic"||file.aiKind==="comic"));
  const updates = visible.filter(item => newCount(item) > 0).sort((a, b) => newCount(b) - newCount(a));
  const continuing = visible.filter(item => (item.sourcePath || metaFor(item).sourcePath) && Number(metaFor(item).readerPercent || 0) > 0 && Number(metaFor(item).readerPercent || 0) < 100).sort((a, b) => Date.parse(metaFor(b).readerCheckpointAt || 0) - Date.parse(metaFor(a).readerCheckpointAt || 0));
  const reading = visible.filter(item => metaFor(item).readingStatus === "reading");
  const cooking = visible.filter(item => metaFor(item).readingStatus === "cooking");
  const owned = visible.filter(ownsAnything);
  const collections=virtualCollections(visible);
  return `<div class="comic-v2-operations">${identification.length?`<section class="panel comic-v2-identification"><div><span class="eyebrow">ONLY GENUINELY UNCERTAIN FILES STOP HERE</span><h2>NEEDS IDENTIFICATION</h2><p>${identification.length} local comic file${identification.length===1?"":"s"} could not be matched safely. Everything confident was imported automatically.</p></div><button class="button primary" data-reading-review>REVIEW ${identification.length}</button></section>`:""}${shelf("NEW UPDATES", "UNREAD UNTIL YOU MARK THEM READ", updates, "No unread releases are waiting.", "is-updates")}${shelf("CONTINUE READING", "EXACT LOCAL OR CONFIRMED PROGRESS", continuing, "Open a local comic in the Vault reader to establish exact progress.")}${shelf("ACTIVE READING", "CURRENTLY FOLLOWING", reading, "No series are marked Reading.")}${shelf("LETTING IT COOK", "UNREAD COUNTS KEEP GROWING", cooking, "No series are currently cooking.")}${shelf("OWNED", "PHYSICAL + LOCAL + KINDLE + OTHER DIGITAL", owned, "Owned releases will appear here.")}${collections?`<section class="panel comic-v2-shelf"><header><div><span class="eyebrow">VIRTUAL VIEWS · CANONICAL RECORDS STAY SINGLE</span><h2>SMART COLLECTIONS</h2></div></header><div class="comic-v2-shelf-track">${collections}</div></section>`:""}</div>`;
}

const structureLabels = Object.freeze({
  volumes_chapters: "MANGA · VOLUMES + CHAPTERS",
  issues_collections: "COMICS · ISSUES + COLLECTIONS",
  editions: "GRAPHIC NOVEL · EDITIONS",
  seasons_chapters: "WEBCOMIC · SEASONS + CHAPTERS",
  mixed: "MIXED RELEASE STRUCTURE"
});

export function renderComicV2SeriesPanels(item) {
  const meta = metaFor(item), ownership = ownershipFor(item), mode = meta.structure?.mode || structureForFormat(meta.format), authority = meta.metadataAuthority || {}, conflicts = authority.conflicts || [];
  const tabs=mode === "volumes_chapters" ? "<button class='active'>VOLUMES</button><button>CHAPTERS</button>" : mode === "issues_collections" ? "<button class='active'>ISSUES</button><button>COLLECTIONS</button><button>STORY ARCS</button>" : mode === "seasons_chapters" ? "<button class='active'>SEASONS</button><button>CHAPTERS</button>" : mode === "editions" ? "<button class='active'>EDITIONS</button>" : "<button class='active'>ALL RELEASES</button>";
  return `<section class="panel comic-v2-release-console"><header><div><span class="eyebrow">ADAPTIVE RELEASE NAVIGATOR</span><h3>${esc(structureLabels[mode] || structureLabels.mixed)}</h3></div><div class="comic-v2-series-tools"><button class="button" data-comic-edit-series="${esc(item.id)}">EDIT SERIES</button><label>STRUCTURE<select data-comic-structure="${esc(item.id)}">${Object.entries(structureLabels).map(([value, label]) => `<option value="${value}" ${value === mode ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label></div></header><div class="comic-v2-release-tabs">${tabs}</div></section><section class="panel comic-v2-ownership"><header><div><span class="eyebrow">OWNERSHIP LEDGER</span><h3>HOW YOU HAVE THIS SERIES</h3></div><span>${Object.values(ownership).filter(Boolean).length} ACTIVE</span></header><div>${COMIC_OWNERSHIP_TYPES.map(type => `<button class="${ownership[type] ? "active" : ""}" data-comic-ownership="${type}" data-comic-id="${esc(item.id)}" data-comic-value="${ownership[type] ? "false" : "true"}"><b>${type === "localDigital" ? "LOCAL FILE" : type === "otherDigital" ? "OTHER DIGITAL" : type.toUpperCase()}</b><small>${ownership[type] ? "OWNED ✓" : "NOT MARKED"}</small></button>`).join("")}</div><footer><span>METADATA AUTHORITY</span><b>${(authority.manualFields || []).length} MANUAL FIELDS · ${conflicts.length} CONFLICTS</b></footer></section>`;
}
