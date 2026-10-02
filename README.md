# The Vault: Reconstruction

A local-first personal archive, museum, game, and time machine for entertainment history and real-world experiences.

## Life Dashboard — Product Cycle 1

The Vault now has a life-wide front door and a first purpose-built living-room experience:

- **Life Dashboard** connects all 11 interest domains in one useful view.
- **Tonight** offers five explainable, cross-interest choices plus a directly playable television rail.
- episode playback has an explicit return, completion, and individual-rating flow;
- local library awareness is manual and read-only, with intentional DVD rips treated as informational;
- artwork priorities, truthful personal memory, and portable device copies are visible without enabling cloud access;
- **Alt+L** opens Life Dashboard and **Alt+N** opens Tonight.

This begins a new product cycle without replacing the existing schema-42 archive or specialist tabs. See `docs/life-dashboard-cycle-1.md` for the eight active foundations, verification evidence, safety boundaries, and the plan for redesigning the other tabs.

### TV + Games checkpoint

- Television opens to the **142 owned series first**, then shows eight clearly labeled suggestions for series that may be worth owning.
- The original Vault's local browser export is recovered automatically and exactly: **568 watched episodes across 46 series**, including 33 written episode notes.
- The old five-diamond scale is preserved on 43 episodes as “needs rerating”; it is never silently converted into a ten-point score.
- TV artwork now covers **42 series**: 15 verified existing local covers and 27 exact TVmaze matches cached inside the Vault. Manual artwork is never overwritten.
- Games now separates **48 playable games** from **27 Minecraft workshop records** and **5 creative side quests**.
- Games begins with six titles known to be on the drive, offers context-aware session picks from owned titles, and labels unowned suggestions honestly.
- Games time and energy controls share the Life Dashboard preferences; quick Start, Finish, Favorite, search, shelf, and status controls update the existing durable game records.

See `docs/life-dashboard-tv-games-checkpoint.md` for provenance, classification boundaries, and acceptance evidence.

## Open The Vault

Double-click `Open The Vault.cmd`. It starts the local Python program and opens The Vault in a dedicated app window without browser tabs or an address bar:

`http://127.0.0.1:4173/`

The dashboard is still rendered with the project's HTML/CSS interface, while Python owns the local server, direct episode playback, validated poster intake, protected local tools, and background care. If the Vault is already running, the launcher simply reopens the app window instead of showing an error. Keep the small launcher window open; close it to close the Vault.

Advanced: run `py -3 vault_server.py --no-browser` to start without opening the interface, use `--browser-tab` for the old normal-tab behavior, or add `--port 4174` to use a different port. `serve.ps1` remains only as a legacy fallback.

## Phase III — The Personal Companion: Complete

Current schema: **42**

- 3,543 imported records
- 13,055 individually tracked TV episodes
- 11,941 episode source links
- card-based television shelves and dedicated series pages
- direct local episode playback
- Home and TV continue-watching shelves, favorites, recent series, next episode, genre/status filters, and persistent sorting
- a quieter collapsible sidebar that keeps specialist tools available without crowding daily browsing
- Archive Enrichment for posters and useful catalog fields, with reversible intentional blanks
- Vault Steward daily local care with no inventory, repair, artwork, media, or network permission
- Living Museum daily spotlight, pinned gallery, real progress/favorite/rating halls, canonical On This Day, genres, and collections
- intentional DVD-rip policy: missing links and untracked videos are not active cleanup work
- durable IndexedDB storage, migrations, exports, imports, and protected snapshots
- truthful Time Machine and evidence-backed Archive Voice
- Reconciliation Laboratory and protected Repair Bay with rollback
- local folder-level Artwork Curator
- five-mode explainable Discovery Engine
- 453 preserved and normalized first-class collections
- three functional, failure-free Expeditions
- meaningful XP, levels, titles, and achievement activation
- structured Ctrl+K archive commands
- evidence-backed custom Achievement Workshop
- cosmetic Unlock Vault with no core feature gating
- composable and saved advanced archive queries
- progress-sensitive per-show spoiler policy
- four genuinely different theme layout signatures
- evidence-based Personal Eras built only from canonical event timestamps
- On This Day, rating-year comparisons, and witnessed revisit reports
- deduplicated seasonal secrets and one-time collection-sealing ceremonies
- reversible local import pipelines for YouTube, music, podcasts, books, manga, food, trips, and calendar exports
- an evidence-carrying Relationship Atlas for people, franchises, places, experiences, genres, and collections
- a local Vault Oracle with visible record, episode, event, import, collection, and relationship citations
- a Supervision Deck with dry runs, 95% confidence gates, explicit approval, failure isolation, and protected rollback
- a permanent eight-part Final Audit room with migration, corruption, restore, performance, accessibility, recovery, DVD-boundary, and final-health proof
- secret Basement
- four behavioral environments and spoiler clearance
- YouTube, Music, Podcasts, Manga, Food, Trips, Calendar, and Statistics rooms
- observable maintenance and daily Safe Autopilot

