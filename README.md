# Shows

Personal desktop app for tracking live music attendance. Import history from CSV, browse and filter events, manage artists/venues/locations, view stats, and log new shows.

## Tech Stack

- **App Shell:** Tauri 2
- **Frontend:** React 19 + shadcn/ui + Tailwind CSS 4
- **Backend:** Rust (all business logic via Tauri commands)
- **Database:** SQLite via sqlx
- **Routing:** React Router (MemoryRouter)

## Features

- **Dashboard** with show totals, top artists/venues, and shows per year/month
- **Events** — full CRUD, multi-day support (start/end dates), cancelled event tracking, drag-and-drop artist reordering, form validation
- **Artists** — rename, merge duplicates, b2b set grouping, per-artist profile pages with genres
- **Venues** — rename, merge duplicates; the same venue name can exist in different cities (e.g., "The Independent" in SF and Austin are tracked as distinct venues)
- **Locations** — city/state, rename, merge duplicates
- **Command palette** — global search across events, artists, venues, and locations (`Cmd/Ctrl+K`); venue search matches against city and state too
- **CSV import/export** — auto-detects delimiter, handles b2b artists, preserves grouping on export, append-only with deduplication on (name, date, venue). Import refuses to silently merge a venue name into a different city — conflicting rows are flagged so you can resolve them.
- **Backup/restore** — SQLite database copy with native file dialogs. Restore refuses backups created by a newer version of the app, so a backup from a future install won't silently corrupt an older one.
- **Dark mode** — system default with manual toggle, persisted
- **Accent colors** — 7 presets, persisted
- **Autocomplete** — venue, city, state, and artist fields suggest existing entities
- **Auto-updater** — built-in update checking with one-click install via the in-app banner

## External integrations

Both are optional — the app works without either.

- **setlist.fm** — fetches setlists for past events on the event detail page. Requires a free API key from [setlist.fm/settings/api](https://www.setlist.fm/settings/api), entered in **Settings → API Keys**.
- **MusicBrainz** — looks up genres for artists missing them. No API key needed; trigger from **Settings → Data → Fetch Genres**.

## Prerequisites

- [Rust](https://rustup.rs/)
- [Bun](https://bun.sh/)

## Development

```sh
bun install
bun tauri dev
```

## Build

```sh
bun tauri build
```

## Data

The SQLite database is stored at:

- **macOS:** `~/Library/Application Support/com.christianpayne.shows/shows.db`
