# v0.5.0

## Features

- **Install updates directly from Settings.** The "Check for Updates" button now drives the full install flow — checking, download progress, and error states all surface in-place. Previously you had to find the in-app banner; now Settings is a first-class install path. Both surfaces share the same state machine, so they always agree on what's happening.

## Improvements

- **Consistent list page styling.** The Artists, Venues, and Locations pages now use the same Table primitives as the rest of the app, so headers, rows, and empty states match. Each page also gets an explicit "No <entity> found" empty state.
- **Cleaner artist rows on event detail pages.** Clicking an artist name now jumps straight to the artist page — no more competing with the setlist fetch. The setlist button has moved to a dedicated side action, and fetched songs reveal in an expand strip below the row that opens automatically on a successful fetch.

## Internal

- All search, filter, sort, and aggregation logic moved out of TypeScript and into Rust. Every list page, the command palette, and the dashboard now query Rust commands directly instead of post-processing fetched data client-side. Behavior is identical from your perspective — the win is that there's now exactly one place where each rule lives, instead of subtly-different copies in two languages.
- TypeScript bindings are now auto-generated from Rust signatures via `tauri-specta`. Adding a new command no longer requires three coordinated edits across two languages — the Rust function is the only source of truth, and the bindings file regenerates on `cargo test`.
