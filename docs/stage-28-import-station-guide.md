# Import Station Guide

The Import Station adds records without replacing the Vault.

## Use it

1. Open **Import Station** from the Systems section.
2. Leave the source on **Auto-detect**, or choose the matching wing if the export uses unusual column names.
3. Choose a JSON, CSV, TSV, or ICS file.
4. Review the scan manifest.
5. Select **Import new records** only when the manifest looks right.

The original export remains on disk and is never copied into the Vault save.

## Supported intake

| Source | Common contents | Formats |
| --- | --- | --- |
| YouTube | watch title, video URL or ID, channel, time | JSON, CSV, TSV |
| Music | track, artist, album, URI, played time; common Spotify history fields are recognized | JSON, CSV, TSV |
| Podcasts | episode, show, creator, URL, listened time | JSON, CSV, TSV |
| Books | title, author, rating, status, ISBN, date read, shelves | JSON, CSV, TSV |
| Manga | title, author, series, status, volume or chapter fields | JSON, CSV, TSV |
| Food | dish, recipe or restaurant, chef, place, date | JSON, CSV, TSV |
| Trips | trip, destination or place, journey, visit date | JSON, CSV, TSV |
| Calendar | event title, start, location, organizer | JSON, CSV, TSV, ICS |

## What the scan does

- collapses repeated activity rows for the same source ID into an occurrence count
- preserves an existing Vault record instead of overwriting it
- separates source dates from canonical reconstructed Vault activity
- previews warnings, conflicts, new records, and repeated rows before any write
- creates people, franchise, and place links when the export contains supporting fields

## Rollback

Every committed batch creates a protected snapshot first. The import ledger can roll back a live batch. Rollback removes records and links owned by that batch, safely closes later manual links to those records, and preserves historical audit events without leaving orphan references.

The exact same export cannot be applied twice while its first batch is active.
