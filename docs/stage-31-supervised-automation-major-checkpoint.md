# Stage 31 — Supervised Automation Major Checkpoint

Stages 30 and 31 are complete at schema 31.

## What changed

### Vault Oracle

- local plain-language questions over structured Vault truth
- exact counts and explainable filters
- record, episode, event, collection, import-batch, and relationship citations
- explicit refusal when an answer cannot be proved
- bounded local question ledger
- no API key, cloud dependency, internet search, or generative guessing

### Supervision Deck

- dry-run plans with per-step previews and confidence scores
- hard 95% minimum-confidence gate
- explicit approval required for every execution
- protected snapshot before any metadata mutation
- isolated step execution with later safe read-only checks allowed to continue
- automatic skipping of mutations after a failure or attention result
- narrow, conflict-aware rollback journal
- permanent denial of automatic repairs, artwork attachment, and media-file changes

## Available supervised jobs

1. archive health audit — read only
2. import manifest audit — read only
3. relationship evidence audit — read only
4. maintenance summary refresh — Vault metadata only, snapshotted and reversible

An intentional failure-isolation probe exists only for the acceptance harness and is not exposed in the regular interface.

## Verified acceptance

The schema 31 browser checkpoint verified:

- 3,543 archive records
- 13,055 individually tracked TV episodes
- 11,941 linked episode files
- 1,114 missing-file episodes counted exactly
- 327 Horror movie records counted exactly with a 60-record visible citation sample
- relationship and canonical-event answers with evidence citations
- unsupported prediction refusal with no fabricated citations
- below-threshold plan rejection
- unapproved execution rejection
- contained diagnostic failure followed by a successful later read-only step
- dry run with no archive-summary mutation
- protected execution and exact metadata rollback
- clean health before and after acceptance cleanup
- zero browser page errors and zero HTTP errors

All preserved regressions also passed under schema 31: Stages 29, 27, 24, 19, 18, 17, 11, and the live Stage 10 Autopilot/repair suite.

## Files

- `js/systems/vaultOracle.js`
- `js/systems/supervisedAutomation.js`
- `css/oracle-supervision.css`
- `tests/stage31-oracle-supervision-checkpoint.cjs`
- `docs/stage-30-grounded-oracle-guide.md`

## Safety boundary

Stage 31 does not make the Vault independently destructive. It adds better previews, gates, confidence policy, observability, containment, and rollback around a deliberately small maintenance surface. Direct media-file changes remain outside all automation permissions.

