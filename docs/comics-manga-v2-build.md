# Comics / Manga V2 — Build Record

## Status

Implemented baseline. Approved in the project workflow and verified on 2026-08-31.

## Objective

Upgrade the existing Comics/Manga archive as one coordinated system: library, adaptive series dossiers, automatic intake, local reader, release monitoring, and recommendations.

## Must preserve

- Existing cards, records, progress, favorites, notes, ownership, sources, approved artwork, and collection names.
- Vault industrial visual language and desktop-first scrolling.
- New releases remain new until explicitly marked read.
- Planned titles do not produce unread counts.
- Letting It Cook retains a growing unread count.
- Artwork approval and local caching.
- No startup scan or metadata sweep.

## Approved behavior

- Adaptive structures: manga volumes/chapters; comics issues/collections/arcs; graphic novels editions; webcomics seasons/chapters; mixed with manual override.
- Continue Reading only represents exact local-reader or confirmed imported progress.
- Main order: command deck, new updates, continue reading, active reading, letting it cook, owned, complete library; Recommendations remains a dedicated scope.
- Series pages expose reading state, adaptive release navigator, release cards, history, sources, metadata, and notes.
- Intake is automatic for high-confidence matches. Low-confidence identity and metadata conflicts remain isolated for later review.
- Artwork may be provisional without interrupting intake; existing approved artwork is never replaced automatically.
- Ownership is tracked independently as physical, local digital, Kindle/account, and other digital, at series and release level.
- Monitoring defaults to Reading, Letting It Cook, and Favorites. Planned, Paused, Dropped, and publication-complete records are excluded unless explicitly forced.
- Recommendations use Comics/Manga activity first and broader Vault interests second. Dismissals remain authoritative.
- Collections are virtual views over canonical series records.
- Manual metadata is authoritative; imports fill missing fields and record conflicts/provenance.

## Reader reference review

Reference implementations reviewed before architecture:

- Kavita: separate single, double, reversed-double, and infinite-scroll renderers; page offsets; page splitting; persisted reading profiles.
- Komga: separate paged and continuous readers with direction and progress state.
- epub.js: rendition managers, paginated/scrolled flow, relocated location events, stable percentage/CFI positions, resize-aware layout.
- PDF.js: explicit PDF parsing and page rendering instead of relying on a generic browser frame.

Patterns adopted:

- Separate mode-specific rendering paths.
- Stable progress identity based on source page/location, not transient layout columns.
- Explicit RTL and spread offset.
- Continuous/webtoon buffering and visible-page progress.
- Wide-page detection and optional splitting.
- Resize reflow that preserves the current logical location.
- Per-series reader settings with safe defaults.

## Delivery blocks

1. V2 data compatibility and adaptive library/series UI.
2. High-confidence intake, metadata authority, uncertainty queues, and artwork review integration.
3. Reader renderer separation and format-specific navigation.
4. Release checks and recommendation grounding.
5. Regression, import, reader, artwork, resize, and data-preservation QA.

## Verified baseline

- V2 compatibility migration preserves existing records and adds adaptive structure, ownership, metadata authority, artwork review state, and monitoring overrides.
- Operational shelves are live for New Updates, Continue Reading, Active Reading, Letting It Cook, Owned, Smart Collections, and Needs Identification.
- Series pages provide adaptive release labels, structure override, four-part ownership, and protected manual metadata editing.
- Comic archives support single page, two-page spread, continuous strip, and webtoon modes; RTL, lazy loading, restored-page positioning, fit settings, keyboard/click navigation, fullscreen, and resize recentering are active.
- Manual folder intake reads embedded EPUB/ComicInfo metadata first, groups matching comic issues, skips duplicate paths, remembers unchanged files, and isolates only uncertain identities.
- Recommendation input includes favorites, active, cooking, and completed series as primary signals, with broader Vault interests secondary.
- Validation passed for 104 JavaScript modules and the Python host.
- Automated QA passed for V2 migration/UI, manual metadata authority, CBR/CBZ/EPUB automatic intake, duplicate handling, issue grouping, RTL spreads, continuous/webtoon rendering, and horizontal overflow.

## Later depth work

- Optional wide-page half splitting and configurable spread cover offset.
- Rich issue/collection/story-arc hierarchy when verified source data supplies those relationships.
- Virtual collection pin/hide/merge controls beyond the current open and rename behavior.
