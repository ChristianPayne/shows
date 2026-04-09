# Live Music Attendance Tracker — Requirements Document

## Overview

A personal desktop app for tracking live music attendance history. Import existing data from CSV, browse and filter past events, view stats, and add new shows via a form. Built as a Tauri app with a React/Tailwind frontend and Rust/SQLite backend.

---

## Data Model

### Entities

**Event**
- `id` (primary key)
- `name` (e.g., "Portolla 2025")
- `date` (date of the show)
- `venue_id` (foreign key -> Venue)
- `location_id` (foreign key -> Location)
- `created_at`, `updated_at`

**Artist**
- `id` (primary key)
- `name` (e.g., "LCD Soundsystem")
- `created_at`

**Venue**
- `id` (primary key)
- `name` (e.g., "Pier 80")
- `created_at`

**Location**
- `id` (primary key)
- `city` (e.g., "San Francisco")
- `state` (e.g., "CA")
- `created_at`
- Unique constraint on (`city`, `state`)

**EventArtist** (join table)
- `event_id` (foreign key -> Event)
- `artist_id` (foreign key -> Artist)
- Primary key on (`event_id`, `artist_id`)

### Relationships
- Event -> Venue: many-to-one
- Event -> Location: many-to-one
- Event <-> Artist: many-to-many via EventArtist
- Location is its own entity -- enables browsing/filtering by city/state and clean FK relationships

---

## Tech Stack

| Layer       | Choice                          |
|-------------|---------------------------------|
| App shell   | Tauri                           |
| Frontend    | React + shadcn/ui + Tailwind CSS|
| Backend     | Rust (Tauri commands)           |
| Database    | SQLite via sqlx                 |
| Migrations  | sqlx migrations                 |

### Architecture Boundary

**Rust owns all logic.** The Rust backend handles:
- All database queries and mutations
- CSV parsing and import logic
- Find-or-create entity resolution
- Stats computation
- Backup file operations
- Data validation

**TypeScript is display-only.** The React/TS frontend:
- Calls Tauri commands (`invoke`) to fetch data and trigger actions
- Renders the results using shadcn/ui components (tables, forms, dialogs, comboboxes, etc.) with Tailwind for custom styling
- Manages UI state (filters, sort order, form inputs) but delegates all data operations to Rust
- No direct database access, no business logic

---

## Features

### 1. CSV Import (one-time)

- Parses tab-delimited CSV with headers: `Date`, `Event`, `Artists`, `Venue`, `Location`
- Artists are comma-separated within the `Artists` column
- Location is split into city and state (expects "City, ST" format)
- For each row:
  - Parse location into city and state, find or create the Location
  - Find or create the Venue by name
  - Find or create each Artist by name
  - Create the Event, linking venue, location, and artists via EventArtist
- Runs as a single transaction for consistency — if any row fails, the entire import is rolled back
- On malformed row: stop the import, roll back the transaction, and display a shadcn alert showing the problematic row and error detail
- Accessible from the UI (e.g., a settings/import page), but designed as a one-time migration tool

### 2. Browse Views

**Events List (main view)**
- Table of all events, sorted by date (newest first by default)
- Columns: date, event name, artists, venue, location
- Filtering by: artist, venue, date range, location (city/state)
- Sortable columns
- Click an event to see full detail (all artists, venue, location)

**Artists List**
- All artists, sortable by name or event count
- Click an artist to see all events they appeared at

**Venues List**
- All venues, sortable by name or event count
- Click a venue to see all events held there

**Locations List**
- All locations (city, state), sortable by name or event count
- Click a location to see all events in that city/state

### 3. Edit and Delete

**Edit Event**
- Accessible from the event detail view
- All fields are editable: date, name, venue, location, artists
- Same find-or-create logic as the add form (changing a venue name creates or links a new venue)

**Delete Event**
- Accessible from the event detail view with a confirmation dialog
- Deletes the event and its EventArtist links
- Does not delete the associated artists, venues, or locations (they may be linked to other events)

### 4. Add Event Form

- Fields: date, event name, venue, location (city, state), artists (multi-entry)
- Venue input: autocomplete against existing venues, or type a new name to create one
- Location input: autocomplete against existing locations, or type new city/state to create one
- Artist input: add multiple artists, each with autocomplete against existing artists or free-type for new
- On submit:
  - Find or create Location by (city, state)
  - Find or create Venue by name
  - Find or create each Artist by name
  - Create Event, linking venue, location, and all artists
- Validation: date required, event name required, at least one artist

### 5. Stats Dashboard

- **Total shows attended** -- count of events
- **Most-seen artists** -- top N artists by event count
- **Most-visited venues** -- top N venues by event count
- **Shows per year** -- bar chart or list
- **Shows per month** -- bar chart or list (aggregated across years, or per-year breakdown)

### 6. Backup and Restore

**Backup**
- "Export Backup" button that copies the SQLite database file to a user-chosen directory with a timestamped filename (e.g., `shows_backup_2026-04-09T12-00-00.db`)
- Uses Tauri's file dialog for save location

**Restore**
- "Restore from Backup" button that lets the user select a `.db` file via Tauri's file dialog
- Replaces the current database with the selected backup
- Confirmation dialog warning that this will overwrite all current data

---

## Navigation Structure

```
Sidebar or top nav:
  - Events (main view, default)
  - Artists
  - Venues
  - Locations
  - Stats
  - Add Event
  - Settings (CSV import, backup)
```

---

## Verification

- Import sample CSV, confirm events/artists/venues/locations created correctly in browse views
- Add a new event via form with a mix of existing and new artists/venues, confirm entities created/linked
- Test filters and sorting on events list
- Verify stats match expected counts
- Run backup, confirm .db file is written with correct timestamp
