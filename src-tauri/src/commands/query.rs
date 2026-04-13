//! Unified search / filter / sort for the four list surfaces (events,
//! artists, venues, locations). Before this module existed, every list page
//! and the command palette re-implemented the same filter + sort in
//! TypeScript — five subtly-different copies of the same rules. That's the
//! "all logic in Rust" invariant being quietly undermined, so everything
//! collapses into one place here.
//!
//! Each entity gets its own small `Query*Input` shape and `query_*` command,
//! but they share `SortDir`, the sort-key enums, and the tiny helpers for
//! query normalization and the natural-language "strip 'The '" sort key.

use serde::Deserialize;
use sqlx::SqlitePool;
use std::collections::HashSet;
use tauri::State;

use crate::db::models::{ArtistWithCount, EventDetail, LocationWithCount, VenueWithCount};
use crate::db::queries;

// ── Shared shapes ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDir {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventSortKey {
    Date,
    Name,
    Venue,
    Location,
}

/// Artists, venues, and locations all sort by the same two axes: their
/// "natural" display name or the per-entity event count. The per-entity
/// meaning of `Name` differs (venue strips "The ", locations compose
/// "state, city"), but the enum variants line up.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntitySortKey {
    Name,
    Count,
}

// ── Helpers ───────────────────────────────────────────────────────────────

/// Trim + lowercase a search query. Empty-after-trim becomes `None` so
/// downstream filters can skip the match pass entirely.
fn normalize_query(q: Option<&str>) -> Option<String> {
    q.map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
}

/// Compose the canonical sort key for a natural-language name: lowercased,
/// with a leading "the " stripped. Used anywhere we want "The Fillmore" to
/// land next to "Fillmore" alphabetically.
fn sort_key_name(s: &str) -> String {
    let lower = s.to_lowercase();
    lower.strip_prefix("the ").map(str::to_string).unwrap_or(lower)
}

/// Case-insensitive substring match. `needle` must already be lowercased;
/// the caller normalizes once up-front so we don't re-lowercase it per row.
fn contains_ci(haystack: &str, needle_lower: &str) -> bool {
    haystack.to_lowercase().contains(needle_lower)
}

fn apply_dir(cmp: std::cmp::Ordering, dir: SortDir) -> std::cmp::Ordering {
    match dir {
        SortDir::Asc => cmp,
        SortDir::Desc => cmp.reverse(),
    }
}

// ── Events ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventsQueryInput {
    pub query: Option<String>,
    pub sort_key: Option<EventSortKey>,
    pub sort_dir: Option<SortDir>,
    pub limit: Option<usize>,
}

fn filter_events(events: &mut Vec<EventDetail>, query_lower: &str) {
    events.retain(|e| {
        contains_ci(&e.name, query_lower)
            || contains_ci(&e.venue, query_lower)
            || contains_ci(&e.city, query_lower)
            || contains_ci(&e.state, query_lower)
            || e.artist_sets
                .iter()
                .any(|set| set.artists.iter().any(|a| contains_ci(&a.name, query_lower)))
    });
}

/// Shared across `query_events` and the entity-scoped `get_events_for_*`
/// commands so all four event-fetching paths sort through exactly the same
/// comparator.
pub fn sort_events(events: &mut [EventDetail], key: EventSortKey, dir: SortDir) {
    events.sort_by(|a, b| {
        let cmp = match key {
            EventSortKey::Date => a.date.cmp(&b.date),
            EventSortKey::Name => sort_key_name(&a.name).cmp(&sort_key_name(&b.name)),
            EventSortKey::Venue => sort_key_name(&a.venue).cmp(&sort_key_name(&b.venue)),
            EventSortKey::Location => {
                let ka = format!("{}, {}", a.state, a.city).to_lowercase();
                let kb = format!("{}, {}", b.state, b.city).to_lowercase();
                ka.cmp(&kb)
            }
        };
        apply_dir(cmp, dir)
    });
}

#[tauri::command]
pub async fn query_events(
    pool: State<'_, SqlitePool>,
    input: EventsQueryInput,
) -> Result<Vec<EventDetail>, String> {
    let mut events = queries::get_all_events(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(q) = normalize_query(input.query.as_deref()) {
        filter_events(&mut events, &q);
    }

    let key = input.sort_key.unwrap_or(EventSortKey::Date);
    let dir = input.sort_dir.unwrap_or(SortDir::Desc);
    sort_events(&mut events, key, dir);

    if let Some(limit) = input.limit {
        events.truncate(limit);
    }
    Ok(events)
}

// ── Artists ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistsQueryInput {
    pub query: Option<String>,
    /// Optional tag filter with OR semantics — an artist matches if *any*
    /// of its tags appears in this set. Callers may pass mixed-case values;
    /// we lowercase them here for the comparison.
    pub tags: Option<Vec<String>>,
    pub sort_key: Option<EntitySortKey>,
    pub sort_dir: Option<SortDir>,
    pub limit: Option<usize>,
}

fn filter_artists(
    artists: &mut Vec<ArtistWithCount>,
    query_lower: Option<&str>,
    tag_set: Option<&HashSet<String>>,
) {
    if let Some(q) = query_lower {
        artists.retain(|a| contains_ci(&a.name, q));
    }
    if let Some(tags) = tag_set {
        if !tags.is_empty() {
            artists.retain(|a| a.tags.iter().any(|t| tags.contains(&t.to_lowercase())));
        }
    }
}

