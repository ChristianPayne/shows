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
    pub artists: Vec<ArtistInfo>,
    pub venue_id: i64,
    pub location_id: i64,
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
pub struct LocationWithCount {
    pub id: i64,
    pub city: String,
    pub state: String,
    pub event_count: i64,
}
