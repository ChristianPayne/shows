# Shows

Personal desktop app for tracking live music attendance. Import history from CSV, browse and filter events, manage artists/venues/locations, view stats, and log new shows.

## Tech Stack

- **App Shell:** Tauri 2
- **Frontend:** React 19 + shadcn/ui + Tailwind CSS 4
- **Backend:** Rust (all business logic via Tauri commands)
- **Database:** SQLite via sqlx
- **Routing:** React Router (MemoryRouter)

## Features

- **Dashboard** with show totals, top artists/venues, top genres radar, and shows per year/month
- **Events** — full CRUD, multi-day support (start/end dates), cancelled event tracking, drag-and-drop artist reordering, form validation
- **Media attachments** — attach photos and videos (jpg/jpeg/png/webp/gif/mp4/webm/mov) to events via file picker or drag-and-drop. Galleries render inline on event pages and surface transitively on artist/venue/location detail pages through the events they belong to. Sort by capture time (EXIF `DateTimeOriginal` for photos, QuickTime metadata or `mvhd` creation time for videos) or upload time, with a fullscreen viewer that handles both image and video playback.
- **Media tab** — top-level gallery of every photo and video across all events, grouped by event with clickable section headers that jump to the event. Filter by All / Photos / Videos.
- **Artists** — rename, merge duplicates, b2b set grouping, per-artist profile pages with genres and tags. Filter the artist list by tag chips, with deep-linkable URLs (`?tag=`) and clickable tag pills on detail pages that jump back to the filtered list.
- **Venues** — rename, merge duplicates; the same venue name can exist in different cities (e.g., "The Independent" in SF and Austin are tracked as distinct venues)
- **Locations** — city/state, rename, merge duplicates
- **Command palette** — global search across events, artists, venues, and locations (`Cmd/Ctrl+K`); venue search matches against city and state too
- **CSV import/export** — auto-detects delimiter, handles b2b artists, preserves grouping on export, append-only with deduplication on (name, date, venue). Import opens a per-row preview where every row is classified as Ok / Duplicate / Venue Conflict / Parse Error so you can pick exactly which rows to commit, instead of importing the whole file blindly.
- **Backup/restore** — full backup bundles the database and all media into a single zip via native file dialogs, written atomically so an interrupted export never leaves a half-written file at the destination. Restore swaps both the database and the media tree with rollback on failure, and still accepts pre-v0.3 `.db`-only backups. Restore refuses backups created by a newer version of the app, so a backup from a future install won't silently corrupt an older one.
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

The database and media files live under the app's data directory:

- **macOS:** `~/Library/Application Support/com.christianpayne.shows/`
  - `shows.db` — primary SQLite database
  - `media/` — uploaded photos and videos, one folder per event
