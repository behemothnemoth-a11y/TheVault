# Stage 2 — Archive Workbench Acceptance

Stage 2 turns the recovered archive into something that can be maintained safely without editing JSON by hand.

## Required outcomes

1. A dedicated Workbench page appears in the Vault navigation.
2. The Workbench reports metadata coverage for the entire archive.
3. Records can be searched and filtered by wing, status, and missing metadata.
4. A record editor can change title, year, genres, description, personal note, ownership, and artwork without changing its immutable Vault ID.
5. Every metadata edit writes a reversible change-log entry.
6. A recent metadata edit can be undone from the Workbench.
7. Poster images can be selected locally, copied into `assets/artwork`, and attached to a record.
8. Poster intake accepts only validated image data and never overwrites an existing file.
9. Pending recovery decisions can be searched, selected, and resolved in guarded batches.
10. Every batch review action creates a protected snapshot before it changes archive state.
11. Stage 1 episode launching, individual episode editing, persistence, snapshots, and review decisions continue to work.
12. The Stage 2 health check validates change-log and batch references in addition to Stage 1 integrity.
13. Isolated runtime tests complete with zero health issues.

## Safety defaults

- Nothing is enriched automatically.
- Stable item and episode IDs remain immutable.
- Unknown properties survive edits and migrations.
- Artwork is stored locally by default.
- Bulk review actions operate only on explicitly selected records.
- A selected record whose type is incompatible with a batch action is skipped.
- Protected snapshots remain outside automatic pruning.
