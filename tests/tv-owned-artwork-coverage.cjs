const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const recovery = JSON.parse(fs.readFileSync(path.join(root, "recovery", "vault-reconstruction-stage-0-repaired-2026-07-29.json"), "utf8").replace(/^\uFEFF/, ""));
const owned = Object.values(recovery.items).filter(item => item.wing === "tv" && item.owned && !item.id.startsWith("tv_drive_"));
const artFiles = new Set(fs.readdirSync(path.join(root, "assets", "artwork", "library")).map(name => path.parse(name).name));
const missingFiles = owned.filter(item => !artFiles.has(item.id));
assert.equal(owned.length, 142, "authoritative owned-series count changed");
assert.deepEqual(missingFiles.map(item => item.title), [], "every owned series needs a local visual");

const generatedArt = fs.readFileSync(path.join(root, "js", "systems", "generatedTvArtwork.js"), "utf8");
const bundledArt = fs.readFileSync(path.join(root, "js", "systems", "bundledArtwork.js"), "utf8");
assert.match(bundledArt, /generatedTvArtwork/);
const mapped = new Set([...generatedArt.matchAll(/"(tv_[a-z0-9_]+)"\s*:/g), ...bundledArt.matchAll(/\b(tv_[a-z0-9_]+)\s*:/g)].map(match => match[1]));
assert.deepEqual(owned.filter(item => !mapped.has(item.id)).map(item => item.title), [], "every owned series needs a manifest mapping");

const catalog = fs.readFileSync(path.join(root, "js", "systems", "generatedTvCatalog.js"), "utf8");
const catalogIds = new Set([...catalog.matchAll(/"?(tv_[a-z0-9_]+)"?\s*:/g)].map(match => match[1]));
assert.equal(catalogIds.size, 125, "validated TVMaze reference coverage changed");
const tv = fs.readFileSync(path.join(root, "js", "wings", "tv.js"), "utf8");
assert.match(tv, /REFERENCE TOTAL/);
assert.match(tv, /NOT CATALOGED/);
assert.match(tv, /Direct play is separate/);
assert.match(tv, /readiness\.enabled\?ownershipRecommendations/);
console.log("owned TV artwork and catalog coverage: passed");
