# VLC television playback — 26 September 2026

The default launcher now opens the desktop Vault with libVLC embedded in the same window. See [desktop-migration.md](desktop-migration.md) for migration, storage, and verification details. The separate player described below remains the fallback for explicitly opening Vault in a browser.

## Daily use

- Click an episode normally. The player resumes unfinished episodes and starts completed episodes from the beginning.
- The native window provides pause, seek, start over, volume, mute, speed, audio tracks, subtitles, and fullscreen. Space toggles playback; F toggles fullscreen; Escape exits fullscreen or closes the player.
- Return to Vault or the window close button stops playback and writes a final position report. Closing the browser's player panel leaves VLC running.
- The browser panel offers Show player, Start over, Mark watched/unwatched, Next episode, and Stop player. Mark unwatched stops playback and resets resume to zero. Next episode skips missing links without alternatives.
- When VLC cannot open, an explicit browser-player fallback remains available. It retains the browser's codec limitations.

## Files and progress

The local server inspects only the selected episode's saved primary and alternate paths, using ffprobe. It chooses the first readable video; it does not move media, change the primary link, scan drives, or modify original files. Header readability is not a full-file integrity guarantee.

VLC sessions keep private request/status/command files under `data/private/native-playback`. The helper reports actual advancing playback time, excluding pauses, seeks and buffering, once per second. The browser polls every two seconds and persists progress approximately every ten seconds, on state changes, and at close. Cumulative time and sequence numbers are persisted with the active session to prevent double counting after refresh. A manual watched/unwatched revision wins over late progress. Active reports are reconnected after a browser refresh without starting playback automatically. The helper can finish while the browser is closed; its final report is applied when that browser opens again.

The helper never reads or writes the archive. Only the browser applies episode progress. Session files are private and are not served as static assets. Native endpoints require the existing local-host gate plus an operation-specific request header and unguessable session token. No remote control port is opened by VLC.

## Implementation

- `native_playback.py`: read-only source validation, session launch, status and ordered commands.
- `vault_vlc_player.py`: dedicated PySide6/libVLC window; independent of the legacy `vault_desktop.py` shell.
- `js/systems/nativeTvPlayback.js`: TV launch panel, reporting, reload recovery.
- `js/systems/tvPlaybackState.js`: idempotent progress and explicit watched/unwatched rules.
- `vault_server.py`: three guarded native playback routes.

## Verification

- Eight backend regression tests and nine JavaScript progress tests.
- Existing seven server-hardening and six media-identity tests.
- The native HTTP integration test opened a synthetic video at a saved position, verified paused time exclusion, restarted from zero, and preserved the final report on close.
- Direct libVLC decoding produced non-silent PCM from actual Always Sunny S07E01, S08E01 and S16E01 without updating the archive or playing sound through speakers.
- The actual selector chose readable alternate copies for S08E05; S13E01, E02, E03, E05, E06, E10; and S15E02.
- The player layout and fullscreen were visually inspected with a synthetic silent video. The browser integration is tested with an isolated synthetic store, never the real archive.
- Run `tools/validate-vault.ps1` before handoff or any further cache-version change.

## Limits

This change is for TV playback. Movies retain their existing player. Desktop TV uses an embedded native surface; the explicit browser fallback uses a separate window. The full VLC application's menus are not embedded; selected libVLC controls are exposed. Library records are not automatically relinked and media files are not repaired.
