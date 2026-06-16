# Changelog

All notable changes to the app, newest first. This file is bundled into the
build and shown in-app by clicking the version in the status bar.

## v1.1.1 — 2026-06-16
### Fixes
- **Streamer Mode no longer leaks names on the events page.** Friend names are now masked to first-name-only everywhere they appear — including the events list, where full names previously still showed while Streamer Mode was on.

## v1.1.0 — 2026-06-16
### Features
- **Streamer Mode.** A new toggle in Settings that masks your friends' names down to their first name only, so sharing your screen on stream doesn't reveal who you go to shows with. Only friends are masked — artists, venues, events, and locations stay fully visible. Turning it on is instant; turning it off asks for confirmation first, so a stray click can't reveal names mid-stream. While it's on, renaming a friend is paused, but adding friends to events keeps working as usual.

## v1.0.0 — 2026-06-14
### Features
- **Faceted event filtering.** Filter the events list by friends, artists, event name, venue, and location — with any/all (OR/AND) matching per facet — on top of the existing free-text search. You can also show/hide columns, and the list remembers your search, sort, and filters when you leave the page and come back.
- **Auto-save when editing an event.** Edits save as you make them, with a quiet "Saved" indicator — no more Update button. (Creating a new event still uses an explicit, validated form.)
- **User-curated artist tags.** Tags are now a deliberate choice: type your own or pick from MusicBrainz suggestions on each artist's page. Tags drive a new "similar artists" list — other artists you've seen that share tags — and a seeded list of common genres backs the suggestions, editable in Settings → Data.
- **Genre-colored tags.** Tag chips are colored by genre, so you can read your taste at a glance.
- **Custom accent colors.** Add your own accent color in Settings, alongside the built-in presets.
- **Quicker friend adding.** Add a friend from a three-dots menu and a small dialog, replacing the always-on inline input.
### Improvements
- Autocomplete fields (venue, city, state, artists, friends, and the new filters) now behave as comboboxes: focus to see every option, the top match is preselected, and Enter adds it — no separate "+" button.
- MusicBrainz tag suggestions you already use are outlined and sorted to the front, so reusing an existing tag is easy.
- The `Cmd/Ctrl+K` command palette auto-selects the top result — search and just hit Enter.
- Inputs no longer trigger the macOS autofill and spellcheck prompts.
### Notes
- **Tags reset on upgrade.** Because tags are now something you curate rather than auto-fetched genres, this release clears the previously auto-applied tags/genres on first launch. Re-add tags to your artists from the suggestions (or type your own); the rest of each artist's info (country, type, links) is untouched.

## v0.6.0 — 2026-06-09
### Features
- **Friends** — track who you attended each show with. Add friends as chips when creating or editing an event, see them on the event page, and open a friend's page to browse every show you saw together. The Friends area supports search, sorting, renaming, and deleting, plus adding a friend on their own without tagging an event.
- **Event notes** — jot free-form notes on any event (who you went with, standout sets, travel details) and read them back on the event page.
- **"Most Seen With" chart** — the dashboard now ranks the friends you've been to the most shows with.
### Improvements
- Press **Cmd/Ctrl+N** to start a new event from anywhere in the app.
- Search now matches friends too, in both the command palette and the events search box.
- New **Neon Pink** accent color.

## v0.5.0 — 2026-04-13
### Features
- **Install updates directly from Settings.** The "Check for Updates" button now drives the full install flow — checking, download progress, and error states all surface in-place. Previously you had to find the in-app banner; now Settings is a first-class install path. Both surfaces share the same state machine, so they always agree on what's happening.
### Improvements
- **Consistent list page styling.** The Artists, Venues, and Locations pages now use the same Table primitives as the rest of the app, so headers, rows, and empty states match. Each page also gets an explicit "No <entity> found" empty state.
- **Cleaner artist rows on event detail pages.** Clicking an artist name now jumps straight to the artist page — no more competing with the setlist fetch. The setlist button has moved to a dedicated side action, and fetched songs reveal in an expand strip below the row that opens automatically on a successful fetch.
### Internal
- All search, filter, sort, and aggregation logic moved out of TypeScript and into Rust. Every list page, the command palette, and the dashboard now query Rust commands directly instead of post-processing fetched data client-side. Behavior is identical from your perspective — the win is that there's now exactly one place where each rule lives, instead of subtly-different copies in two languages.
- TypeScript bindings are now auto-generated from Rust signatures via `tauri-specta`. Adding a new command no longer requires three coordinated edits across two languages — the Rust function is the only source of truth, and the bindings file regenerates on `cargo test`.

