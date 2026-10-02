# Stage 0 — Live Data Audit

Status: **Complete**

Source filename: `vault-reconstruction-2026-07-29.json`

Archived baseline: `D:\Vault\backups\data\stage-0-live-baseline-20260729-213508.json`

SHA-256: `167B1D5F3EDA52636348634AC0ED4C818E8741E9CAB55D514FC1CAB44F4B4290`

Size: 6,483,866 bytes. The archived copy was verified byte-for-byte against the export.

## Save manifest

- Schema version: 1
- Created: `2026-07-29T20:52:35.836Z`
- Updated: `2026-07-29T21:35:08.278Z`
- Top-level records: 3,543
- Nested TV episodes: 13,030
- Collections: 450
- Events: 18
- Achievements unlocked: 0
- Expeditions stored: 0
- Legacy imports recorded: 1

## Records by wing

| Wing | Records |
|---|---:|
| Movies | 2,560 |
| TV | 593 |
| YouTube | 113 |
| Games | 80 |
| Music | 63 |
| Podcasts | 42 |
| Books | 40 |
| Trips | 24 |
| Food | 18 |
| Manga | 10 |

## History and ownership

- Items marked owned: 76
- Items marked completed: 0
- Episodes marked completed: 0
- Items in backlog: 3,543
- Episodes in backlog: 13,030
- Ratings present: 1
- Notes present: 2,950
- Primary episode file paths: 0
- Alternate episode file paths: 0
- Drive-review candidates: 0

## Integrity findings

- Duplicate embedded item IDs: 0
- Item key/ID mismatches: 0
- Duplicate episode IDs: 0
- Episodes missing IDs: 0
- Duplicate primary paths: 0
- Orphan events: 0
- Ratings outside 1–10: 0
- Impossible progress totals: 0
- Provisional `tv_drive_*` records: 0

## Interpretation

### Catalog import succeeded

The expected legacy catalog and stable item/episode identities are present.

### Historical progress was not recovered

Every item and episode is currently backlog. The import included the legacy HTML catalog but not a legacy `vault.v1` progress export. Watched state, dates, rewatches, ratings, and the original viewing timeline are therefore mostly absent. This is missing source data, not structural corruption.

### Episode files were not reconciled

There are zero episode paths. This directly explains every **NO FILE** label. Ownership markers and physical files on `D:\TV Shows` have not yet been reconciled into episode file records.

### Notes have mixed provenance

The save contains 2,950 notes despite one rating and no recovered completion state. Many legacy hover descriptions were likely placed into the personal `note` field.

Stage 0 does not modify them. A later dry-run repair should distinguish descriptions from personal notes, preserve original values, and record provenance.

## Conclusion

The live save is structurally healthy but historically incomplete.

Main risks:

1. No legacy progress history
2. No episode file paths
3. Mixed note provenance
4. Shallow in-app health validation
5. Duplicate TV reconciliation implementations

No repair or migration was performed during Stage 0.
