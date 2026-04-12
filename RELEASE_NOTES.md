# v0.3.0

## Features
- **Photos and videos on events.** Attach jpg/jpeg/png/webp/gif/mp4/webm/mov files to any event via the file picker or drag-and-drop. Galleries render inline on the event detail page and surface transitively on the artist, venue, and location detail pages through the events they belong to. A fullscreen viewer handles both image browsing and video playback with prev/next navigation, delete, and a "Go to event" jump for cross-entity galleries.
- **Top Genres radar on the dashboard.** A new chart shows your top 8 genres aggregated from MusicBrainz tags on the artists you've seen. Each axis is a tag and the radius is the number of distinct attended events featuring an artist tagged with it, so a festival with five indie acts counts once for "indie" rather than five times. Tag casing is normalized so "Hip Hop" and "hip hop" merge into a single bucket.
- **CSV import preview.** Importing a CSV no longer commits the whole file blindly. Every parsed row opens in a preview dialog where each row is classified as Ok, Duplicate, Venue Conflict, or Parse Error with a checkbox so you can pick exactly which rows to import. Duplicates default unchecked, errors and conflicts render disabled with a tooltip explaining why, and a live counter shows how many rows you're about to commit.

## Improvements
- **Backups now include your media.** "Export Backup" produces a single zip bundling the database and the entire `media/` folder, preserving the on-disk layout so restore can swap both atomically. The export is written to a sibling `.part` file and atomically renamed on completion, so an interrupted export can never leave a half-written zip at the destination. Restore still accepts the legacy `.db`-only backups from earlier versions.
- **Galleries sort by capture time, not upload time.** Photos extract EXIF `DateTimeOriginal`; MP4/MOV files read the QuickTime `com.apple.quicktime.creationdate` metadata (with `mvhd.creation_time` as a fallback for non-Apple containers), so iPhone exports show up in the order they were actually shot. A Newest first / Oldest first toggle sits above each gallery.
- **Editing an event no longer triggers a full-database MusicBrainz scan.** The background genre fetch is now scoped — only newly-created artists trigger a lookup. Renaming an event, changing its date, or editing its venue is now a fast save, where previously every edit kicked off a sweep over every un-matched artist in the database.
- **Renaming an artist re-derives their MusicBrainz metadata.** Fixing a typo in an artist name clears the cached genre/tags/links and queues a targeted refetch so the corrected name pulls fresh data automatically.
- **Artist thumbnails in event lineups.** The lineup section on the event detail page now shows artist images inline so you can recognize who played at a glance.
- **Dashboard stat badges are clickable.** The artist badges on the upcoming-events row navigate to the artist's detail page on click.
- **List pages default to most-seen first.** Artists, Venues, and Locations now sort by event count descending by default instead of alphabetically — more useful at a glance for a long history.

## Fixes
- The setlist.fm API key field now correctly persists an empty value, so clearing the field actually removes the saved key (previously the empty value was ignored on blur).
- The event detail gallery's drag-and-drop listener no longer leaks across re-renders, fixing a bug where a single drop could upload the same file multiple times.

## Internal
- Three database migrations run automatically on first launch: v13 creates the `event_images` table, v14 renames it to `event_media` (and the on-disk `images/` folder to `media/`) to reflect the widened photos+videos feature, and v15 adds the `captured_at` column. Existing data is preserved exactly. The v14 filesystem rename runs before the SQL changes so a mid-migration failure leaves a recoverable state, and the next launch retries idempotently.
- Tauri's asset protocol is now scoped to the app data dir's `media/` subtree so the WebView can stream uploaded files directly without copying them through Rust.
- New Rust dependencies: `uuid` (filename generation), `zip` (backup bundling), `mime_guess` (file-type detection at upload), `kamadak-exif` (photo capture timestamps).
- New frontend dependency: `recharts` and the shadcn chart wrapper for the Top Genres radar.
