# Phase III — Stages 37–42: The Personal Companion

## Completion status

Phase III is complete at schema 42.

The Vault now has a continuous local loop:

1. preserve the archive as the source of truth;
2. accept deliberate preference evidence;
3. turn that evidence into a small Daily Desk;
4. adapt choices to available time and energy;
5. expose one durable evidence page for every record;
6. perform bounded while-open care;
7. prepare useful next actions while leaving final authority with the user.

“Complete” does not mean unlimited autonomy. It means the useful loop is closed and the authority boundary is explicit, visible, and testable.

## Why the progression ends here

The archive already had recovery, imports, health checks, TV episode state, collections, artwork, history, and supervised maintenance. Stage 37 began converting that infrastructure into daily value. Stages 38–42 finish that progression without creating an opaque recommendation service or an uncontrolled agent.

The endpoint is deliberately local, explainable, useful with sparse history, supervised, bounded, and safe around irreplaceable archive and media data.

| Stage | Schema | Capability | New authority |
|---|---:|---|---|
| 37 | 37 | Daily Desk | Curate a bounded daily plan |
| 38 | 38 | Taste Calibration | Record explicit pairwise preference signals |
| 39 | 39 | Session Planner | Prepare a time-and-energy-bounded session |
| 40 | 40 | Universal Record | Present one durable evidence page per record |
| 41 | 41 | Quiet Host | Run bounded checks while the page is open |
| 42 | 42 | Personal Autopilot | Prepare dry-run actions pending explicit approval |

## Stage 37 — Daily Desk

The Daily Desk remains the decision surface for Movies, TV, Games, and Books. It produces six stable daily choices using progress, favorites, ratings, ownership, playable TV links, collection membership, previous exposure, reversible Desk feedback, explicit taste signals, and a deterministic date/revision tie breaker.

Balanced, Continue, Discovery, and Comfort modes remain available. The Desk never changes completion, ratings, metadata, files, or ownership. Its links now open the universal record route; TV records retain a direct path to their dedicated episode pages.

## Stage 38 — Taste Calibration

### Interaction model

Each round normally contains five comparisons, favoring cross-wing contrast. Answers are Choose Left, Choose Right, Both, Neither, and Skip.

Taste Calibration learns only from the button deliberately pressed:

- choosing one contributes +2 item, +2 wing, and +1 to up to four genre signals;
- Both gives half-weight signals to both records;
- Neither and Skip create no positive or negative signal;
- browsing time, abandonment, and session completion produce no taste signal.

Daily Desk converts explicit taste into a capped additive factor: item × 4, wing × 1, and genre × 2, capped at +36. This influences close choices without erasing ownership, progress, rating, or diversity evidence.

### Reversibility and limits

Every comparison stores its exact deltas. Undo marks the comparison undone and subtracts those deltas rather than reconstructing prior state.

- Up to 120 sessions are retained.
- Up to 1,500 comparisons are retained.
- Ratings, hiding, completion, metadata, files, passive tracking, and network access are outside this stage’s authority.

## Stage 39 — Session Planner

The planner answers: “What fits the time and attention available right now?”

Time budgets are 30, 60, 90, 120, and 180 minutes. Energy settings are Low Lift, Steady, and Deep Focus. Focus settings are Mix It Up, Watch, Play, Read, and Continue.

Selection considers Daily Desk membership, explicit taste, requested medium, energy fit, progress, ratings, favorites, and ownership. It prepares one to three entries with at least 20 minutes each.

Natural estimates are intentionally coarse:

- Movies: 110 minutes
- TV: 45 minutes
- Games: 60 minutes
- Books: 45 minutes

Plans move from `draft` to `active` to `completed`, or to `cancelled`. Starting is explicit. Finishing records that the bounded session ended; it never completes a movie, series, episode, game, or book. Up to 180 plans are retained.

## Stage 40 — Universal Record

Every core record now has the durable route `#/record/<vault-id>`, independent of the shelf or recommendation that opened it.

The page combines artwork, catalog fields, rating, favorite, explicit non-TV status controls, Workbench access, taste decomposition, Daily Desk and session appearances, collection and relationship context, item events, recent-open history, and TV episode/link counts.

TV series status remains episode-based, so the page links into the dedicated series file instead of changing aggregate progress. The latest 80 opened records are retained with their open count and latest time. Opening history is presentation evidence, not a taste signal.

