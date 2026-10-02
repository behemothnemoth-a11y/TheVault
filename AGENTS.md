# The Vault — safety and handoff rules

- Treat a blank shell (logo/header visible but navigation and cards missing) as a JavaScript module-load failure first. Never reset, replace, or delete library data to repair it.
- The Vault opens directly. Do not add a click-to-enter screen, startup sweep, drive scan, catalog refresh, or AI job during startup. Weather and trivia scheduling are the only approved automatic refreshes.
- Before every handoff, cache-version bump, or app reopen after JavaScript changes, run `tools/validate-vault.ps1`. Do not hand off or reopen when it fails.
- Keep `package.json` with `"type": "module"`; it is required so Node validates the browser modules correctly.
- Any startup failure must leave stored data untouched and show the non-blocking recovery message supplied by `js/startupFallback.js`.
- Preserve user data and unrelated changes. Scans are read-only unless the user explicitly approves importing a reviewed item.
- Use `apply_patch` for source edits.
