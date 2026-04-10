use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Location {
    pub id: i64,
    pub city: String,
    pub state: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Venue {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Artist {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Event {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub venue_id: i64,
    pub location_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ArtistInfo {
    pub id: i64,
    pub name: String,
    pub set_group: Option<i64>,
}

/// A group of artists that perform together (b2b). Solo artists are a set of one.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistSet {
    pub artists: Vec<ArtistInfo>,
}

/// Enriched artist info for event detail view — includes attendance context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistContext {
    pub id: i64,
    pub name: String,
    pub set_group: Option<i64>,
    pub total_events: i64,
    pub first_event: bool,
    pub mbid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistContextSet {
    pub artists: Vec<ArtistContext>,
}

/// Event with all related data joined — used for list and detail views.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventDetail {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub cancelled: bool,
    pub venue: String,
    pub city: String,
    pub state: String,
    pub artist_sets: Vec<ArtistSet>,
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
    pub cancelled: bool,
    pub venue_id: i64,
    pub location_id: i64,
    pub venue: String,
    pub city: String,
    pub state: String,
}

/// Detailed stats for a single artist.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RelatedArtist {
    pub id: i64,
    pub name: String,
    pub shared_events: i64,
}

/// Stats summary for the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub total_events: i64,
    pub total_artists: i64,
    pub total_venues: i64,
    pub total_locations: i64,
    pub top_artists: Vec<EntityCount>,
    pub top_venues: Vec<EntityCount>,
    pub events_per_year: Vec<YearCount>,
    pub events_per_month: Vec<MonthCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EntityCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct YearCount {
    pub year: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MonthCount {
    pub month: String,
    pub count: i64,
}

/// Used by the frontend for autocomplete and entity lists with counts.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EntityWithCount {
    pub id: i64,
    pub name: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ArtistWithCount {
    pub id: i64,
    pub name: String,
    pub event_count: i64,
    pub genre: Option<String>,
    pub country: Option<String>,
    pub artist_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LocationWithCount {
    pub id: i64,
    pub city: String,
    pub state: String,
    pub event_count: i64,
}
