# Stage 30 — Grounded Vault Oracle

The Vault Oracle is a local, deterministic question engine. It does not call a cloud model, use an API key, search the internet, or fill gaps with invented facts.

## Open it

Choose **VAULT ORACLE** in the Systems navigation.

## Questions it can prove

- counts and lists by wing, genre, ownership, completion state, year, and rating
- episode counts, including watched/unwatched and linked/missing-file filters
- connections for an exact archive title
- named collection contents
- active real-data import summaries
- recent or title-specific canonical event history

Examples:

- `How many horror movies are in the archive?`
- `How many TV episodes are missing files?`
- `Show unfinished games before 2000`
- `What is connected to "Jurassic Park"?`
- `What have I imported?`
- `What happened recently?`

## Evidence contract

Every supported result returns structured citations. A citation identifies its source type, stable ID, exact path inside the Vault, and the fields used to support the answer.

Large result sets show up to 60 visible citations and clearly label that coverage as a sample. Counts are still calculated across the complete matching set.

If the Oracle cannot identify a supported intent or exact record, it returns `unsupported` or `insufficient`. It does not improvise an answer.

## Stored history

The latest 120 questions are kept in the local question ledger. Each entry stores the answer, confidence, facts, coverage, and up to 60 citations. Raw external prompts or cloud transcripts do not exist because no external service is used.