## Reconstruction review upgrade

The August 1, 2026 review upgrade keeps schema 36 and the imported archive intact while replacing the daily-use shell around it:

- Movies, Books, and TV use bounded card pages; Games now has its own owned-first playable library and separate Minecraft Workshop.
- Movies preserve all 311 legacy collection shelves and expose durable collection and item URLs.
- TV preserves genre shelves, adds a ten-genre overview and 72-series paging, and gives every series a durable page.
- Episode pages retain individual ratings, notes, watched state, and direct launcher-backed playback.
- The primary sidebar is reduced to five sections; specialist automation and maintenance tools remain available through Control Room.
- IndexedDB stores core state, events, and records separately so ordinary edits persist only the affected records.
- Imported archives are health-checked, size-limited, and protected against accidental large record loss.
- Dynamic archive text is escaped, modal keyboard behavior is complete, and all visible controls are named.
- Eight bundled local posters seed the artwork shelf without overwriting user artwork.
- The local launcher validates paths, image signatures, content policy, and file boundaries.

See `docs/reconstruction-review-upgrades.md` for acceptance budgets, routes, verification evidence, and recovery points.

## Phase III — Stages 37–42: From archive to supervised companion

The Vault now turns its local archive into a small, transparent daily plan:

- six stable choices spanning Movies, TV, Games, and Books
- Balanced, Continue, Discovery, and Comfort modes
- visible reasons and score factors for every selection
- Keep, Later, Hide, and Restore feedback that persists locally
- exposure penalties and per-wing caps that prevent repetitive shelves
- direct durable routes into series and record pages
- no web ranking, inferred popularity, automatic completion, or media mutation
- a cold-start strategy that remains useful before extensive ratings exist

Today's picks are visible on Home and have a dedicated `#/today` room. Phase III then completes the loop:

- Stage 38 adds explicit pairwise Taste Calibration. Skip and Neither remain neutral, answers are reversible, and passive behavior never becomes a negative preference.
- Stage 39 adds a Session Planner for 30, 60, 90, 120, or 180 minutes, three energy levels, and five focus modes. Finishing a session never completes its media.
- Stage 40 adds `#/record/<vault-id>`, one durable record page for ratings, favorites, status, collections, relationships, evidence, Daily Desk appearances, sessions, and TV episode access.
- Stage 41 appears as Background Care. It runs only while the Vault is open, performs five bounded checks, may refresh stale Today picks, and keeps a visible local history.
- Stage 42 appears as the Vault Assistant. It can prepare a session draft, an optional taste round, or a different mood for Today, but each action waits for a visible choice from you.

See `docs/stage-37-daily-desk.md` for the original curation model and `docs/phase-iii-stage-37-42-personal-companion.md` for the complete Phase III architecture, authority model, failure rules, and acceptance evidence.

## Hard safety rules

