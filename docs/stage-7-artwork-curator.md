# Stage 7 — Artwork Curator

Completed 2026-07-29.

The Curator analyzes a user-selected local image folder and matches JPG, PNG, and WebP filenames to stable Vault IDs or exact archive titles.

- ambiguous matches are refused
- unmatched images are left alone
- attachment requires an explicit button press
- a protected snapshot is created first
- Vault metadata attachment is reversible
- poster files are never moved or deleted
- no internet provider is required

The acceptance test confirmed exact stable-ID matching and ambiguity protection.

