# Stage 3 — The Time Machine

Completed: 2026-07-29

## Outcome

Stage 3 establishes a canonical history layer. The Vault can now record what changes, when it changes, and which immutable archive record was involved.

## Universal record actions

The existing Movies, Games, and Books cards now fully support:

- rating and rating changes
- archive completion
- returning a completed record to backlog
- adding a field note
- changing a field note

Each action writes the item change and a canonical event containing the stable item ID, wing, timestamp, title, and relevant before/after values.

## Episode history

Saving an episode can create specific canonical history for:

- watched or unwatched state
- first rating or rating change
- note change
- rewatch-count change

Multiple changes from one episode save are appended to the event ledger in one archive write. This prevents repeated cloning and saving of the full 3,543-record archive while retaining separate canonical events.

## Time Machine

The former Timeline is now presented as The Time Machine.

Available views:

- today
- trailing week
- trailing month
- trailing year
- all time
- meaningful events
- all signals, including navigation and Vault openings

Search narrows history by event type, wing, title, and displayed date text. Events are grouped into actual calendar days. Summary blocks report visible events, active days, most active wing, and On This Day matches.

On This Day includes only events with the same month and day from an earlier year.

## Truth rule

The repaired legacy archive contains status and progress but usually lacks trustworthy historical timestamps. Stage 3 does not infer completion dates from position, title, release year, or file timestamps.

The Time Machine begins with canonical Reconstruction events and any explicitly trusted timestamps added later.

## Performance correction

Initial testing found that an episode edit affecting status, rating, note, and rewatches caused several full archive writes. The canonical episode ledger was changed to append all resulting events in one queued save.

The initial timeline handoff also used a mutation watcher. It was replaced by explicit router and search signals to avoid unnecessary render reactions.

## Verification

Stage 3 isolated test:

- schema migrated to 4
- Stage 3 truth marker persisted
- item rating event passed
- item completion event passed
- item note event passed
- episode completion event passed
- episode rating event passed
- episode note event passed
- episode rewatch event passed
- Time Machine title and route code rendered
- 7 timeline controls rendered
- daily grouping rendered
- truth notice rendered
- all-signals mode rendered
- canonical episode events persisted
- 3,543 items passed health inspection
- 13,055 episodes passed health inspection
- 11,941 episode links remained intact
- health issues: 0

Stage 2 regression under schema 4:

- Workbench route and filters rendered
- reversible metadata edit passed
- guarded review batch passed
- protected pre-batch snapshot passed
- persistence passed
- health issues: 0

## Rollback

Stage 2 source snapshot:

- `backups/stage-2-archive-workbench-source-20260729-182318.zip`
- SHA-256 `D593BDFC838A351D1F1C4CE86807CC41DD2F972222BEFA2CA8AEF20A1ACEF906`

Direct pre-Stage 3 files:

- `backups/pre-stage3-time-machine/`
