# Adaptive Editorial Contract and Page Definitions

Checkpoint date: August 26, 2026

## Core idea

The Vault Home is an editorial surface, not a fixed dashboard. Headlines, supporting text, card order, featured-card size, and eligible card groups may change as explicit viewing, reading, playing, and rating patterns change. The structure remains recognizable even when the edit changes.

## Cold-start ownership rule

- A fresh recommendation profile shows owned records only.
- Imported catalog ownership and original-Vault watch history restore archive truth, but do not unlock new recommendations by themselves.
- The first explicit watch action recorded inside the reconstructed Vault unlocks a starting profile.
- Early recommendations remain conservative and become broader only as explicit watch events accumulate.
- Clearing the new activity profile returns Home to owned-only mode without removing library or historical records.

## Signals the editorial AI may use

- Explicit ratings and favorites
- Completed and in-progress status
- Watched episode counts and directly playable availability
- Recent record opens and explicit playback history
- Owned versus discovery status
- Current time available, energy, mood, and focus domains
- Repeated positive choices and recent interest balance
- Record genres, runtime, year, and collection membership

Inactivity is neutral. The system must not interpret an unopened record as disliked, abandoned, or unwanted.

## What the AI may change

- Hero kicker, headline, and one short summary
- Section headlines and subheads
- Which approved sections appear below the fixed first-screen controls
- Which eligible Vault IDs appear in a section
- Card order
- Balanced, feature-first, or compact card presentation
- One bounded reason explaining each editorial choice

## What the AI may never change

- Ratings, favorites, status, completion, notes, ownership, paths, or media files
- The permanent navigation rail, scale controls, archive status, or safety controls
- Record titles, metadata, or artwork
- The underlying recommendation score or candidate eligibility
- Spoiler clearance
- Any HTML, CSS, JavaScript, URL, or unknown record ID

The browser accepts only a strict JSON-shaped edit. Every returned item ID must already exist in the bounded candidate list. Invalid sections and IDs are discarded and replaced by the local deterministic edit.

## Stability and transparency

- One edit is cached for six hours unless the user explicitly refreshes it.
- A changed watch/read/play pattern invalidates the old candidate fingerprint.
- Home shows whether the current edit is AI-backed or the local fallback.
- Every adaptive shelf keeps a Why This explanation.
- Manual pin, hide, and section-order controls will override AI presentation.
- The AI receives bounded record summaries only. Local paths and private notes are excluded.

## Page 1: Home

Purpose: answer what deserves attention now, then provide a scrollable daily intelligence edition.

Fixed first screen:

1. Tonight entry point
2. Owned Continue Watching
3. Cross-interest fits
4. Time, energy, and immediate actions
5. Interface scale and archive status

Adaptive scroll rooms:

1. Daily Brief and Weather / Evening Window
2. Release Radar
3. From Your Own Vault
4. Worth Owning
5. Something Different
6. Vault Memory and Backlog Rescue
7. Daily Trivia and Franchise Watch

## Page 2: Tonight

Purpose: make one good choice without becoming a planner.

- One large lead recommendation
- Four alternatives: Continue, Comfort, Short, Discovery
- Owned and directly playable options first
- Time, energy, and mood remain editable
- Headline and complete card set may change with current patterns
- One-click Play or Open; no itinerary, timeline, or scheduled plan

## Page 3: Television

Purpose: make ownership and completeness obvious.

- Owned collection first with poster cards
- Each card shows seasons/episodes present, catalog total, and missing count
- Complete, Partial, Specials/Combined, and Discovery badges
- Missing means absent from the cataloged show set, not a broken link
- Series page includes a season coverage map and directly playable episode access
- Recommendations for what to own remain visually separate

## Page 4: Games

Purpose: resume play and understand the collection at a glance.

- Continue Playing, Installed/On Drive, Backlog, Completed, and Creative Projects
- AI may change shelf headlines and feature one current game
- Session length and energy affect ranking, but no automatic playtime claims
- Expansions and releases remain a separate live-signals lane

## Page 5: Movies

Purpose: choose a film quickly or explore the archive deeply.

- Tonight-sized picks, owned collections, unwatched shelf, franchise order, and rediscovery
- Runtime, mood, decade, genre, and rating are explicit controls
- AI may create editorial shelves only from real record IDs

## Page 6: Books and Reading

Purpose: make reading progress and returning to books feel as immediate as TV.

- Continue Reading, Short Reads, Current Series, Reference/Nonfiction, and Rediscovery
- Reading sessions are explicit user entries; inactivity remains neutral
- The AI can change headlines and card emphasis using only recorded progress and ratings

## Page 7: Discovery and Releases

Purpose: contain internet-backed information away from archive truth.

- New releases, returning seasons, expansions, new books, and franchise announcements
- Every live card includes source, checked time, and relevance reason
- Live facts are cached and visibly separate from owned Vault records
- Saving a discovery creates a candidate record only after explicit approval

## Page 8: Memory and Patterns

Purpose: explain the personal history the adaptive pages are reacting to.

- Recent interests, long-term genre balance, favorites, seasonal habits, and on-this-day memories
- Shows the evidence behind editorial shifts
- No diagnosis, personality labeling, or unsupported emotional inference

## Page 9: AI Control Room

Purpose: give the user final authority over adaptation.

- Enable/disable AI editing and live signals separately
- Set refresh cadence and monthly usage limit
- Pin, hide, or reorder Home sections
- Inspect the last bounded input summary and accepted output
- Clear the editorial cache and return to the deterministic local edit
