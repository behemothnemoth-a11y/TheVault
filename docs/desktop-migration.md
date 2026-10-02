# Desktop Vault with embedded VLC

The normal `Open The Vault.cmd` launcher now opens `vault_desktop.py`. The user's
existing `The Vault.lnk` points to this launcher. The separate `The Vault v2.lnk`
points to an older installation and was not modified.

The desktop Qt WebEngine profile persists under `data/private/desktop-profile`.
The original Edge profile is retained. The migration source is protected in
`backups/before-desktop-20260926/vault-state-mirror.json`.

On the first desktop startup, `initStore` explicitly reads the current mirror,
protects any prior desktop archive as an IndexedDB snapshot, writes the full
archive to the desktop database, and only then records the migration marker.
Failure to read the source stops initialization instead of loading sample data.
The legacy Stage 0 historical seed is skipped in desktop mode. Subsequent starts
use the persistent desktop database. Do not run the old Edge archive and desktop
archive concurrently: they have separate databases and share a recovery mirror.

The desktop injects a local QWebChannel bridge. TV launch creates the existing
VLC widget as a child in the same application window, without spawning a second
player process. The shared source validation, progress reports, watch accounting,
pause/seek handling, manual watch controls, and alternate-copy selection remain.
Return to Vault stops the episode, dismisses its control panel, and restores the
library. Ordinary changes remain in memory during the desktop session. Closing
the desktop flushes the final player report, writes the database, creates the
daily snapshot if needed, and writes the recovery mirror. Normal close is
required to retain the session's changes; forced termination cannot run this save.
Export downloads prompt for a destination through the desktop save dialog.

Verification uses offscreen Qt tests, without mouse/keyboard control or visible
windows. The migration comparison checked all 21,645 item records for exact
equality, including 175 TV series and 16,685 episode records. Existing original
media and file links are unchanged. DVD-disc handling and broader extension
acceptance remain separate work; this migration does not import scan findings.

Movies retain their existing embedded browser player. The desktop TV surface is
libVLC with Vault controls, not the complete standalone VLC menu interface.

Desktop pointer events are checked against the receiving widget's current
screen location. An inconsistent local coordinate is corrected for move,
press, release, and double click. Already consistent coordinates are untouched;
no fixed pixel offset or nearest-button targeting is used. Only counts of
checked/corrected events are saved in `desktop-pointer-report.json` on normal
close; there is no pointer-position history or per-movement disk logging.
Five offscreen tests cover injected coordinate errors and gutters at 200%
scaling. Actual pointer behavior on the user's display requires confirmation.
