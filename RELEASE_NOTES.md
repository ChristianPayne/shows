# v1.0.0

## Features
- **Faceted event filtering.** Filter the events list by friends, artists, event name, venue, and location — with any/all (OR/AND) matching per facet — on top of the existing free-text search. You can also show/hide columns, and the list remembers your search, sort, and filters when you leave the page and come back.
- **Auto-save when editing an event.** Edits save as you make them, with a quiet "Saved" indicator — no more Update button. (Creating a new event still uses an explicit, validated form.)
- **User-curated artist tags.** Tags are now a deliberate choice: type your own or pick from MusicBrainz suggestions on each artist's page. Tags drive a new "similar artists" list — other artists you've seen that share tags — and a seeded list of common genres backs the suggestions, editable in Settings → Data.
- **Genre-colored tags.** Tag chips are colored by genre, so you can read your taste at a glance.
- **Custom accent colors.** Add your own accent color in Settings, alongside the built-in presets.
- **Quicker friend adding.** Add a friend from a three-dots menu and a small dialog, replacing the always-on inline input.

## Improvements
- Autocomplete fields (venue, city, state, artists, friends, and the new filters) now behave as comboboxes: focus to see every option, the top match is preselected, and Enter adds it — no separate "+" button.
- MusicBrainz tag suggestions you already use are outlined and sorted to the front, so reusing an existing tag is easy.
- The `Cmd/Ctrl+K` command palette auto-selects the top result — search and just hit Enter.
- Inputs no longer trigger the macOS autofill and spellcheck prompts.

## Notes
- **Tags reset on upgrade.** Because tags are now something you curate rather than auto-fetched genres, this release clears the previously auto-applied tags/genres on first launch. Re-add tags to your artists from the suggestions (or type your own); the rest of each artist's info (country, type, links) is untouched.
