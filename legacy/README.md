# Legacy rooms

Modules retired from the active shell on 2026-09-11. Nothing here is loaded by the Vault.
They were complete implementations of rooms the current atomic shell no longer exposes
(Vault Oracle, Import Station, Supervision Deck, Final Audit, Repair Bay, Artwork Curator,
Discovery Engine, Archive Voice, Collection Editor, Expedition Builder, Guild Hall,
Achievement Workshop, Unlock Vault, Environments, Eras, Echoes, Seasonal Moments, Basement,
Autopilot, Control Room, Vault Steward, Time Machine runtime, Taste Calibration,
Background Care, Universal Record, Relationship Atlas, and the pre-v2 Games and Library wings).

`js/wings/views.js` joined them on 2026-09-12. It held the editorial Home (TONIGHT
picks, continue-watching, the adaptive edition) plus four rooms nothing had imported in
some time — renderWing, renderTimeline, renderTrophies and renderSettings. Home is now
`js/wings/home.js`, a control room built on the shared wing shell.

To bring one back: move the file to js/systems (or js/wings), import it from js/app.js,
add a route branch in renderRoute, and add its id to the wings list in js/ui/navigation.js.

`js/systems/fullDriveScan.js` joined the legacy shelf on 2026-10-01. Master Scan is now the
only active whole-library change detector; TV, Movies, Books, and Comics keep only their
targeted folder import tools.
