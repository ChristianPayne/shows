# v0.4.0

## Features
- **Media tab.** A new top-level Media page (sidebar) shows every photo and video across your entire library in one chronological gallery, grouped by event. Each event becomes a section with a clickable header that jumps straight to the event detail page, and a segmented filter narrows the view to All, Photos, or Videos. Tile clicks open the existing fullscreen viewer with prev/next navigation across the whole filtered set, and the viewer's "Go to event" button works from here too — three independent ways to land on the event behind a photo.
- **Filter artists by tag.** The Artists list now shows a row of tag chips sourced from MusicBrainz tags on your artists, with frequency counts. Click a chip to filter the list to artists carrying that tag; click more to broaden the match (multi-select uses OR semantics). A "Show all" expand reveals the full set when there are more than ~20. Selected chips are pinned to the front of the row so they never hide behind the collapse, and a clear button resets the selection.
- **Clickable tag pills on artist detail pages.** The MusicBrainz tag pills under each artist's name are now buttons — click one to jump to the Artists list pre-filtered by that tag. The selection lives in the URL (`?tag=`), so the deep link is shareable and survives back/forward navigation.

## Fixes
- **Merging an artist, venue, or location no longer redirects you to the index list.** Previously, completing a merge bounced you back to `/artists` (or `/venues`, `/locations`) even though the kept entity still existed and you were already on its detail page. Merges now refresh the data in place and leave you exactly where you were.
- **Case-insensitive matching when creating artists, venues, and locations.** Typing "phish" no longer creates a duplicate row when "Phish" already exists — the `find_or_create` lookups for all three entity types now compare with `COLLATE NOCASE`, so "San Francisco" / "san francisco" and "Pier 80" / "PIER 80" resolve to the existing record. The CSV import preview's conflict detection uses the same case-insensitive comparison so its classifications match what the actual import will do.
- **Merge dialog and event-form artist autocomplete now match case-insensitively.** Typing a different casing of an existing artist no longer leaves the Merge button disabled, and adding an artist to an event in a different case now snaps to the canonical spelling of the existing artist instead of creating a visually-different pill that the backend would silently dedupe on save.

## Improvements
- **Wider scrollbars.** The webkit scrollbar bumped from 6px to 10px (4px → 5px corner radius) for a more comfortable click target.

## Internal
- New `db::tags` Rust module — a single boundary for "what tags does an artist have". Today it parses the MusicBrainz CSV stored in `artists.tags`; when user-authored custom tags arrive in a future release, the merge happens behind this module and no call site has to change. `ArtistWithCount` now carries `tags: Vec<String>` (cleaned, source-agnostic) instead of leaking the CSV. The existing Top Genres radar aggregator was refactored to share the same CSV splitter, so there's one source of truth for tag parsing.
- New Rust command `get_all_media` — the backing query for the Media tab. Mirrors `get_media_for_events` without the id filter and reuses the same capture-time sort, so the new gallery's grouping order matches what per-event galleries already render.
