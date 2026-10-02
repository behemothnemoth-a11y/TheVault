# The Vault — Known Limits at the Stage 32 Seal

These limits are explicit product boundaries, not hidden failures.

## Local runtime

- Automatic maintenance runs only while `Open The Vault.cmd` and the Vault page are open.
- Direct episode launching requires the local launcher because normal browser security blocks direct file execution.
- The permanent archive lives in browser IndexedDB. Recovery therefore depends on protected snapshots, JSON exports, and source seals rather than a separate database server.

## Library observation

- Sentinel is intentionally restricted to `D:\TV Shows`.
- Sentinel and Final Audit only read media files. They do not rename, move, delete, or rewrite them.
- The schema-32 final scan recorded 18 missing linked paths and 3,919 untracked files. The user has identified these as intentional DVD-rip material; schema 33+ excludes them from active repair, inventory, and cleanup work.
- A file-name match becomes a likely move only when it is unambiguous.

## Oracle

- Vault Oracle supports bounded local questions over structured records and canonical history.
- It is not a general conversational model, prediction engine, or web search tool.
- Large answers calculate over the complete result but display at most 60 source citations.
- Imported dates are not treated as witnessed personal history unless a canonical Vault event supports the claim.

## Imports and metadata

- Exports from YouTube, music, podcasts, books, manga, food, trips, and calendars must be downloaded manually first.
- Import Station retains normalized evidence and manifests, not the raw export payload.
- Third-party export formats can change; unsupported columns remain a preview error rather than being guessed.
- Online posters and metadata are not fetched automatically. Artwork stays local-first and approval-gated.

## Automation safety

- Safe Autopilot never applies repair proposals, attaches artwork, or changes media files.
- Supervised Automation still requires a dry run and explicit approval.
- A failed or attention-level supervised step blocks later mutation steps.
- The Stage 32 audit can write only its own ledger, a temporary restore marker, snapshots, Sentinel reports, and reconciliation proposals. The restore marker is removed by the restore drill.

## Scope of the final seal

- The seal proves the current local code, current archive shape, current D-drive scan, and documented recovery package.
- It does not guarantee that future operating-system, browser, or third-party export changes will require no migration.
- Future features should advance the schema, preserve the schema 32 recovery point, and extend rather than weaken these safety rules.