## v0.4.0 — 2026-04-13
### Features
- **Media tab.** A new top-level Media page (sidebar) shows every photo and video across your entire library in one chronological gallery, grouped by event. Each event becomes a section with a clickable header that jumps straight to the event detail page, and a segmented filter narrows the view to All, Photos, or Videos. Tile clicks open the existing fullscreen viewer with prev/next navigation across the whole filtered set, and the viewer's "Go to event" button works from here too — three independent ways to land on the event behind a photo.
- **Filter artists by tag.** The Artists list now shows a row of tag chips sourced from MusicBrainz tags on your artists, with frequency counts. Click a chip to filter the list to artists carrying that tag; click more to broaden the match (multi-select uses OR semantics). A "Show all" expand reveals the full set when there are more than ~20. Selected chips are pinned to the front of the row so they never hide behind the collapse, and a clear button resets the selection.
- **Clickable tag pills on artist detail pages.** The MusicBrainz tag pills under each artist's name are now buttons — click one to jump to the Artists list pre-filtered by that tag. The selection lives in the URL (`?tag=`), so the deep link is shareable and survives back/forward navigation.
### Fixes
- **Merging an artist, venue, or location no longer redirects you to the index list.** Previously, completing a merge bounced you back to `/artists` (or `/venues`, `/locations`) even though the kept entity still existed and you were already on its detail page. Merges now refresh the data in place and leave you exactly where you were.
- **Case-insensitive matching when creating artists, venues, and locations.** Typing "phish" no longer creates a duplicate row when "Phish" already exists — the `find_or_create` lookups for all three entity types now compare with `COLLATE NOCASE`, so "San Francisco" / "san francisco" and "Pier 80" / "PIER 80" resolve to the existing record. The CSV import preview's conflict detection uses the same case-insensitive comparison so its classifications match what the actual import will do.
- **Merge dialog and event-form artist autocomplete now match case-insensitively.** Typing a different casing of an existing artist no longer leaves the Merge button disabled, and adding an artist to an event in a different case now snaps to the canonical spelling of the existing artist instead of creating a visually-different pill that the backend would silently dedupe on save.
### Improvements
- **Wider scrollbars.** The webkit scrollbar bumped from 6px to 10px (4px → 5px corner radius) for a more comfortable click target.
### Internal
- New `db::tags` Rust module — a single boundary for "what tags does an artist have". Today it parses the MusicBrainz CSV stored in `artists.tags`; when user-authored custom tags arrive in a future release, the merge happens behind this module and no call site has to change. `ArtistWithCount` now carries `tags: Vec<String>` (cleaned, source-agnostic) instead of leaking the CSV. The existing Top Genres radar aggregator was refactored to share the same CSV splitter, so there's one source of truth for tag parsing.
- New Rust command `get_all_media` — the backing query for the Media tab. Mirrors `get_media_for_events` without the id filter and reuses the same capture-time sort, so the new gallery's grouping order matches what per-event galleries already render.

