# Life Dashboard — Product Cycle 1

## Product direction

The Vault is no longer only an entertainment archive. Its long-term role is a local-first life dashboard that tracks, connects, and helps use the owner's interests without pretending to know anything that was not explicitly recorded.

The Life Dashboard is the broad front door. Tonight is the first deep, purpose-built experience beneath it. Existing wings remain intact and will be redesigned one family at a time.

## The eight foundations now active

1. **Life Dashboard front door** — a single view across Movies, Television, Games, Books, YouTube, Music, Podcasts, Manga, Food, Trips, and Calendar.
2. **Tonight decision surface** — five explainable lanes: Continue, Comfort, Short, Discover, and Wildcard.
3. **Cross-interest recommendations** — Tonight deliberately spans at least three eligible media wings when the archive can support it; television gets its own directly playable rail instead of consuming every recommendation.
4. **Playback lifecycle** — launching an episode creates a local pending session. Returning asks whether it was finished and optionally accepts a 1–10 episode rating. Completion changes only after an explicit Yes.
5. **Read-only library awareness** — a manual check compares the TV archive with local files. It never moves, renames, deletes, or treats intentional DVD rips as repair work.
6. **Artwork and identity priority** — Tonight surfaces the highest-value missing posters while verifying stable record identity counts. Existing artwork and user choices are preserved.
7. **Personal memory** — explicit ratings, completions, sessions, and other canonical events become a truthful memory surface. Passive browsing does not become personal history.
8. **Portable device copies** — a full local archive export can be prepared for another device. Cloud synchronization remains disabled until a provider and conflict policy are explicitly chosen.

## Daily-use behavior

- Open **Life Dashboard** from the main navigation or press **Alt+L**.
- Open **Tonight** or press **Alt+N**.
- Set available time, energy, and mood on Tonight. These preferences are local and reversible.
- Arrow keys move through Tonight's couch controls.
- Full Screen removes the management shell for a living-room view.
- Clicking a playable episode uses the local Python launcher and begins the explicit return flow.
- “Check Library” is manual and informational.
- “Prepare Copy” downloads a portable archive; it does not enable cloud access.

## Authority boundaries

- Schema remains 42; the new product state lives in additive metadata.
- Media files are read-only.
- Missing episode links and untracked DVD rips are not cleanup failures.
- Completion and ratings require explicit actions.
- Recommendation reasons come from local archive facts and chosen context.
- No external requests are required for the dashboard or Tonight.
- Existing records, collections, episode data, and specialist tabs are retained.

## Verification evidence

The dedicated acceptance suite checks:

- all 11 interest domains;
- five distinct Tonight lanes and at least three represented media wings;
- directly playable television;
- local preference persistence without record mutation;
- read-only library pulse behavior;
- explicit unfinished playback that preserves completion state;
- desktop and mobile overflow;
- five-button mobile dock and usable control heights;
- no runtime errors, failed local requests, or external requests.

The legacy Stage 43 UI/QoL suite also passes, including Home, Today, record pages, shortcuts, mobile navigation, and record-integrity checks.

Screenshots:

- `tests/life-dashboard.png`
- `tests/living-room-tonight.png`
- `tests/living-room-tonight-mobile.png`

## Next phase — redesign the other tabs

The next work should proceed by experience family rather than by old stage number.

### 1. Daily command center

Unify Home, Today, Plan a Session, and Vault Assistant around one calm daily brief. Remove repeated recommendation blocks, keep one clear primary action, and let the user expand evidence only when wanted.

### 2. Movies

Add cinematic collection shelves, franchise journeys, runtime-aware movie-night queues, owned/discovery separation, poster-first browsing, and a dedicated film detail page that treats rewatches as first-class history.

### 3. Television

Retain the successful card catalog and dedicated series pages. Add season-level visual summaries, clearer next-episode state, playback-return history, series artwork priority, and couch-mode continuity without reviving missing-link clutter.

### 4. Games and Books

Give Games session length, platform, current campaign, co-op/solo, and “resume next” tools. Give Books reading state, format, series order, current page/chapter, quotes, and a reading-session view. Both should contribute to Tonight without being forced into TV-shaped behavior.

### 5. Listening and watching feeds

Create compatible but distinct experiences for YouTube, Music, and Podcasts: watch/listen queues, creators and series, duration, saved episodes/videos, repeat behavior, and lightweight session history.

### 6. Manga and collections

Build volume/chapter progress, publication status, series order, owned gaps, and a compact reading flow. Connect manga franchises to related anime, books, games, and films through explicit relationships.

### 7. Real-world interests

Turn Food, Trips, and Calendar into the bridge from archive to life: saved places and dishes, “try next” lists, trip ideas, visited history, plans, and calendar-aware suggestions. Calendar access must remain opt-in and clearly distinguish imported history from future plans.

### 8. Management layer

Move Settings, Control Room, Import, Workbench, Artwork, Enrichment, and maintenance into one coherent back-office area. Daily navigation stays short; expert tools remain available, searchable, reversible, and evidence-rich.

Each family should receive its own card grammar, detail page, empty state, mobile check, and authority contract while sharing the Life Dashboard identity, memory, and recommendation model.
