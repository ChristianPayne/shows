use serde::{Deserialize, Serialize};

// Canonical row shapes that mirror the SQLite schema 1:1. Currently unused —
// the codebase prefers join-aware variants like EventDetail and VenueWithCount —
// but kept as the source of truth for what each table looks like, and so
// future queries can `query_as::<_, Location>` etc. without redefining.

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Location {
    pub id: i64,
    pub city: String,
    pub state: String,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Venue {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Artist {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Event {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub venue_id: i64,
    pub location_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct ArtistInfo {
    pub id: i64,
    pub name: String,
    pub set_group: Option<i64>,
}

/// A group of artists that perform together (b2b). Solo artists are a set of one.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArtistSet {
    pub artists: Vec<ArtistInfo>,
}

/// A friend you attended an event with. Deliberately minimal (id + name) —
/// friends have none of the metadata artists accumulate. Carried inline on
/// `EventDetail` so the event form can prefill the chips synchronously.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct Friend {
    pub id: i64,
    pub name: String,
}

/// Enriched artist info for event detail view — includes attendance context.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArtistContext {
    pub id: i64,
    pub name: String,
    pub set_group: Option<i64>,
    pub total_events: i64,
    pub first_event: bool,
    pub mbid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArtistContextSet {
    pub artists: Vec<ArtistContext>,
}

/// Event with all related data joined — used for list and detail views.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct EventDetail {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub cancelled: bool,
    pub venue: String,
    pub city: String,
    pub state: String,
    pub artist_sets: Vec<ArtistSet>,
    pub friends: Vec<Friend>,
    pub venue_id: i64,
    pub location_id: i64,
}

impl EventDetail {
    /// Build from raw artist rows, grouping by set_group.
    pub fn group_artists(artists: Vec<ArtistInfo>) -> Vec<ArtistSet> {
        let mut sets: Vec<ArtistSet> = Vec::new();
        let mut group_map: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();

        for artist in artists {
            if let Some(group) = artist.set_group {
                if let Some(&idx) = group_map.get(&group) {
                    sets[idx].artists.push(artist);
                } else {
                    let idx = sets.len();
                    group_map.insert(group, idx);
                    sets.push(ArtistSet { artists: vec![artist] });
                }
            } else {
                sets.push(ArtistSet { artists: vec![artist] });
            }
        }

        sets
    }
}

/// Row returned from the events join query before artist aggregation.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EventRow {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub cancelled: bool,
    pub venue_id: i64,
    pub location_id: i64,
    pub venue: String,
    pub city: String,
    pub state: String,
}

/// Detailed stats for a single artist.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArtistStats {
    pub genre: Option<String>,
    pub tags: Option<String>,
    pub country: Option<String>,
    pub artist_type: Option<String>,
    pub begin_year: Option<String>,
    pub end_year: Option<String>,
    pub active: Option<bool>,
    pub disambiguation: Option<String>,
    pub first_seen: Option<String>,
    pub last_seen: Option<String>,
    pub unique_venues: i64,
    pub unique_locations: i64,
    pub related_artists: Vec<RelatedArtist>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct RelatedArtist {
    pub id: i64,
    pub name: String,
    pub shared_events: i64,
}

/// An artist suggested by tag overlap (shares ≥1 curated tag with the subject
/// artist). `shared_tags` drives the ranking; `event_count` is how many shows
/// of theirs you've logged, shown alongside the name.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct SimilarArtist {
    pub id: i64,
    pub name: String,
    pub shared_tags: i64,
    pub event_count: i64,
}

/// Stats summary for the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Stats {
    pub total_events: i64,
    pub total_artists: i64,
    pub total_venues: i64,
    pub total_locations: i64,
    pub top_artists: Vec<EntityCount>,
    pub top_venues: Vec<EntityCount>,
    /// Friends you've attended the most events with. Standalone friends (zero
    /// events) are excluded — the inner join drops them.
    pub top_friends: Vec<EntityCount>,
    pub events_per_year: Vec<YearCount>,
    pub events_per_month: Vec<MonthCount>,
    /// Aggregated from each artist's curated tags, counted by distinct attended
    /// events per tag. Empty until some artists have tags — the UI then hints at
    /// adding tags on the artist pages.
    pub top_genres: Vec<GenreCount>,
}

