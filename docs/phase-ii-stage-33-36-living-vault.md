# Phase II — The Living Vault

Status: complete through schema 36  
Completed: 2026-08-01

Phase II turns the finished reconstruction into a calmer everyday archive. It does not reopen the schema-32 recovery work. It adds a daily-use layer, optional enrichment, safe local care, and evidence-backed museum galleries.

## User decision: DVD rips

Loose, unmapped, and partially linked video inventory is intentional DVD-rip material.

From schema 33 onward:

- missing episode links are not an active repair target;
- untracked video files are not an active cleanup target;
- TV cards use `DETAILS`, not `NO FILE`, for catalog-only episodes;
- Final Audit validates this policy without scanning the drive;
- Operations and Safe Autopilot skip the Sentinel inventory job under this policy;
- mapped episodes still open directly through `serve.ps1`;
- no feature renames, moves, deletes, rewrites, or organizes media files.

The schema-32 inventory evidence remains preserved in the final seal for historical recovery, but it no longer creates daily work.

## Checkpoint 33 — Daily Driver Polish

Route: `#/tv` and the Home atrium  
Schema: 33

Completed:

- quieter collapsible navigation drawers;
- Home continue-watching shelf;
- TV daily shelf for favorites, in-progress series, and recently opened series;
- persistent TV scope, genre, and sort preferences;
- favorites on TV shelves and series pages;
- recently opened series history;
- successful direct-play history without changing watched state automatically;
- clear next-episode panel and one-click `MARK WATCHED` action;
- optional episode-title editing;
- genre card layout retained;
- direct episode playback retained;
- catalog-only episodes open their editor without being labeled as broken;
- optional drive intake moved below the main shelves.

## Checkpoint 34 — Archive Enrichment

Route: `#/enrichment`  
Schema: 34

Completed:

- archive-wide coverage analysis for title, poster, year, genres, description, and TV episode titles;
- posters receive the highest priority;
- filter by wing and missing field;
- direct handoff to the existing protected Workbench and Artwork Curator;
- direct handoff to TV episode pages;
- reversible `intentional blank` decisions;
- durable enrichment change ledger;
- no external guessing or online metadata fetch;
- personal notes and ratings remain optional.

## Checkpoint 35 — Operational Automation

Route: `#/steward`  
Schema: 35

Completed:

- local Vault Steward enabled by default;
- once-daily care while the Vault page is open;
- selectable 12-hour, daily, three-day, or weekly cadence;
- manual `RUN CARE NOW` action;
- archive health summary;
- enrichment summary;
- current-day canonical activity summary;
- storage and snapshot summary;
- durable care ledger;
- closing the Vault pauses all scheduling;
- no separate background service.

Hard limits enforced by schema and health checks:

- no DVD-rip inventory;
- no link repair;
- no artwork mutation;
- no media-file mutation;
- no network use.

## Checkpoint 36 — Living Museum

Route: `#/museum`  
Schema: 36

Completed:

- stable daily spotlight selected deterministically from the local archive;
- spotlight evidence stored with the exhibit;
- reversible pinned gallery;
- Archive Highlights fallback so the museum is populated before favorites exist;
- Continue the Story gallery from real TV progress;
- Favorite Records gallery from explicit favorite flags;
- Masterworks gallery from user ratings of 9 or 10;
- On This Day gallery only from canonical events witnessed in a prior year;
- largest genre halls from current catalog counts;
- preserved collection wings from first-class collections;
- no invented dates, external ranking, attendance streak, or check-in reward.

## Permanent Final Audit extension

The permanent Final Audit now covers:

- 12 historical migration boundaries through schema 36;
- seven isolated corruption probes, including the DVD boundary, Steward permissions, and Museum date policy;
- exact protected restore;
- performance and export round trips;
- accessibility and offline dependencies;
- recovery assets and snapshots;
- intentional DVD policy without a media scan;
- final schema-36 health.

## Acceptance evidence

The schema-36 browser acceptance suite verified:

- 3,543 records;
- 13,055 TV episodes;
- 11,941 direct episode links;
- exact counts before and after every interaction;
- schema-32 to schema-36 migration policy;
- TV cards, filters, favorites, series pages, episode editor, and direct-play anchors;
- reversible enrichment exclusion;
- safe Steward brief and ledger;
- daily Museum exhibit and reversible pin;
- 390-pixel mobile width with no horizontal overflow across Home, TV, Enrichment, Steward, and Museum;
- zero unnamed controls;
- zero page errors;
- zero HTTP errors;
- zero external network requests;
- zero health issues.

The following regression suites also passed under schema 36:

- Stage 31 Oracle and Supervision;
- Stage 29 Import Station and Relationship Atlas;
- Stage 27 temporal history;
- Stage 24 themes, commands, spoilers, and game systems;
- Stage 19 Expedition Builder;
- Stage 18 Collection Editor;
- Stage 17 Reconstruction Alpha;
- Stage 11 Archive Voice;
- permanent eight-part Final Audit.

The Stage 10 live inventory/repair regression was intentionally not rerun because DVD-rip reconciliation is no longer an active product target.

## Recovery

The schema-32 complete-system seal remains the historical baseline. Phase II also has a development rollback copy at:

`D:\Vault\backups\development-rollback\phase-ii-start-schema32`

A complete schema-36 source seal is recorded in `backups/README.md` after final acceptance.