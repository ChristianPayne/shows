<p align="center">
  <img src="public/logo.png" alt="Shows" width="80" height="80" />
</p>

# Shows

Personal desktop app for tracking live music attendance. Import history from CSV, browse and filter events, manage artists/friends/venues/locations, view stats, and log new shows.

## Tech Stack

- **App Shell:** Tauri 2
- **Frontend:** React 19 + shadcn/ui + Tailwind CSS 4
- **Backend:** Rust (all business logic via Tauri commands)
- **Database:** SQLite via sqlx
- **Routing:** React Router (MemoryRouter)

## Features

- **Dashboard** with show totals, top artists/venues, most-seen-with friends, top genres radar, and shows per year/month
- **Events** — full CRUD, multi-day support (start/end dates), cancelled event tracking, free-form notes, friend tagging, drag-and-drop artist reordering, and a `Cmd/Ctrl+N` shortcut to start a new event from anywhere. Editing an event auto-saves as you change it (creating one uses an explicit, validated form). The list adds a faceted filter — by friends, artists, event name, venue, and location, with any/all (OR/AND) matching per facet — on top of free-text search, plus show/hide columns, and it remembers your search, sort, and filters when you leave the page and come back
- **Media attachments** — attach photos and videos (jpg/jpeg/png/webp/gif/mp4/webm/mov) to events via file picker or drag-and-drop. Galleries render inline on event pages and surface transitively on artist/friend/venue/location detail pages through the events they belong to. Sort by capture time (EXIF `DateTimeOriginal` for photos, QuickTime metadata or `mvhd` creation time for videos) or upload time, with a fullscreen viewer that handles both image and video playback — images scroll/pinch to zoom and drag to pan.
- **Media tab** — top-level gallery of every photo and video across all events, grouped by event with clickable section headers that jump to the event. Filter by All / Photos / Videos.
- **Artists** — rename, merge duplicates, b2b set grouping, and per-artist profile pages. Tags are user-curated: type your own or pick from MusicBrainz suggestions (already-known suggestions are flagged and float to the front), with genre-colored chips and a "similar artists" list driven by shared tags. Filter the artist list by tag chips with deep-linkable URLs (`?tag=`). A seeded list of common genres backs the suggestions and is editable in **Settings → Data**.
- **Friends** — tag who you attended each show with; per-friend pages list the shows you saw together. Add friends as chips on the event form or create them standalone from the Friends page; rename, and delete when they have no events
- **Venues** — rename, merge duplicates; the same venue name can exist in different cities (e.g., "The Independent" in SF and Austin are tracked as distinct venues)
- **Locations** — city/state, rename, merge duplicates
- **Command palette** — global search across events, artists, friends, venues, and locations (`Cmd/Ctrl+K`); venue search matches against city and state too
- **CSV import/export** — auto-detects delimiter, handles b2b artists, preserves grouping on export, append-only with deduplication on (name, date, venue). Import opens a per-row preview where every row is classified as Ok / Duplicate / Venue Conflict / Parse Error so you can pick exactly which rows to commit, instead of importing the whole file blindly.
- **Backup/restore** — full backup bundles the database and all media into a single zip via native file dialogs, written atomically so an interrupted export never leaves a half-written file at the destination. Restore swaps both the database and the media tree with rollback on failure, and still accepts pre-v0.3 `.db`-only backups. Restore refuses backups created by a newer version of the app, so a backup from a future install won't silently corrupt an older one.
- **Dark mode** — system default with manual toggle, persisted
- **Accent colors** — 8 presets plus custom colors you add yourself, persisted
- **Streamer Mode** — a persisted **Settings** toggle that masks friends' names to first-name-only so sharing your screen on stream doesn't reveal who you go to shows with. Only friends are masked; artists, venues, events, and locations stay intact. Names are masked before they ever reach the screen, and adding friends to events keeps working as normal (friend renaming is disabled while it's on)
- **Autocomplete** — venue, city, state, artist, and friend fields suggest existing entities
- **Changelog** — click the version in the status bar to read what changed in each release; the history is bundled with the app, no network needed
- **Auto-updater** — built-in update checking with one-click install from either the in-app banner or **Settings → Updates**, with inline download progress and error reporting

## External integrations

Both are optional — the app works without either.

- **setlist.fm** — fetches setlists for past events on the event detail page. Requires a free API key from [setlist.fm/settings/api](https://www.setlist.fm/settings/api), entered in **Settings → API Keys**.
- **MusicBrainz** — looks up artist info (country, type, active years) and offers per-artist tag suggestions you apply by hand. No API key needed; the bulk metadata fetch lives at **Settings → Data → Fetch Artist Info**, and tag suggestions are pulled on each artist's page.

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
