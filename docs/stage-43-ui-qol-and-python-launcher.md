# Stage 43 — UI and Everyday Quality of Life

Stage 43 keeps the schema at 42 and changes no archive records. It simplifies the everyday surfaces and replaces the typed PowerShell startup flow with a one-click Python launcher.

## Opening the Vault

Double-click `Open The Vault.cmd`. The launcher uses Python's standard library, opens the browser automatically, and reuses an existing Vault without showing a port-conflict error. Closing its small window closes the local server.

The Python server preserves direct episode launching, validated local artwork intake, TV inventory inspection, local-only networking, and security headers. HTTP connection reuse and a 128-request queue support the Vault's large cold-start archive and module graph.

## Interface changes

- Home has two primary choices: Open Today and Plan a Session.
- Secondary tools live in a compact Quick Tools strip.
- Today combines session, Assistant, Background Care, taste, and daily-pick status.
- Daily cards show Open first; Keep, Later, and Hide live under Options.
- Recommendation factors and technical policies are collapsed by default.
- Universal records have Back, Copy Direct Link, larger artwork and rating targets, friendlier match language, and a collapsed local-evidence drawer.
- Personal Autopilot is presented as Vault Assistant with Prepare and Maybe Later language.
- Quiet Host is presented as Background Care with a plain-language all-clear summary.
- Mobile has a five-button dock for Home, Today, TV, Plan, and Search.
- Keyboard shortcuts: Alt+H Home, Alt+T Today, Alt+S Plan a Session, Alt+A Vault Assistant, `/` Search, and Ctrl+K Commands.
- The header stays available while scrolling, focus indicators are stronger, and reduced-motion preferences are respected.

## Verification

- all 72 JavaScript modules and the Python server parse successfully;
- Stage 43 desktop/mobile acceptance passes with no overflow, browser error, HTTP error, or external request;
- reconstruction regression passes with all 3,543 records, 13,055 episodes, and 11,941 linked episodes;
- Stage 37 Daily Desk behavior passes with collapsed Options interactions;
- Stage 42 Phase III behavior and authority checks pass;
- Stage 32 final audit passes all eight checks, 18 migration boundaries, and 13 corruption probes;
- UI navigation leaves the complete item fingerprint unchanged.
