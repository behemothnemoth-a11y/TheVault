# Stage 29 — Import and Relationship Major Checkpoint

Completed July 31, 2026.

## Stage 28 — Reversible real-data intake

The dedicated Import Station now supports local JSON, CSV, TSV, and calendar ICS exports for YouTube, music, podcasts, books, manga, food, trips, and calendar records.

Each scan:

- runs locally in the browser
- stores no raw export payload
- previews new records, preserved conflicts, collapsed repeats, and structural warnings
- uses stable source IDs and a strengthened file fingerprint
- keeps source occurrence dates as evidence instead of inventing reconstructed Vault activity
- creates a protected snapshot before commit
- records a batch manifest with exact record and relationship IDs
- rejects an already-active identical export
- supports protected batch rollback

Rollback removes all relationships whose source record is removed, including later manual links. Their protected change entries are closed as undone. Historical events keep the removed record ID as rollback evidence but no longer carry an invalid live pointer.

## Stage 29 — Cross-Vault Relationship Atlas

The Relationship Atlas connects archive records to:

- people and creators
- franchises and series
- places
- experiences
- genres
- collections

Genre and collection links are derived from the authoritative record and collection fields, so they remain current without bloating the save. Imported and manually filed relationships are first-class stable records with source, evidence, timestamp, and optional import-batch ownership.

Manual relationship changes create protected snapshots and a reversible change ledger. Imported relationships are rolled back with their owning batch.

## Health enforcement

Schema 29 rejects:

- unsafe import policy or raw-export retention
- malformed or duplicate import batches
- duplicate active file fingerprints
- applied batches whose records or relationships are missing
- relationship targets without an allowed entity type
- links whose source archive record is missing
- missing evidence, source, or timestamp
- relationship records tied to unknown import batches
- malformed or duplicate protected change entries

## Verification

The focused lifecycle acceptance passed with:

- all eight adapters producing valid previews
- JSON, CSV, TSV, and ICS parsing
- an actual Spotify-style file-selection preview
- four YouTube rows becoming two new records, one preserved conflict, and one collapsed repeat
- two evidence-backed imported creator links
- duplicate-export rejection
- a protected manual relationship and independent protected undo
- active manual-link cleanup during import rollback
- exact restoration of starting record and relationship counts
- healthy rollback audit events with no orphan references
- zero page and HTTP errors

All preserved regressions also passed under schema 29: Stages 27, 24, 19, 18, 17, 11, and the live Stage 10 Autopilot/repair suite.

The live safety drill retained 3,543 records, 13,055 TV episodes, and 11,941 linked episode files. It produced 304 review proposals, completed all four Autopilot steps, exercised one protected repair, and restored all episode links exactly.

## Next major checkpoint

Stage 30 adds the grounded Vault Oracle with citations to records and canonical events. Stage 31 extends supervised automation with dry runs, approval gates, confidence policies, rollback, and failure isolation.
