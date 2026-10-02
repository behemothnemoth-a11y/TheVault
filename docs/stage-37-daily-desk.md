# Stage 37 - The Daily Desk

Status: implemented and acceptance-gated  
Schema: 37  
Phase: III - Grounded Personal Curation

## Executive decision

The next progression step was not more maintenance, more imported metadata, or stronger unattended automation. The Vault already had durable storage, recovery, health checks, supervised operations, direct TV playback, collection preservation, a Living Museum, and bounded library pages. Its most visible weakness was between those systems: it could preserve thousands of records but still could not help choose a useful next thing without falling back to an alphabetic shelf.

Stage 37 adds the first decision layer. The Daily Desk converts existing archive evidence into six small, stable, cross-media choices. It explains why each choice exists and learns only from explicit local feedback. It remains useful with the current cold-start archive, where almost no records are completed, in progress, or rated, while naturally becoming more personal as real signals accumulate.

This is the bridge from a self-maintaining archive to a self-running companion. It deliberately stops short of autonomous decisions that would change history, files, completion state, ratings, notes, ownership, or artwork.

## Why this stage comes next

The live baseline showed:

- 3,543 records, but zero completed items, zero in-progress items, and only one rated item in the default archive state;
- a Home continue shelf that had to fall back to alphabetically early television titles;
- strong record and episode pages, but no small cross-media decision surface;
- multiple advanced systems that could inspect and maintain the archive, but no explicit feedback loop for daily usefulness;
- enough grounded evidence to make transparent choices: ownership, playable TV files, preserved collection membership, genres, years, favorites, ratings, recent TV opens, and current status.

The right progression was to make those existing facts useful before adding external intelligence. A web recommendation service would conceal its reasoning and introduce unstable popularity data. More background automation would automate maintenance rather than improve daily use. A mass metadata campaign would postpone the product benefit and pressure the user to curate thousands of fields first.

## Product promise

The Daily Desk guarantees:

1. A plan contains four to eight records; the default is six.
2. The same date, mode, feedback state, and revision produce a stable ordering.
3. Every entry contains local reasons and a visible score-factor ledger.
4. Balanced mode includes Movies, TV, Games, and Books when each wing has eligible records.
5. No wing contributes more than two entries under the default policy.
6. Hiding affects only the Desk; the record remains intact everywhere else.
7. Opening uses an existing durable series or record route.
8. Feedback never changes rating, status, completion, note, ownership, artwork, episodes, or media.
9. The engine never calls the network or uses external popularity.
10. The plan remains useful before ratings and status history are populated.

## Daily interaction model

Home shows a four-card preview before the Television shelf. The dedicated `#/today` room shows all six entries, mode controls, current feedback counts, a manual rotation control, score evidence, and the reversible hidden-record drawer.

Each full card supports:

- **Open** - route to the existing durable TV series, Movie record, Game record, or Book record page.
- **Keep** - pin the choice visually and strengthen its explicit positive signal without changing the record.
- **Later** - remove it from eligibility for seven days, then allow it to return automatically.
- **Hide** - exclude it from future Daily Desk plans only.
- **Restore** - remove Hide and Later exclusions and return the record to eligibility.

Keep is a toggle. Releasing a kept record creates an `unkeep` feedback entry so the ledger remains truthful. Later, Hide, and Restore generate a new revision immediately so an excluded item does not remain in the visible plan.

## Modes

| Mode | Purpose | Lane sequence |
| --- | --- | --- |
| Balanced | Cross-media default for ordinary days | Continue, Watch, Play, Read, Rediscover, Wildcard |
| Continue | Emphasize momentum and directly playable material | Continue, Continue, Watch, Play, Read, Rediscover |
| Discovery | Increase exposure outside owned shelves | Wildcard, Watch, Play, Read, Rediscover, Wildcard |
| Comfort | Favor familiar, owned, rated, favorite, and connected records | Continue, Watch, Rediscover, Play, Read, Watch |

Changing mode records a new plan revision. It does not overwrite previous plans; up to 90 plans remain in the local ledger.

## The six lanes

### Continue

Prefers records marked in progress, recently opened TV series, and TV series with directly playable episodes. During cold start, playable TV is the strongest grounded evidence that a choice is actionable.

### Watch

Restricts candidates to Movies and TV, then uses the shared score. This avoids presenting Games or Books under a misleading action label.

### Play

Restricts candidates to Games. Owned and collection-backed games remain useful before game progress tracking is populated.

### Read

Restricts candidates to Books. Audiobooks and books use the same archive truth and durable record pages.

### Rediscover

Favors explicit favorites, ratings, ownership, and catalog years through 2010. Age is only a grounded rediscovery signal, never a claim that older automatically means better.

### Wildcard

Favors records outside the owned shelf. This preserves the original Vault behavior of including things the user does not own without pretending they are owned or immediately available.

## Eligibility quality gate

The engine considers Movies, TV, Games, and Books. It excludes temporary drive-only TV candidates and Desk-hidden or currently snoozed records. A title must be meaningful enough to act on.

The gate rejects:

- empty, one-character, or over-100-character titles;
- synthetic `more` placeholders and tilde/ellipsis rollups;
- known knockoff-count summary rows;
- imported verification notes;
- `Gameplay:` bundle notes;
- titles containing more than three middle-dot separators.

This gate affects only Daily Desk eligibility. It never deletes, repairs, renames, or suppresses the record in its normal library.

## Score model

Every candidate receives additive factors. The card exposes all non-zero factors under **Why this record?**.