fn sort_artists(artists: &mut [ArtistWithCount], key: EntitySortKey, dir: SortDir) {
    artists.sort_by(|a, b| {
        let cmp = match key {
            EntitySortKey::Name => sort_key_name(&a.name).cmp(&sort_key_name(&b.name)),
            EntitySortKey::Count => a.event_count.cmp(&b.event_count),
        };
        apply_dir(cmp, dir)
    });
}

#[tauri::command]
pub async fn query_artists(
    pool: State<'_, SqlitePool>,
    input: ArtistsQueryInput,
) -> Result<Vec<ArtistWithCount>, String> {
    let mut artists = queries::get_artists_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let q = normalize_query(input.query.as_deref());
    let tag_set: Option<HashSet<String>> = input.tags.map(|ts| {
        ts.into_iter()
            .map(|t| t.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect()
    });

    filter_artists(&mut artists, q.as_deref(), tag_set.as_ref());

    let key = input.sort_key.unwrap_or(EntitySortKey::Count);
    let dir = input.sort_dir.unwrap_or(SortDir::Desc);
    sort_artists(&mut artists, key, dir);

    if let Some(limit) = input.limit {
        artists.truncate(limit);
    }
    Ok(artists)
}

// ── Venues ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VenuesQueryInput {
    pub query: Option<String>,
    pub sort_key: Option<EntitySortKey>,
    pub sort_dir: Option<SortDir>,
    pub limit: Option<usize>,
}

fn filter_venues(venues: &mut Vec<VenueWithCount>, query_lower: &str) {
    venues.retain(|v| {
        contains_ci(&v.name, query_lower)
            || contains_ci(&v.city, query_lower)
            || contains_ci(&v.state, query_lower)
    });
}

fn sort_venues(venues: &mut [VenueWithCount], key: EntitySortKey, dir: SortDir) {
    venues.sort_by(|a, b| {
        let cmp = match key {
            EntitySortKey::Name => sort_key_name(&a.name).cmp(&sort_key_name(&b.name)),
            EntitySortKey::Count => a.event_count.cmp(&b.event_count),
        };
        apply_dir(cmp, dir)
    });
}

#[tauri::command]
pub async fn query_venues(
    pool: State<'_, SqlitePool>,
    input: VenuesQueryInput,
) -> Result<Vec<VenueWithCount>, String> {
    let mut venues = queries::get_venues_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(q) = normalize_query(input.query.as_deref()) {
        filter_venues(&mut venues, &q);
    }

    let key = input.sort_key.unwrap_or(EntitySortKey::Count);
    let dir = input.sort_dir.unwrap_or(SortDir::Desc);
    sort_venues(&mut venues, key, dir);

    if let Some(limit) = input.limit {
        venues.truncate(limit);
    }
    Ok(venues)
}

// ── Locations ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationsQueryInput {
    pub query: Option<String>,
    pub sort_key: Option<EntitySortKey>,
    pub sort_dir: Option<SortDir>,
    pub limit: Option<usize>,
}

fn filter_locations(locations: &mut Vec<LocationWithCount>, query_lower: &str) {
    locations.retain(|l| contains_ci(&l.city, query_lower) || contains_ci(&l.state, query_lower));
}

fn sort_locations(locations: &mut [LocationWithCount], key: EntitySortKey, dir: SortDir) {
    locations.sort_by(|a, b| {
        let cmp = match key {
            // Locations don't have a standalone "name" — the display form is
            // "city, state" but the sort key groups by state first so rows
            // from the same state cluster together.
            EntitySortKey::Name => {
                let ka = format!("{}, {}", a.state, a.city).to_lowercase();
                let kb = format!("{}, {}", b.state, b.city).to_lowercase();
                ka.cmp(&kb)
            }
            EntitySortKey::Count => a.event_count.cmp(&b.event_count),
        };
        apply_dir(cmp, dir)
    });
}

#[tauri::command]
pub async fn query_locations(
    pool: State<'_, SqlitePool>,
    input: LocationsQueryInput,
) -> Result<Vec<LocationWithCount>, String> {
    let mut locations = queries::get_locations_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(q) = normalize_query(input.query.as_deref()) {
        filter_locations(&mut locations, &q);
    }

    let key = input.sort_key.unwrap_or(EntitySortKey::Count);
    let dir = input.sort_dir.unwrap_or(SortDir::Desc);
    sort_locations(&mut locations, key, dir);

    if let Some(limit) = input.limit {
        locations.truncate(limit);
    }
    Ok(locations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sort_key_name_strips_leading_the() {
        assert_eq!(sort_key_name("The Fillmore"), "fillmore");
        assert_eq!(sort_key_name("THE Strokes"), "strokes");
        assert_eq!(sort_key_name("Fillmore"), "fillmore");
        // "Theater" must not match — prefix is "the " with the trailing space.
        assert_eq!(sort_key_name("Theater"), "theater");
    }

    #[test]
    fn normalize_query_empties_are_none() {
        assert_eq!(normalize_query(None), None);
        assert_eq!(normalize_query(Some("")), None);
        assert_eq!(normalize_query(Some("   ")), None);
        assert_eq!(normalize_query(Some("  Nine  ")), Some("nine".to_string()));
    }
}
