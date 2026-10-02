# Stage 4 — Library Sentinel Acceptance

Stage 4 is the first self-running maintenance layer.

## Required outcomes

1. The local launcher exposes a restricted TV-library inventory endpoint.
2. The endpoint scans only `D:\TV Shows`.
3. The endpoint returns recognized video files and never writes to the TV library.
4. Unauthorized requests are rejected.
5. The Sentinel compares the inventory with canonical episode source paths.
6. Reports include linked files present, linked files missing, untracked files, duplicate path ownership, and likely moves based on exact filenames.
7. The comparison never changes an episode source path.
8. Reports persist in schema 5.
9. A dedicated Sentinel page shows the latest report and representative file samples.
10. A manual scan can be started from the Sentinel.
11. A read-only automatic scan can run at most once every 24 hours while the Vault launcher is open.
12. Automatic scanning waits 60 seconds after launch so it does not delay startup.
13. Stage 0–3 behavior and health checks continue to pass.

## Safety boundary

The Sentinel observes and reports. Relinking, rejecting, deleting, renaming, moving, or replacing media files requires a later explicit review action.