### Shared evidence

| Factor | Weight | Meaning |
| --- | ---: | --- |
| In progress | +48 | Explicit archive status |
| Completed | -18 | Lowers repeat pressure without removing the record |
| Favorite | +28 | Explicit personal signal |
| Rating | rating x 3 | A 1-10 explicit personal signal |
| Owned | +14 | More immediately actionable |
| Playable TV | up to +24 | Square-root scaled mapped-episode count |
| Collection membership | up to +15 | Three points per preserved collection |
| Prior Keep | +9 each | Explicit Daily Desk feedback |
| Recent exposure | down to -30 | Six-point penalty per appearance in the latest 30 plans |
| Year, genre, artwork | up to +7 | Small evidence contribution, never dominant |
| Date-seeded tie breaker | 0 to +14 | Stable variation for otherwise similar records |

### Lane fit

Lane fit is the strongest term. Play and Read receive +82 for the correct wing. Continue receives +72 for explicit in-progress status, a recency-weighted value for recently opened TV, or +30 for playable TV during cold start. Watch receives +42 for Movies or TV. Rediscover receives up to +48 for explicit favorites or ratings. Wildcard receives +44 when the record is not owned.

The numeric score is not presented as objective quality. It is a local scheduling score whose components remain visible and auditable.

## Cold-start behavior

A recommendation system commonly fails when there are few ratings. The Daily Desk avoids inventing a taste profile by relying on actionability and archive structure:

- playable TV files prove that a series can be opened now;
- ownership proves availability without guessing enthusiasm;
- collection membership proves deliberate organization;
- wing lanes guarantee cross-media variety;
- unowned Wildcards deliberately preserve discovery;
- date-seeded jitter prevents permanent alphabetical ordering;
- exposure penalties create rotation before sufficient feedback exists.

As ratings, favorites, status, recent opens, and Desk feedback accumulate, those explicit signals naturally outweigh the cold-start structure.

## Persistence model

Schema 37 adds `metadata.stage37`:

- `plans` - the latest 90 generated plans;
- `feedback` - the latest 1,000 explicit feedback entries;
- `signals` - per-record Keep, Later, Hide, snooze, and last-action state;
- `currentPlanId` - the currently displayed plan;
- `revision` - the manual/feedback rotation number;
- `preferences` - mode, deck size, and maximum entries per wing;
- `policy` - the safety contract enforced by archive health.

Daily Desk changes touch core metadata only. The normalized persistence layer does not rewrite 3,543 item records for a feedback click.

## Safety contract

Archive health rejects schema-37 state unless:

- mode, deck size, and per-wing cap are valid;
- every plan and feedback ID is unique;
- every entry and signal references a real record;
- entries have valid lanes, finite scores, reasons, and factor evidence;
- current-plan and feedback-plan references exist;
- snooze dates are valid;
- `localOnly` and `evidenceRequired` are true;
- `externalInference` and `automaticCompletion` are false;
- `mediaFilesReadOnly` and `feedbackReversible` are true.

The permanent Final Audit now flips external inference on in an isolated clone and requires health to detect it. Its migration matrix includes schema 36 as the thirteenth historical boundary and confirms migration through schema 37.

## Accessibility and responsive behavior

The mode controls form a named group. Every action button has visible text or a title. Posters use decorative empty alt text because the adjacent heading names the record. Score evidence and the hidden-record manager use native disclosures.

At 390 pixels:

- document width equals viewport width;
- six cards remain available in one column;
- all four modes remain operable;
- mobile navigation remains closed until requested;
- no visible control lacks an accessible name.

## Acceptance evidence

`tests/stage37-daily-desk.cjs` verifies:

- schema-36 to schema-37 migration and safe defaults;
- exact preservation of 3,543 records, 13,055 episodes, and 11,941 links;
- healthy state before and after feedback;
- six choices with all four target wings and no more than two per wing;
- quality-gate rejection of verification and overlong operational titles;
- plan construction below 500 ms; the accepted run measured about 13 ms;
- four visible modes and an active Daily Desk route;
- Keep persistence across reload;
- seven-day Later exclusion;
- Hide removal and Restore reversibility;
- mode and manual-rotation revisions;
- durable TV and record routing;
- a four-card Home preview;
- byte-equivalent sorted item state before and after every Desk interaction;
- 390-pixel layout, named controls, and no overflow;
- zero page, HTTP, or external-request errors.

The reconstruction, Stage 32, Stage 36, and earlier historical suites are retargeted to schema 37 so this progression cannot silently break the sealed foundation.

## Progression after Stage 37

Stage 37 should collect real feedback before the next decision layer becomes more ambitious. The recommended sequence is:

1. **Stage 38 - Taste Calibration Sessions:** short, optional pairwise choices that improve genre and franchise preference evidence without mass ratings.
2. **Stage 39 - Session Planner:** optional time, energy, and media-context inputs that temporarily re-rank the Desk without becoming permanent taste claims.
3. **Stage 40 - Universal Record Detail:** one durable detail surface for every remaining imported wing, with history, collections, relationships, and reversible edits.
4. **Stage 41 - Quiet Background Host:** an optional launcher-owned scheduler that can prepare snapshots and plans while the browser is closed, still without destructive permission.
5. **Stage 42 - Supervised Personal Autopilot:** uses the mature feedback ledger to prepare plans and enrichment proposals automatically while archive mutations remain previewed and approved.

The rule for every future step is the same: automate preparation before automating decisions, and automate decisions before ever considering mutation.
