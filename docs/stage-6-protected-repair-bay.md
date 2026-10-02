# Stage 6 — Protected Repair Bay

Completed 2026-07-29.

Only explicitly selected high-confidence proposals can be applied. Each operation creates a protected pre-repair snapshot and a complete before/after repair record.

Supported guarded actions:

- link an unlinked episode
- replace a missing path
- create a missing episode record
- retain an alternate file without replacing the canonical link

Every action can be rolled back. The acceptance test applied a real alternate-file proposal and rolled it back; all episode links returned byte-for-byte to their original values. Media files were never changed.

