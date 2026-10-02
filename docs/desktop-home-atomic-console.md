# Desktop Home - Atomic Console

Checkpoint date: August 25, 2026  
Schema: 42 (unchanged)

## Product decision

Home is now a dedicated desktop control console rather than another generic Vault grid. The visual language is an original atomic-age bunker terminal: aged olive metal, brass controls, phosphor panels, restrained scanlines, and physical console framing. It is inspired by retro-futurist survival interfaces without copying franchise artwork, logos, mascots, or screen layouts.

Mobile optimization is intentionally out of scope. The desktop shell has a deliberate minimum width of 1180 pixels so the navigation rail, primary archive screen, and daily briefing remain one coherent instrument panel.

## What Home does

- Puts Tonight at the top as the primary daily action.
- Shows four real Continue Watching cards from owned television, with direct local episode playback when a file is available.
- Shows four cross-interest suggestions grounded in the local archive.
- Reuses the Life Dashboard time and energy preferences instead of creating Home-only settings.
- Shows current focus areas and two next actions from the Daily Desk.
- Keeps archive health, recent activity, record totals, poster coverage, and local storage visible.
- Provides direct routes to Home, Life Dashboard, Tonight, Today, TV, Games, Movies, Books, Control Room, Workbench, Settings, and the command palette.
- Restores the established Vault shell as soon as the user leaves Home.

## Safety and data boundaries

- Schema and archive records are unchanged.
- No media files are modified.
- Episode playback still passes through the existing local launcher boundary.
- Artwork remains local; Home makes no external image requests.
- Recommendations remain explainable and grounded in existing Vault data.

## Acceptance evidence

`tests/atomic-home-desktop.cjs` verifies the Home takeover at 1440 x 1000, eight navigation rooms, four Continue Watching cards, valid local playback paths, four cross-interest cards, two next actions, shared time-preference updates, shell restoration on Games, no desktop overflow, and no page, HTTP, or external-request errors.

The TV ownership/history, both artwork, and Games acceptance suites also pass. Verified archive facts remain 3,543 records, 142 owned TV series, 568 imported watched episodes, 33 imported episode notes, 43 legacy rating-review flags, and 42 locally served TV posters.

Visual baseline: `tests/atomic-home-desktop.png`  
Concept source: `docs/concepts/vault-homepage-atomic-terminal-v1.png`

## Known deliberate limits

- Home is desktop-only for this phase.
- It is a new front door, not a redesign of every wing; TV, Games, Today, and specialist rooms retain their existing shells.
- Empty poster slots remain honest archive gaps rather than invented artwork.
