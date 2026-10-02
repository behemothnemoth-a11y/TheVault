# Stage 3 — Time Machine Acceptance

Stage 3 turns future Vault activity into trustworthy personal history.

## Required outcomes

1. Completing and uncompleting a non-TV record works from its existing card.
2. Adding or changing a non-TV field note works from its existing card.
3. Rating changes emit canonical events with the prior and new rating.
4. Episode completion, rating, note, and rewatch changes emit specific canonical events.
5. Canonical events retain stable item and episode references.
6. The Timeline becomes a Time Machine with today, week, month, year, and all-time filters.
7. The Time Machine can show meaningful history by default while retaining an all-signals view.
8. Search narrows timeline events by title, type, wing, and date text.
9. Timeline entries are grouped by day.
10. On This Day uses only real prior events and never invents historical activity.
11. Activity summaries show recorded events, active days, and the most active wing.
12. Stage 0–2 storage, TV, review, Workbench, artwork, and recovery behavior continue to pass.
13. The health report remains free of integrity issues.

## Truth rule

The imported Vault did not contain reliable completion timestamps for most historical records. Stage 3 must not infer or fabricate them. The Time Machine begins from canonical events the reconstructed Vault actually records.
