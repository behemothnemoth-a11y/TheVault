# Life Dashboard — TV + Games checkpoint

## Television

The TV wing is now collection-first and evidence-first. Its default scope is owned series, currently 142 records backed by local file evidence. Discovery follows in a separate “worth owning” rail and contains only unowned records.

Original Vault watch history is imported from the sanitized local bundle at `recovery/vault-v1-tv-history-2026-08-13.json`. The importer verifies the bundle hash, uses exact show/season/episode matches, applies only positive watched signals, never unchecks newer activity, and is idempotent.

Verified result:

- 568 requested and 568 exact episode matches
- 46 affected series
- 0 missing shows and 0 missing episodes
- 33 written episode notes restored
- 43 legacy five-diamond ratings preserved for explicit rerating
- approximate completion dates clearly marked because the original data did not contain per-episode timestamps

## Games

The original Games records mixed different kinds of work. The dedicated Games wing now classifies by preserved legacy collection membership, without inventing platforms or genres:

- 48 actual playable games
- 6 known on-drive games
- 27 Minecraft build, mod-readiness, and research records
- 5 creative making projects

Owned games power “What Fits Now.” “Worth Adding Next” excludes owned records and uses only the user's preserved curated shelves plus explicit Life Dashboard time, energy, status, favorite, and rating signals. Minecraft records remain accessible in Workshop and creative records remain accessible as Side Quests.

## TV artwork

Artwork coverage now reaches 42 series. The first 15 posters come from verified local cover files already on the machine. The next 27 use exact title-and-year matches from TVmaze, prioritizing owned shows with the most locally linked episodes.

Every TVmaze image is cached under `assets/artwork/library/`, optimized to a maximum 700 × 1050 card-friendly size, and displayed only from the local Python server. Each record retains its TVmaze show ID, source page, and original image URL as provenance. The import is fill-only and idempotent: existing or manually selected artwork is never replaced.

## Application window

`Open The Vault.cmd` starts the Python launcher. Python serves the local interface and opens Edge or Chrome in dedicated app mode, so the Vault has its own window without normal browser tabs or an address bar. `--browser-tab` remains available only as an optional legacy behavior.

## Acceptance evidence

- `tests/tv-ownership-history.cjs`
- `tests/games-first-pass.cjs`
- `tests/tv-artwork-first-batch.cjs`
- `tests/tv-artwork-tvmaze-batch.cjs`
- `tests/stage43-ui-qol.cjs`

All three pass with no page errors, failed local requests, external network requests, or desktop/mobile horizontal overflow.
