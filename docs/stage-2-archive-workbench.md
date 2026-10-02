# Stage 2 — Archive Workbench

Completed: 2026-07-29

## Outcome

Stage 2 makes the reconstructed archive maintainable without hand-editing JSON.

The new Workbench is a dedicated Vault page with:

- archive-wide metadata coverage;
- search across titles, years, genres, wings, and Vault IDs;
- filters for wing, status, and missing artwork, year, description, or genre;
- an 80-record working window to prevent the 3,543-item archive from becoming visually overwhelming;
- a reversible metadata editor;
- local poster intake;
- an explicitly selected, guarded review-batch desk;
- recent maintenance history with one-click undo.

## Schema 3

Schema 3 adds `metadata.stage2`:

- `startedAt`
- `workbenchEnabled`
- `changeLog`
- `reviewBatches`
- `lastMaintainedAt`

The migration preserves every unknown property and leaves stable item and episode IDs unchanged.

## Reversible editor

The editor can change:

- title
- year
- genres
- archive description
- personal field note
- ownership
- artwork

The immutable Vault ID is displayed but cannot be changed. Each effective edit records the changed fields with before and after values. Undo restores only those recorded fields and marks the change as undone rather than deleting history.

## Local artwork

The local launcher now accepts validated poster intake:

- JPG, PNG, and WebP only
- maximum decoded size of 8 MB
- valid stable item ID required
- unique timestamped filename
- files stored under `assets/artwork`
- no existing artwork file is overwritten

No external artwork provider is required. The archive remains usable offline.

## Controlled review batches

The Workbench exposes a smaller searchable view of the Stage 1 recovery queue. Records must be explicitly selected.

Compatible actions:

- original-versus-scanner conflicts: keep original paths
- scanner-only episodes: link new files
- unresolved file groups: defer
- any selected pending record: ignore

Incompatible selected records are skipped. Before a compatible batch runs, the Vault creates a protected `review_batch` snapshot.

## Verification

All browser testing used isolated Edge profiles with separate IndexedDB databases.

Stage 2 Workbench test:

- Workbench route rendered
- 80 catalog records rendered in the working window
- 3 filter controls rendered
- 30 pending review records rendered in the controlled window
- schema migrated to 3
- metadata edit persisted
- Vault ID remained unchanged
- change log entry recorded
- undo restored the original record
- a selected path conflict was resolved
- review batch history persisted
- a protected pre-batch snapshot was added
- 3,543 items and 13,055 episodes passed health inspection
- 11,941 episode paths remained linked
- health issues: 0

Stage 1 regression:

- Settings and snapshot controls rendered
- 10 TV genre sections and 593 series rows rendered
- The Simpsons rendered 203 linked episode cards and 203 episode editors
- episode editor opened
- the 894-entry review queue remained available
- persistence and snapshot restoration passed
- health issues: 0

Launcher checks:

- valid one-pixel PNG test poster saved successfully
- poster file existed and contained 68 bytes
- the test poster was moved out of the live artwork shelf after verification
- invalid episode paths and unauthorized episode-launch requests remain rejected

## Rollback

Stage 1 source snapshot:

- `backups/stage-1-durable-core-source-20260729-180349.zip`
- SHA-256 `FE6E11E9F7D36B6D7397249D5FA6E306E9C5FA503C77E5FEB02DAA231B562D8E`

Direct pre-Stage 2 files:

- `backups/pre-stage2-workbench/`
