# Games v3 — agreed design

Decided 2026-09-12. This is the shape the Games wing should take; it supersedes the
parts of [games-v2-build.md](games-v2-build.md) it contradicts and leaves the rest
(safety contract, import review, artwork approval) standing.

## What HOME is

**What I'm playing now, with my library underneath.** One page, one card style.

1. **Playing now** — games at status `playing` (2 today), largest cards, with last-played
   and a launch button.
2. **Library**, in sections, same card style throughout:
   - Owned · installed (13) — playable right now
   - Owned · not installed (24) — owned, needs a download
   - Played, not owned (1)
   - **Wishlist (39) — last section on the page**

Wishlist stays at the bottom of Library rather than being scattered through it, and
FUTURE GAMES keeps its own full view with filters.

## Cards

- Artwork-forward, the existing `games2-card` shape.
- **Series cards**: when a franchise holds more than one game, the cards collapse into
  one card that opens to the entries. Today that is Borderlands (2), Fallout (2),
  Resident Evil (2), Minecraft (2) — 8 games into 4 cards, 71 standalone. The value
  grows with the library, so grouping is derived from the title (sequel numbers, roman
  numerals and edition words stripped) and can be corrected by hand.
- Each card shows install state and, where known, recorded hours and last played.

## Launching

The card launches the game:

- Installed → `steam://rungameid/<appId>`
- Owned, not installed → `steam://install/<appId>`

This needs its own endpoint that accepts a numeric Steam app id and nothing else — the
existing `/__vault/open` only accepts video files on D:, so it cannot be reused.

## Knowing what you own

The Vault reads local Steam files today: `appmanifest_*.acf` for installed games (18
across `C:\Program Files (x86)\Steam` and `D:\SteamLibrary`) and `localconfig.vdf` for
playtime and last-played. That covers the 37 games this PC has seen.

Games owned but never installed here are invisible to that. **Decision: use a Steam Web
API key.** You get a free key at `steamcommunity.com/dev/apikey` and paste it into the
Vault's own setup dialog — the same pattern as the TMDB token, stored in `data/private`
and never shown in chat or committed. With the key the Vault can call
`IPlayerService/GetOwnedGames` to list the full library with playtime.

Rules that stay: the call is manual and button-driven, never automatic; results enter
Import Review rather than being added silently; artwork stays approval-gated.

## Beyond Steam

Other PC launchers matter — Epic, GOG, Battle.net, itch, emulators. The discovery code
already has hooks for Epic manifests and Minecraft profiles that were never wired up or
tested. Console and physical collections are out of scope.

## Game detail — cut back

Keep:

- **Rating and a personal note**
- **Playtime and last played** — recorded Steam hours and Vault-tracked time stay separate
- **DLC and add-ons owned**

Cut: playthroughs, milestones, versions/releases, memories/media, franchise filing as a
free-text field, and the dated opinion-history machinery. All are empty across all 79
games today.

Kept but not chosen explicitly: **relationship and play status controls**. The Library's
section split is built on them, so they have to be settable somewhere — they stay as
inline controls rather than a section of their own. Say the word if you'd rather set
status only from the card.

## The Workshop and the Projects room

The Games Workshop keeps **Minecraft builds and game-related work** (20 build records
plus the Minecraft projects: Slime Farm, Rocket Factory, A real storage system).

Five records are not game work and move to a **new Projects room** — things you're
making, whatever the medium:

- A physical media shelf build
- Cardboard schlock movie prop
- One drawing a week for a month
- Pixel-art of your own Vault icon
- The 26.2 migration itself

## Still open

Ideas worth a yes or no before building:

- **Play Next has an empty pool.** Its default scope is the explicit backlog and nothing
  is in it, so it can never suggest anything. Seeding it from owned-and-unplayed (24
  games) would make it work without you marking anything by hand.
- **Disk pressure.** Install sizes are already read from the manifests; a line like
  "13 installed · N GB" would show what is worth uninstalling.
- **Dormant games.** 25 games carry a real last-played date, so "untouched since 2019"
  is available without guessing.
- **Playtime refresh.** Re-reading `localconfig.vdf` on a button would update hours after
  you play, instead of the numbers freezing at import.
