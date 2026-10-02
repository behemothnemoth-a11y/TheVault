# Stage 0 Recovery Reconciliation

Generated: 2026-07-29

## Sources

- Live reconstruction export: `backups/data/stage-0-live-baseline-20260729-213508.json`
- Original Vault: `D:\TV Shows\The Vault.html`
- Current TV library: `D:\TV Shows`
- Filename dry run: `recovery/stage-0-recovery-dry-run-v5.json`
- Legacy path recovery: `recovery/stage-0-legacy-path-recovery.json`

No source data or media files were changed during this recovery pass.

## Authoritative recovery result

The original Vault contains an embedded `PATHS` object with exact episode-to-file assignments.

| Check | Result |
|---|---:|
| Series in legacy path map | 142 |
| Episode path mappings | 11,941 |
| Existing files at mapped paths | 11,941 |
| Links matching existing reconstruction episode records | 11,916 |
| Missing files | 0 |
| Missing or ambiguous series | 0 |
| Mappings needing a restored episode record | 25 |
| Paths outside `D:\TV Shows` | 0 |

The 25 missing episode records are all additional episode numbers in combined files such as `S04E01+E02`. The original Vault mapped the same file to both records.

## Filename scan comparison

| Comparison | Count |
|---|---:|
| Episodes present in both sources | 11,024 |
| Same selected file | 10,830 |
| Different selected file | 194 |
| Legacy-only valid links | 892 |
| Scanner-only proposed links | 460 |

The 194 disagreements are not assumed to be duplicate copies. Many are semantic conflicts such as `S02E13a` versus `S02E13b`, specials with decimal suffixes, or files from a related series sharing a season and episode number. The legacy map remains authoritative and these scanner choices stay in review.

## Approved matching rules

- Punctuation and leading-article differences may match automatically.
- Substantive title mismatches remain in review.
- Explicit reviewed aliases are allowed.
- Multi-episode files may link to multiple episode records.
- Explicit season folders may supply a missing season number.
- A uniquely matched single-season catalog may supply the season when the filename contains a valid episode number.
- Extras, specials, bonus features, and movies remain review-only by default.
- Alternate copies remain hidden unless the primary file fails.
- Genuine duplicate copies rank by explicit resolution, then MKV, then MP4.

## Approved aliases

- `Hunter x Hunter` -> `Hunter x Hunter (2011)`
- `Shingeki no Kyojin` -> `Attack on Titan`
- `Star Wars Andor` -> `Andor`
- `Tex Avery - Complete MGM Collection` -> `Tex Avery MGM shorts`

`Stargate SG-1` remains review-only because the reconstruction catalog combines multiple Stargate series. `Picard` is a proposed new catalog series because no dedicated reconstruction record exists.

## Safe merge policy

1. Use the original Vault path when it exists and maps to a known episode.
2. Restore the 25 missing second-half episode records only after approval.
3. Keep the 194 semantic disagreements in review.
4. Keep the 460 scanner-only episode proposals in review.
5. Do not copy legacy hover descriptions into personal notes.
6. Produce a new import file; never overwrite the verified baseline export.
