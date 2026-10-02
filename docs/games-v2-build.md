# Games Operations Archive — Completed Handoff

Games is a desktop-first Vault wing with five permanent destinations: Home, Library, Timeline, Stats, and Future Games. It is the Hybrid Operations Archive approved by the Games Build Ready Studio Handoff: an active command center, artwork-forward collection library, and progressively deep personal gaming museum inside the established Vault shell.

## Record model

Relationship and play status are deliberately separate. Relationship is Owned, Previously Owned, Played but Not Owned, Wishlist, or Upcoming. Play status is Unplayed, Backlog, Playing, Paused, Beaten, Completed, or Dropped. Beaten means the main ending was reached; Completed is reserved for the user's own completion standard.

Favorite is binary and rating is an explicit integer from 1–10. The Play Next pool is opt-in and unordered. Returning to a Beaten, Completed, or Dropped game requires an explicit classification such as a new playthrough, postgame cleanup, or DLC/expansion.

## Time and history

Recorded playtime and Vault-tracked playtime remain separate. Recorded time can come from a trusted platform total or manual entry. Vault sessions preserve their exact elapsed seconds. Only meaningful forward events enter the Timeline; migration/reference facts are not presented as dated personal history.

## Library and Play Next

Library defaults to an artwork-forward Grid and also supports List view, relationship/status/genre/favorite filters, saved searches, Smart Shelves, and Manual Shelves. Manual shelf membership is edited from full Game Detail.

Play Next supports Quick Pick, a reasoned 3–5 game Shortlist, and Guided Picker. Its default scope is the explicit Backlog, with optional Owned, Unfinished, Replay, and DLC/Expansion pools. Guided mood/context input exists only inside the open picker and is not persisted.

## Adaptive detail and history

Game Detail changes its emphasis label for Playing, finished, and overview-oriented records. Frequent relationship, status, playtime, session, favorite, rating, backlog, and pause-suggestion controls remain inline. Dedicated Edit Game handles structural metadata and personal notes. Optional Quick View remains separate.

Progressive depth includes playthroughs, optional sessions, milestones/achievements, versions/releases, DLC/expansions/mods, memories/media, franchise filing, personal notes, and dated opinion history. Meaningful history can be corrected, backdated, marked exact/month/year/unknown, or removed when it was entered incorrectly. Reference-only history remains excluded from the live Timeline and Stats.

Inactivity can suggest Paused after a configurable 30-day default. Suggestions can be disabled globally or per game and thresholds can be overridden per game. The Vault never changes Playing to Paused automatically.

## Imports

Steam manifests, Epic launcher manifests, and Minecraft launcher profiles are discovered only when the user presses Scan Local Launchers. Discovery is read-only. Candidates enter Import Review and are never automatically added. Possible title matches offer Review Link and Add Separate; linking requires a second explicit confirmation and adds provenance without overwriting manual fields. Ignoring a candidate does not affect the launcher or installed files. Source disappearance never removes the Vault record or its history.

## Metadata and artwork

Metadata refresh verifies the exact game/edition and records its source. Bulk refresh remembers a title/year fingerprint and skips unchanged games. A manual per-game refresh can force a new check. Manual fields have authority; conflicting imported values are retained for visible review while the manual value remains unchanged. Official artwork is cached locally when a direct image can be verified, but it always enters the shared Artwork Review queue. Missing or blocked artwork leaves the existing card unchanged; generated or approximate substitutes are forbidden.

## Safety contract

- No startup launcher scans.
- No automatic import or status inference.
- No deletion of source history when a launcher is disconnected.
- No silent artwork replacement.
- No invented dates for pre-Vault history.
- No blind merges when identity is uncertain.
- No automatic Paused status; inactivity creates visible, user-controlled suggestions only.

## Verification

`tests/games-v2-regression.cjs` covers the foundation. `tests/games-v2-visual-audit.cjs` renders all five destinations at realistic library sizes and enforces the 12px readability floor and no-horizontal-overflow requirement. `tests/games-handoff-acceptance.cjs` covers the approved handoff behaviors: relationship history, pause suggestions, depth entities, opinions, List mode, searches, shelves, explicit import linking, return classifications, Play Next modes/scopes, adaptive detail, Timeline, and Stats.