## v0.3.0 — 2026-04-12
### Features
- **Photos and videos on events.** Attach jpg/jpeg/png/webp/gif/mp4/webm/mov files to any event via the file picker or drag-and-drop. Galleries render inline on the event detail page and surface transitively on the artist, venue, and location detail pages through the events they belong to. A fullscreen viewer handles both image browsing and video playback with prev/next navigation, delete, and a "Go to event" jump for cross-entity galleries.
- **Top Genres radar on the dashboard.** A new chart shows your top 8 genres aggregated from MusicBrainz tags on the artists you've seen. Each axis is a tag and the radius is the number of distinct attended events featuring an artist tagged with it, so a festival with five indie acts counts once for "indie" rather than five times. Tag casing is normalized so "Hip Hop" and "hip hop" merge into a single bucket.
- **CSV import preview.** Importing a CSV no longer commits the whole file blindly. Every parsed row opens in a preview dialog where each row is classified as Ok, Duplicate, Venue Conflict, or Parse Error with a checkbox so you can pick exactly which rows to import. Duplicates default unchecked, errors and conflicts render disabled with a tooltip explaining why, and a live counter shows how many rows you're about to commit.
### Improvements
- **Backups now include your media.** "Export Backup" produces a single zip bundling the database and the entire `media/` folder, preserving the on-disk layout so restore can swap both atomically. The export is written to a sibling `.part` file and atomically renamed on completion, so an interrupted export can never leave a half-written zip at the destination. Restore still accepts the legacy `.db`-only backups from earlier versions.
- **Galleries sort by capture time, not upload time.** Photos extract EXIF `DateTimeOriginal`; MP4/MOV files read the QuickTime `com.apple.quicktime.creationdate` metadata (with `mvhd.creation_time` as a fallback for non-Apple containers), so iPhone exports show up in the order they were actually shot. A Newest first / Oldest first toggle sits above each gallery.
- **Editing an event no longer triggers a full-database MusicBrainz scan.** The background genre fetch is now scoped — only newly-created artists trigger a lookup. Renaming an event, changing its date, or editing its venue is now a fast save, where previously every edit kicked off a sweep over every un-matched artist in the database.
- **Renaming an artist re-derives their MusicBrainz metadata.** Fixing a typo in an artist name clears the cached genre/tags/links and queues a targeted refetch so the corrected name pulls fresh data automatically.
- **Artist thumbnails in event lineups.** The lineup section on the event detail page now shows artist images inline so you can recognize who played at a glance.
- **Dashboard stat badges are clickable.** The artist badges on the upcoming-events row navigate to the artist's detail page on click.
- **List pages default to most-seen first.** Artists, Venues, and Locations now sort by event count descending by default instead of alphabetically — more useful at a glance for a long history.
### Fixes
- The setlist.fm API key field now correctly persists an empty value, so clearing the field actually removes the saved key (previously the empty value was ignored on blur).
- The event detail gallery's drag-and-drop listener no longer leaks across re-renders, fixing a bug where a single drop could upload the same file multiple times.
### Internal
- Three database migrations run automatically on first launch: v13 creates the `event_images` table, v14 renames it to `event_media` (and the on-disk `images/` folder to `media/`) to reflect the widened photos+videos feature, and v15 adds the `captured_at` column. Existing data is preserved exactly. The v14 filesystem rename runs before the SQL changes so a mid-migration failure leaves a recoverable state, and the next launch retries idempotently.
- Tauri's asset protocol is now scoped to the app data dir's `media/` subtree so the WebView can stream uploaded files directly without copying them through Rust.
- New Rust dependencies: `uuid` (filename generation), `zip` (backup bundling), `mime_guess` (file-type detection at upload), `kamadak-exif` (photo capture timestamps).
- New frontend dependency: `recharts` and the shadcn chart wrapper for the Top Genres radar.

## v0.2.0 — 2026-04-12
### Features
- Venues now belong to a specific city. The same venue name can exist in multiple cities (e.g., "The Independent" in SF and Austin) and they're tracked as distinct venues.
- Venue search in the command palette and on the Venues page now matches city and state, not just venue name.
- The Venues page and venue detail header now show city and state alongside the venue name.
- Restoring a backup from a newer version of the app is now blocked with a clear error, so a backup from a future install can't silently corrupt an older one.
- The footer now shows the database schema version next to the app version.
### Improvements
- Sidebar navigation is now flat — Dashboard, Events, Artists, Venues, and Locations are all top-level instead of Artists/Venues/Locations being nested under Events.
- Adding or editing an event now auto-fills the city and state when you pick an existing venue. If the same venue name exists in multiple cities, the form prompts you to disambiguate instead of guessing.
- CSV import is now strict about venue locations: if a row mentions a venue that already exists in a different city, the import stops and tells you which row so you can fix the data and retry.
### Internal
- Schema migration v12 reshapes the database so venues own their location instead of events. The migration runs automatically on first launch and is fully transparent — no user action required. Existing data is preserved exactly.
- Cleaned up accumulated clippy lints across the Rust codebase.

## v0.1.1 — 2026-04-12
### Improvements
- Added a quick "Add Event" button (`+`) to the sidebar header for one-click event creation.
- Moved the light/dark mode toggle into Settings, alongside the accent color picker.
### Internal
- Release workflow now publishes directly instead of creating a draft.
- Release notes are now sourced from `RELEASE_NOTES.md` so each release page reflects what actually changed.

## v0.1.0 — 2026-04-12
- Initial release.
