# Stage 0 — Baseline Audit and Recovery

Status: **Source baseline complete; live save audit awaiting exported JSON**

Date: July 29, 2026

## Scope

This audit covers the active Reconstruction project at `D:\Vault`. It does not modify or depend on the original Vault beyond the existing opt-in legacy importer.

## Active project inventory

- 35 active files
- 27 JavaScript modules
- 4 stylesheets
- 87,421 active source bytes
- 5 historical rollback directories retained unchanged
- 1 verified Stage 0 source archive

### Project surfaces

- `index.html` — main Vault shell
- `legacy-import.html` — isolated legacy intake console
- `css/` — base, layout, shared components, and TV presentation
- `data/` — sample records and declarative system definitions
- `js/core/` — IDs, events, migrations, routing, and storage
- `js/systems/` — achievements, discovery, Expeditions, observations, health, legacy import, drive scanning, and reconciliation
- `js/ui/` — navigation, notifications, modals, and command palette
- `js/wings/` — shared wing views and dedicated TV views
- `backups/` — rollback snapshots and verified baselines

## Verified source baseline

Archive:

`D:\Vault\backups\stage-0-source-baseline-20260729-162729.zip`

SHA-256:

`CC61447ABBA4DE1B619572FECDA8D3589757E955B19E3D7E47AEF37AE4E914B0`

Files captured: 35

The archive excludes the `backups` directory to prevent recursive backup growth.

## Architecture observed

### Save system

- Storage namespace: `vault_reconstruction_v1`
- Current schema version: 1
- Saves contain profile, items, events, achievements, preferences, Expeditions, and metadata.
- The migration framework supports ordered upgrades from version 0 to version 1.
- Mutations use cloned drafts and persist the complete save.
- Unknown top-level properties generally survive migration because migrations extend the incoming save.

### Identity

- A Vault ID validator exists.
- Imported records generate stable IDs from legacy keys.
- Episodes are nested under TV series and have stable episode IDs.
- Some drive-discovery records still use provisional `tv_drive_*` identities.

### Event system

- Canonical events use generated IDs and timestamps.
- The event log is capped at 25,000 entries.
- Systems may listen to individual event types or all events.

### TV and drive intelligence

- Drive scans require explicit folder permission.
- Uncertain discoveries enter a review queue.
- Accepted candidates can be reconciled with existing series.
- Punctuation and formatting normalization is supported.
- Material mismatches and ambiguous titles remain unresolved.
- Episode paths are matched by season and episode number.
- Higher-resolution copies outrank lower-resolution copies.
- MKV outranks MP4 when apparent resolution is equal.
- Lower-ranked copies are retained as alternate source paths.

## Static validation completed

- All active local JavaScript imports resolve.
- Main source surfaces are present.
- Rollback snapshots are present.
- Source archive creation and SHA-256 verification succeeded.
- No files outside `D:\Vault` were modified.

## Risks identified

### High priority

1. **The live browser save has not yet been audited.**
   Record, episode, event, rating, note, and ownership totals remain unverified until a user-exported Reconstruction JSON file is provided.

2. **Health validation is shallow.**
   The current checker validates top-level IDs and event references but does not inspect nested episode IDs, duplicate episode paths, alternate paths, impossible progress totals, malformed ratings, or review-queue integrity.

3. **Normal save import replaces state after insufficient validation.**
   The main import path should perform schema migration, deep validation, a dry run, and a pre-import backup before replacement.

4. **Two TV reconciliation implementations exist.**
   Reconciliation currently appears in both the dedicated catalog system and the TV renderer. This can cause repeated writes, inconsistent matching rules, and unclear ownership of the behavior.

### Medium priority

5. `app.js` contains compressed multi-responsibility logic covering routing, TV editing, scanning, review, imports, discovery, health, and rendering.

6. Dedicated TV screens are internal UI state rather than durable deep routes. Browser Back and Forward cannot reliably restore a specific series page.

7. Drive candidate acceptance may create provisional duplicate `tv_drive_*` records before reconciliation.

8. File opening currently uses browser `file:///` links. Browser security policies may block or inconsistently handle these links.

9. Storage quota failures are not surfaced clearly.

10. Several broad `catch` blocks suppress useful diagnostic detail.

### Low priority

11. Source modules use mixed formatting styles.

12. Rollback directories currently lack a manifest describing why each snapshot was made.

13. README launch instructions may not fully reflect the current PowerShell launcher.

## Stage 0 completion checklist

- [x] Inventory active project files
- [x] Identify rollback snapshots
- [x] Inspect source schema and storage architecture
- [x] Inspect ID, migration, event, import, and reconciliation systems
- [x] Validate local module references
- [x] Create verified source baseline
- [ ] Receive exported live Reconstruction save
- [ ] Count live entities by type and wing
- [ ] Inspect nested episodes and file references
- [ ] Detect duplicate IDs, paths, and provisional records
- [ ] Validate ratings, dates, progress, events, and collections
- [ ] Produce verified live-data health report
- [ ] Store a validated baseline data backup

## Current Stage 0 blocker

The browser-owned archive cannot be truthfully audited from source files alone. Export the active archive from **Settings → Export Archive** and provide the resulting JSON file. The audit will use counts and stable IDs by default and will not reproduce personal note text unnecessarily.

