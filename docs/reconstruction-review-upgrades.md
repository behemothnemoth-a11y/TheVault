# Reconstruction Review Upgrades

Completed: August 1, 2026

This release implements the full-project review recommendations without changing the Vault schema or archive truth. The authoritative counts remain 3,543 records, 13,055 television episodes, and 11,941 linked episode files.

## Daily library experience

- Television opens as ten genre cards plus a paged shelf of at most 72 series.
- Series pages use durable routes such as `#/tv/tv_legacy_the_simpsons` and survive refresh.
- Individual episode controls retain rating, note, watched, and direct-play behavior.
- Movies show 24 legacy collection cards per page, preserve all 311 collection shelves, and use durable collection and record routes.
- Games and Books use 36-record pages with real status, category, and search filtering.
- Rating controls appear on focused record pages instead of thousands of list cards.
- Local bundled artwork is attached only when a matching record has no existing artwork.

## Navigation and operations

The primary interface has five sections: Home, Library, Discover, Activity, and Manage. Control Room is the single entrance for care, supervised automation, data enrichment, audit, and advanced maintenance. Hidden specialist routes remain directly addressable; they were not deleted.

On mobile, the five sections start closed, one menu opens at a time, global search remains visible, and menu panels stay inside the viewport even when the window is resized from desktop width.

## Security and recovery

- Dynamic note, title, discovery, health, and modal content is rendered as text or escaped markup.
- Modals trap focus, restore focus, close with Escape, and close from the backdrop.
- Archive import is limited to 100 MB, migrated, health-checked, and blocked when a normal restore would unexpectedly remove more than 20 percent of a substantial archive.
- Replacement is transactional: the live state changes only after the protected snapshot and primary write succeed.
- The launcher rejects traversal, paths outside the approved drive boundary, unsupported media, missing files, and files with false image extensions.
- Content Security Policy, no-sniff, and referrer headers are active.

## Persistence architecture

IndexedDB remains the durable engine, but the main state store is normalized into:

- `core_v2` for shared archive state
- `events_v2` for the event ledger
- one `item:<id>` entry per archive record

Ordinary edits record the affected IDs and persist only those records. Full-state writes are reserved for initialization, import, and restore. The permanent regression measured a fully persisted rating interaction at 48.8 ms; the release budget is under 200 ms.

## Release gates

The following isolated browser suites pass against `http://127.0.0.1:4173/`:

- `tests/reconstruction-regression.cjs`
- `tests/stage32-final-system-audit.cjs`
- `tests/stage36-living-vault.cjs`

The reconstruction suite verifies exact archive counts and health; five navigation groups; bounded Movie and TV DOM sizes; real filters; durable routes and refresh; item-level ratings; stored-markup neutralization; modal Escape behavior; normalized IndexedDB keys; fresh-mobile navigation; no overflow; and zero page, HTTP, or external-request errors.

Stage 32 re-verifies migration, corruption detection, protected restore, performance, accessibility, recovery, the intentional DVD-rip boundary, and final health. Stage 36 re-verifies Daily Driver, Enrichment, Steward, Autopilot safety, Living Museum, mobile routes, and exact archive counts.

## Recovery points

The pre-upgrade source archive is `backups/pre-review-recommendations-20260801-085116.zip` with SHA-256 `46A6D14493EF39EC1713F6D9C943668FF0560B8FC48D5D27506640AB4926DBFA`.

The post-upgrade archive and checksum are recorded in `backups/README.md` after the final release seal is created.

## Intentionally retained boundaries

- Unmapped DVD rips and loose video files are not an active repair queue.
- Direct episode playback requires `serve.ps1` to remain open.
- Automatic care runs only while the Vault page and local launcher are open.
- External exports still require manual download before Import Station can inspect them.
- Artwork stays local-first and never overwrites existing user artwork during bundled seeding.
