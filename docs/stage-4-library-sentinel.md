# Stage 4 — Library Sentinel

Completed: 2026-07-29

## Outcome

Stage 4 introduces the first self-running Vault maintenance system. The Sentinel inventories the TV library, compares it to canonical episode links, and records drift without changing the archive or media.

## Restricted inventory

The local launcher exposes `POST /__vault/inventory`.

Requirements:

- request header `X-Vault-Request: scan-tv-library`
- fixed root `D:\TV Shows`
- recognized video extensions only

The endpoint returns absolute path, filename, byte size, and last-write time for each recognized video. It performs no writes to the TV library.

Unauthorized requests return 403.

## Comparison model

The browser compares the inventory with unique normalized episode paths.

Report categories:

- linked paths present
- linked paths missing
- inventory files not tracked by an episode path
- one path owned by multiple episode records
- likely moves where one missing path and one untracked path share the exact filename

The report stores counts and bounded representative samples. It does not silently relink anything.

## Automatic schedule

The Sentinel waits 60 seconds after the Vault loads. If automatic scanning is enabled and the prior successful scan is at least 24 hours old, it runs one read-only inventory.

Only the latest 90 compact report summaries are retained in the archive.

## Verified live inventory

Scan root: `D:\TV Shows`

- scan duration: approximately 1.1 seconds
- recognized video files: 15,464
- files outside the allowed root: 0
- distinct linked paths: 11,563
- linked paths present: 11,545
- missing linked episode records: 18
- untracked video files: 3,919
- duplicate path-owner groups: 372
- exact-filename likely moves: 0

Five existing RMVB episodes were initially excluded by the allowlist. RMVB support was added to both the launcher and browser directory scanner. The corrected report reduced missing warnings from 23 to 18.

All 18 genuine missing paths belong to Peaky Blinders seasons 1–3. A separate recursive search found no Peaky Blinders media elsewhere under `D:\TV Shows`.

## Safety verification

- unauthorized inventory request rejected with 403
- all 15,464 inventory paths remained inside `D:\TV Shows`
- all 11,941 episode source-link values were identical before and after comparison
- Sentinel page displayed the observation-only notice
- report persisted under schema 5
- health check passed
- 3,543 items passed integrity inspection
- 13,055 episodes passed integrity inspection
- health issues: 0

## Stage 3 regression under schema 5

- item rating, completion, and note events passed
- episode completion, rating, note, and rewatch events passed
- Time Machine filters and daily grouping passed
- persistence passed
- health issues: 0

## Rollback

Stage 3 source snapshot:

- `backups/stage-3-time-machine-source-20260729-184902.zip`
- SHA-256 `5367AD6FF06DBC67157CCF16897EC1FF356889F1D84A2FD674D73A73B2BAEEA2`

Direct pre-Stage 4 files:

- `backups/pre-stage4-sentinel/`