- Autopilot never applies repairs.
- Autopilot never attaches artwork.
- Autopilot never changes media files.
- The Sentinel reads only `D:\TV Shows`.
- Repairs and artwork changes create protected snapshots first.
- Every repair and artwork change has rollback history.
- Archive Voice claims require visible evidence.
- Reports never invent dates for imported history.
- Empty wings remain honestly empty until real data is imported.
- Import scans preserve conflicts and never retain the raw export payload.
- Every committed real-data batch creates a protected snapshot and remains rollback-capable.
- Explicit relationship links require source evidence.
- Oracle answers never use external inference and refuse questions the local evidence cannot prove.
- Every supervised execution requires an approved dry run.
- Supervised metadata changes create protected snapshots and conflict-aware rollback journals.
- Supervision never gains permission to repair links, attach artwork, or change media files.
- Final Audit restore drills use protected snapshots and a temporary metadata marker; archive content and media remain unchanged.
- The interface uses no external font or stylesheet dependency.
- Operations, Autopilot, and Final Audit skip intentional DVD-rip inventory under the schema-33 policy.
- Living Museum exhibits require local evidence and never invent dates or reward attendance streaks.
- Daily Desk choices require local evidence, keep their score factors visible, and never complete or modify archive records.
- Daily Desk feedback is reversible; Hide affects only future Desk plans and never deletes a record.
- Taste Calibration records only explicit button presses; Skip and Neither create no negative signal.
- Session completion is intentionally separate from record or episode completion.
- Universal Record edits remain explicit user actions.
- Background Care runs only while the page is open, exposes every check, and has no network, drive-scan, media, or silent-metadata authority.
- Vault Assistant is preview-first and suggest-only; ratings, completion, hiding, metadata changes, deletion, network access, and media changes are forbidden.
- Dismissed Vault Assistant actions remain dismissed and cannot be silently retried.

## Safe Autopilot

At most once every 24 hours while the local Vault is open:

1. archive health gate
2. protected snapshot
3. intentional DVD-rip boundary check with no inventory scan
4. final health gate

Vault Steward separately prepares a quiet local brief covering health, enrichment, current-day activity, and recovery status. It has no permission to scan media or mutate archive records.

## Useful commands

Press Ctrl+K and try:

- `random horror`
- `show unfinished horror before 1990`
- `oldest movie`
- `health`
- `basement`

## Recovery

- Protected snapshots are retained indefinitely.
- Automatic daily snapshots retain the latest 30.
- Restore creates a protected pre-restore snapshot.
- The prior localStorage save remains available as a migration rollback.
- Verified source recovery points and SHA-256 hashes are recorded in `backups/README.md`.

## Project map

- `assets/artwork/` — offline poster shelf
- `data/` — definitions and recovery data
- `js/core/` — IDs, events, routing, migrations, persistence, snapshots
- `js/systems/` — archive, game, maintenance, discovery, voice, and Autopilot systems
- `js/wings/` — media-room views
- `recovery/` — verified Stage 0 repaired import
- `backups/` — protected source and development recovery points
- `docs/` — Stage 0–42 audits, guides, and major checkpoints
- `tests/` — isolated browser acceptance suites

The original 32-stage reconstruction roadmap, Phase II, and Phase III are complete and sealed through schema 42. See `docs/stage-18-32-roadmap.md`, `docs/stage-32-complete-system-final-audit.md`, `docs/phase-ii-stage-33-36-living-vault.md`, `docs/stage-37-daily-desk.md`, and `docs/phase-iii-stage-37-42-personal-companion.md`.

## Desktop atomic-console Home

The Vault now opens into a dedicated desktop control console built around Tonight, owned Continue Watching choices, cross-interest recommendations, Today controls, and live archive status. Its original atomic-age bunker design replaces the generic Home grid while preserving the normal shell in every other room. Time and energy choices are shared with the Life Dashboard, playable episodes open through the existing local launcher, artwork stays local, and archive schema 42 remains unchanged.

Mobile work is intentionally paused. Home targets desktop app-window use with a minimum width of 1180 pixels. See `docs/desktop-home-atomic-console.md` for the functional contract, visual baseline, safety boundaries, and acceptance evidence.

## Games Operations Archive v2

Games now uses schema 43 and the permanent Home, Library, Timeline, Stats, and Future Games structure. The Build Ready Studio Handoff is registered in the project through `docs/games-v2-build.md`. Relationship and play status are separate; Play Next supports Quick Pick, Shortlist, and Guided Picker; Library includes Grid/List, filters, saved searches, Smart Shelves, and Manual Shelves; adaptive Game Detail preserves playthroughs, sessions, milestones, versions, add-ons, memories, franchises, and opinions. Recorded and Vault-tracked time remain separate, and meaningful history begins forward from the migration. Steam, Epic, and Minecraft discovery is manual and review-only with explicit link confirmation. Manual metadata wins and all verified artwork remains approval-gated. Acceptance evidence is in `tests/games-v2-regression.cjs`, `tests/games-v2-visual-audit.cjs`, and `tests/games-handoff-acceptance.cjs`.
