# v0.2.0

## Features
- Venues now belong to a specific city. The same venue name can exist in multiple cities (e.g., "The Independent" in SF and Austin) and they're tracked as distinct venues.
- Venue search in the command palette and on the Venues page now matches city and state, not just venue name.
- The Venues page and venue detail header now show city and state alongside the venue name.
- Restoring a backup from a newer version of the app is now blocked with a clear error, so a backup from a future install can't silently corrupt an older one.
- The footer now shows the database schema version next to the app version.

## Improvements
- Sidebar navigation is now flat — Dashboard, Events, Artists, Venues, and Locations are all top-level instead of Artists/Venues/Locations being nested under Events.
- Adding or editing an event now auto-fills the city and state when you pick an existing venue. If the same venue name exists in multiple cities, the form prompts you to disambiguate instead of guessing.
- CSV import is now strict about venue locations: if a row mentions a venue that already exists in a different city, the import stops and tells you which row so you can fix the data and retry.

## Internal
- Schema migration v12 reshapes the database so venues own their location instead of events. The migration runs automatically on first launch and is fully transparent — no user action required. Existing data is preserved exactly.
- Cleaned up accumulated clippy lints across the Rust codebase.