## Stage 41 — Quiet Background Host

The Quiet Host runs only while the Vault page is open. The default cadence is 30 minutes and can be set to 15, 30, 60, or 120 minutes.

Every run performs five bounded checks:

1. archive health;
2. Daily Desk date freshness;
3. naturally expired snoozes;
4. session drafts older than 24 hours;
5. supervised proposals awaiting a decision.

Most runs perform zero mutations. The only permitted mutation is allowing the existing Daily Desk engine to advance a stale plan to the current local day. A current plan is never rotated merely for novelty.

Every run stores its source, times, outcome, five findings, zero-or-one mutation count, bounded health issues, and a visible brief tied to that run. Up to 240 runs are retained.

The host cannot scan drives, touch media, call the network, edit metadata, rate, complete, attach artwork, or repair. Pausing it preserves the ledger.

## Stage 42 — Supervised Personal Autopilot

The final stage may prepare useful next actions. It may not decide them.

The default `suggest` mode creates a dry-run proposal containing exactly three bounded actions:

1. prepare a Session Planner draft;
2. prepare or resume an optional calibration round;
3. propose a Daily Desk mode and approved rotation.

Every action includes an ID, kind, title, explanation, visible local evidence, bounded payload, and decision state.

Proposals begin `pending`, become `partially_resolved` while decisions remain, and close as:

- `applied` when at least one approved action succeeds;
- `rejected` when every action is rejected;
- `expired` when a newer proposal supersedes it.

Actions are `pending`, `applied`, `rejected`, or `failed`. Rejected actions remain rejected.

Approving a session creates a draft with source `autopilot_approved`; starting remains separate. Approving calibration only prepares the round; every comparison still needs an answer. Approving Desk Mode uses the existing mode control and never changes media progress.

Personal Autopilot cannot rate, complete, hide, edit, delete, import, attach artwork, repair, scan, open media, contact services, broaden policy, or bypass approval. Up to 180 proposals and 365 cycle records are retained.

## Integrated daily workflow

1. Open Home or the Daily Desk.
2. Keep, snooze, or hide a Desk choice if useful.
3. Open Session Planner when time is constrained.
4. Use Taste Calibration when recommendations feel under-informed.
5. Open a record to inspect evidence or make an explicit rating, favorite, status, note, or episode decision.
6. Let Quiet Host maintain freshness while the page is open.
7. Review Personal Autopilot only when desired and approve or reject each prepared action.

Advanced maintenance rooms remain available without being part of ordinary daily use.

## Schema and health enforcement

Schema 42 health rejects unsafe Stage 38–42 policies; broken calibration references; duplicate ledger IDs; invalid signals; invalid planner states or allocations; missing record references; an unsafe host cadence, mutation count, or brief; proposals without three bounded dry-run actions; and any loss of approval, local-only, no-network, media-read-only, or no-auto-completion guarantees.

The permanent Final Audit migration matrix covers 18 historical boundaries through schema 41. Its 13 isolated corruption probes now include negative taste inference, planner automatic completion, non-explicit record edits, Quiet Host network access, and Personal Autopilot approval bypass. All must be detected while live state remains unchanged.

## Acceptance evidence

The permanent Stage 42 suite verifies schema 37 to 42 migration, safe policies, exact archive counts, every desktop route, explicit taste and undo, neutral Skip behavior, time/energy planning, explicit session start, universal record routing, ten rating controls, five-check host runs, supervised mixed decisions, an unchanged item fingerprint, all six routes at 390×844, named controls, no overflow, and no page, HTTP, external-request, or health errors.

Compatibility gates remain the reconstruction regression, permanent Stage 32 audit, Stages 36, 37, 31, 29, and 17.

## Known limits retained intentionally

- Quiet care and proposal preparation run only while the local page is open.
- Runtime estimates are planning defaults, not title-specific facts.
- Taste does not learn from passive behavior.
- Session completion does not infer media completion.
- Personal Autopilot does not execute without approval.
- Network popularity services are absent.
- Direct episode launch requires `serve.ps1`.
- Intentional DVD-rip gaps remain outside active cleanup.

## Post-completion recommendation

Do not add another numbered stage immediately. Complete calibration rounds, use varied planner settings, approve and reject real proposals, note weak explanations, and watch for repetition or sidebar clutter. Future changes should respond to those real patterns and remain schema-compatible unless a genuinely new durable data contract is required.
