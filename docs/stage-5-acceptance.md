# Stage 5 — Reconciliation Laboratory Acceptance

Stage 5 converts read-only Sentinel inventory into explainable repair proposals.

## Required outcomes

1. Proposal generation runs from the same inventory already collected by the Sentinel.
2. It does not trigger a second drive scan.
3. Matching uses normalized series title plus parsed season and episode coordinates.
4. Existing linked paths are excluded from proposals.
5. Proposals distinguish unlinked episodes, missing-path replacements, alternate files, and missing episode records.
6. Every proposal records its confidence and matching reason.
7. Proposal IDs are deterministic for the same file and target.
8. Prior proposal decisions survive a regenerated inventory.
9. Proposals can be deferred, dismissed, and reopened without changing episode data.
10. No proposal is applied automatically.
11. A dedicated Reconciliation Laboratory page supports search and filters.
12. Schema 6 persists proposal summaries and bounded unmatched samples.
13. Health validation confirms referenced series and episodes remain valid.
14. All episode source paths remain unchanged during generation and proposal review.

## Safety boundary

Stage 5 may observe, classify, explain, defer, dismiss, and reopen. Applying a proposed link belongs to a later explicitly protected action.
