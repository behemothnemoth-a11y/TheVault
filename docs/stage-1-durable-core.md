# Stage 1 — Durable Archive Core

Completed: 2026-07-29

## Outcome

Stage 1 moved The Vault from a browser-local prototype to a durable, recoverable archive core while retaining the verified Stage 0 reconstruction.

The active archive now contains:

- 3,543 items
- 13,055 TV episode records
- 11,941 linked episode files
- 894 controlled review entries
- schema version 2

## Durable storage

IndexedDB database `vault_reconstruction_archive` is now the primary store. On first Stage 1 use, an existing `vault_reconstruction_v1` localStorage save is migrated into IndexedDB.

Migration safety:

- the localStorage source remains untouched as a rollback copy;
- a protected migration snapshot is created before IndexedDB becomes primary;
- all normal writes are serialized through one persistence queue;
- storage errors are recorded for display instead of silently replacing the archive.

## Snapshot policy

The in-app snapshot system supports daily, migration, import, restore, manual, and milestone snapshots.

- Protected snapshots are retained indefinitely.
- The latest 30 automatic daily snapshots are retained.
- A restore creates a protected pre-restore snapshot before replacing the live state.
- Imports create a protected snapshot before replacement.

Settings / Data exposes milestone creation and the snapshot manager.

## TV recovery review

The Stage 1 queue contains 894 entries:

- 194 original-versus-scanner path conflicts
- 460 scanner-only episode links
- 240 unresolved file groups representing 3,662 files

The queue is split into compact drawers and renders at most 40 records from a category at once. Decisions persist in the archive. Safe actions include retaining the original path, using the scanner path, linking a new scanner path, ignoring an entry, or deferring a file group.

No queue entry changes the archive until the user chooses an action.

## TV interaction model

The TV wing retains the original Vault's browse-first character:

- series are grouped into genre cards;
- each series opens on a dedicated page;
- seasons contain individual episode cards;
- a linked episode launches its confirmed media file;
- the adjacent editor stores watched status, a 1–10 rating, notes, and rewatch count.

The local PowerShell launcher accepts only same-origin-style Vault POST requests, validates that the target is an existing video file on drive `D:`, and then asks Windows to open it in the default player.

## Verification

Testing used isolated Edge profiles, not the user's live Vault browser storage.

Verified results:

- application booted into IndexedDB with schema 2;
- 3,543 items and 13,055 episode records loaded;
- 11,941 episodes retained linked source paths;
- Settings / Data rendered the storage and recovery controls;
- TV rendered 10 genre groups and 593 series rows;
- a linked Simpsons series page rendered 203 playable episode links and 203 episode editors;
- the episode editor opened successfully;
- all three review categories rendered with 894 pending decisions;
- a review decision and a harmless profile mutation persisted to IndexedDB;
- snapshot restoration returned both changes to their prior state;
- the archive health check inspected all 3,543 items and 13,055 episodes with zero issues;
- the launcher rejected a nonexistent file with status 400;
- the launcher rejected an unauthorized request with status 403.

Opening a real episode was deliberately not automated during verification to avoid unexpectedly launching media while the user was away.

## Rollback sources

- `backups/pre-stage1-durable-storage/`
- `backups/pre-stage1-review-queue/`
- `backups/pre-stage1-episode-launcher/`
- `backups/pre-stage1-documentation-README.md`
- Stage 0 repaired JSON and source snapshots listed in `backups/README.md`