/// A single row for the Top Genres radar chart. Genres don't have DB ids
/// — they're derived from comma-split `artists.tags` values — so this uses
/// a dedicated struct instead of piggy-backing on `EntityCount`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GenreCount {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct EntityCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct YearCount {
    pub year: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct MonthCount {
    pub month: String,
    pub count: i64,
}

/// Venues need location context in list views since the same name can exist in
/// different cities (e.g., "The Independent" in SF vs Austin).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct VenueWithCount {
    pub id: i64,
    pub name: String,
    pub event_count: i64,
    pub location_id: i64,
    pub city: String,
    pub state: String,
}

/// `tags` is a cleaned list (trimmed, non-empty) rather than the raw CSV so
/// the frontend can filter and render without re-parsing. Source-agnostic —
/// see `db::tags` for the future custom-tag merge point.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArtistWithCount {
    pub id: i64,
    pub name: String,
    pub event_count: i64,
    pub genre: Option<String>,
    pub country: Option<String>,
    pub artist_type: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct LocationWithCount {
    pub id: i64,
    pub city: String,
    pub state: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, sqlx::FromRow)]
pub struct FriendWithCount {
    pub id: i64,
    pub name: String,
    pub event_count: i64,
}

/// Per-entity list of event names used only by the list-page tooltip bars.
/// Aggregated in Rust so the frontend doesn't have to pull every event just
/// to walk the relationships itself — see `queries::get_*_event_names`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct EntityEventNames {
    pub id: i64,
    pub names: Vec<String>,
}

/// A not-yet-attended event plus the relative-time value used by the
/// dashboard. Wrapping `EventDetail` (rather than adding a `days_until`
/// field to it) keeps the main shape clean — "days until" is only
/// meaningful for upcoming rows.
///
/// `days_until` is a signed count of calendar days from today (local) to
/// the event date. Zero means today, one means tomorrow. The frontend
/// owns the eventual string label so i18n stays on the display side.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UpcomingEvent {
    pub event: EventDetail,
    pub days_until: i64,
}

/// Photo/video counts for the Media page tab strip. Kept as a tiny
/// dedicated shape rather than returning a generic map so serde generates
/// a nice TS interface without a `Record<string, number>`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct MediaCounts {
    pub all: i64,
    pub photos: i64,
    pub videos: i64,
}

/// A venue name grouped with the list of locations that name appears at.
/// Case-insensitive deduplication happens server-side so the EventForm
/// autocomplete doesn't re-implement the rule in TypeScript. `display_name`
/// is the first-seen casing, mirroring the policy used by the top-genres
/// aggregator.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct VenueAutocompleteEntry {
    pub display_name: String,
    pub locations: Vec<VenueLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct VenueLocation {
    pub city: String,
    pub state: String,
}

/// Aggregated tag chip data for the Artists list filter strip. `key` is the
/// lowercased form used for matching (matches the URL query param and the
/// `query_artists` tag filter). `display` is the first-seen casing — same
/// policy as the top-genres aggregator. `count` is the number of distinct
/// artists that carry this tag.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TagCount {
    pub key: String,
    pub display: String,
    pub count: i64,
}

/// A media file (image or video) attached to an event. The on-disk path is
/// computed at read time from the event's current name + id and the stored
/// `filename`; we don't persist the absolute path because the event folder
/// can be renamed. Images and videos live in the same table — `mime_type` is
/// the field that distinguishes them.
///
/// `captured_at` is the media's own timestamp (EXIF DateTimeOriginal for
/// images, mvhd creation_time for MP4/MOV). `created_at` is the upload time
/// — distinct concept. Sorting prefers `captured_at` so chronologically-
/// shot media appear in the order they were taken, not the order they
/// were added to the app.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EventMediaRow {
    pub id: i64,
    pub event_id: i64,
    pub filename: String,
    pub mime_type: String,
    pub file_size: i64,
    pub caption: Option<String>,
    pub created_at: String,
    pub captured_at: Option<String>,
}

/// Media row with its computed absolute filesystem path, ready to be wrapped
/// by the frontend's `convertFileSrc`. `event_name` / `event_date` are
/// populated by the bulk query for cross-entity galleries; on single-event
/// fetches they are left empty.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct EventMedia {
    pub id: i64,
    pub event_id: i64,
    pub filename: String,
    pub mime_type: String,
    pub file_size: i64,
    pub caption: Option<String>,
    pub created_at: String,
    pub captured_at: Option<String>,
    pub absolute_path: String,
    pub event_name: Option<String>,
    pub event_date: Option<String>,
}
