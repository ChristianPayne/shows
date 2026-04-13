use sqlx::SqlitePool;
use tauri::State;

use crate::commands::genres;
use crate::commands::query::{self, EventSortKey, SortDir};
use crate::db::models::{
    ArtistStats, ArtistWithCount, EntityEventNames, EventDetail, LocationWithCount, TagCount,
    VenueAutocompleteEntry, VenueWithCount,
};
use crate::db::queries;

#[specta::specta]
#[tauri::command]
pub async fn get_artists(pool: State<'_, SqlitePool>) -> Result<Vec<ArtistWithCount>, String> {
    queries::get_artists_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_artist_tag_counts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<TagCount>, String> {
    queries::get_artist_tag_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_venues(pool: State<'_, SqlitePool>) -> Result<Vec<VenueWithCount>, String> {
    queries::get_venues_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_venue_autocomplete(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<VenueAutocompleteEntry>, String> {
    queries::get_venue_autocomplete(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_locations(pool: State<'_, SqlitePool>) -> Result<Vec<LocationWithCount>, String> {
    queries::get_locations_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

// The three `get_events_for_*` commands all accept optional sort params so
// detail-page column clicks can round-trip through the same `query::sort_events`
// comparator used by the main events list. Omit them and you get the legacy
// behavior: date descending, which is still the only order the SQL guarantees.

#[specta::specta]
#[tauri::command]
pub async fn get_events_for_artist(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
    sort_key: Option<EventSortKey>,
    sort_dir: Option<SortDir>,
) -> Result<Vec<EventDetail>, String> {
    let mut events = queries::get_events_for_artist(&pool, artist_id)
        .await
        .map_err(|e| e.to_string())?;
    query::sort_events(
        &mut events,
        sort_key.unwrap_or(EventSortKey::Date),
        sort_dir.unwrap_or(SortDir::Desc),
    );
    Ok(events)
}

#[specta::specta]
#[tauri::command]
pub async fn get_events_for_venue(
    pool: State<'_, SqlitePool>,
    venue_id: i64,
    sort_key: Option<EventSortKey>,
    sort_dir: Option<SortDir>,
) -> Result<Vec<EventDetail>, String> {
    let mut events = queries::get_events_for_venue(&pool, venue_id)
        .await
        .map_err(|e| e.to_string())?;
    query::sort_events(
        &mut events,
        sort_key.unwrap_or(EventSortKey::Date),
        sort_dir.unwrap_or(SortDir::Desc),
    );
    Ok(events)
}

#[specta::specta]
#[tauri::command]
pub async fn get_events_for_location(
    pool: State<'_, SqlitePool>,
    location_id: i64,
    sort_key: Option<EventSortKey>,
    sort_dir: Option<SortDir>,
) -> Result<Vec<EventDetail>, String> {
    let mut events = queries::get_events_for_location(&pool, location_id)
        .await
        .map_err(|e| e.to_string())?;
    query::sort_events(
        &mut events,
        sort_key.unwrap_or(EventSortKey::Date),
        sort_dir.unwrap_or(SortDir::Desc),
    );
    Ok(events)
}

// Aggregated event-name lists for the Artists/Venues/Locations list-page
// tooltips. Each returns one row per entity that has at least one event;
// entities with zero events are omitted (the tooltip is only useful when
// there's something to show).

#[specta::specta]
#[tauri::command]
pub async fn get_artist_event_names(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<EntityEventNames>, String> {
    queries::get_artist_event_names(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_venue_event_names(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<EntityEventNames>, String> {
    queries::get_venue_event_names(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_location_event_names(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<EntityEventNames>, String> {
    queries::get_location_event_names(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_artist_stats(pool: State<'_, SqlitePool>, artist_id: i64) -> Result<ArtistStats, String> {
    queries::get_artist_stats(&pool, artist_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn rename_artist(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    artist_id: i64,
    name: String,
) -> Result<(), String> {
    // A rename is usually a typo fix ("Nein Inch Nails" → "Nine Inch Nails")
    // — in which case the metadata from the old name is wrong and needs to
    // go. Clear every MusicBrainz-derived column and reset `mbid` to NULL
    // so the background fetcher picks the row up for the new name on the
    // refetch below. If a user intentionally renames to a correct alias
    // and wants to preserve the existing MBID mapping, they can re-apply
    // it via the match picker after — acceptable trade-off for fixing the
    // common typo case automatically.
    queries::rename_artist_and_clear_metadata(&pool, artist_id, &name)
        .await
        .map_err(|e| e.to_string())?;

    // Targeted refetch for just this one artist, using the scoped filter
    // we added for create_event / update_event. No full-DB scan.
    let pool_clone = pool.inner().clone();
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        let _ = genres::fetch_genres_bg(&pool_clone, &app_clone, Some(vec![artist_id])).await;
    });

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub async fn rename_venue(pool: State<'_, SqlitePool>, venue_id: i64, name: String) -> Result<(), String> {
    queries::rename_venue(&pool, venue_id, &name).await.map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn rename_location(pool: State<'_, SqlitePool>, location_id: i64, city: String, state: String) -> Result<(), String> {
    queries::rename_location(&pool, location_id, &city, &state).await.map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn merge_artists(
    pool: State<'_, SqlitePool>,
    keep_id: i64,
    merge_id: i64,
) -> Result<(), String> {
    queries::merge_artists(&pool, keep_id, merge_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn merge_venues(
    pool: State<'_, SqlitePool>,
    keep_id: i64,
    merge_id: i64,
) -> Result<(), String> {
    queries::merge_venues(&pool, keep_id, merge_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn merge_locations(
    pool: State<'_, SqlitePool>,
    keep_id: i64,
    merge_id: i64,
) -> Result<(), String> {
    queries::merge_locations(&pool, keep_id, merge_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn delete_venue(pool: State<'_, SqlitePool>, venue_id: i64) -> Result<(), String> {
    queries::delete_venue(&pool, venue_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn delete_artist(pool: State<'_, SqlitePool>, artist_id: i64) -> Result<(), String> {
    queries::delete_artist(&pool, artist_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn delete_location(pool: State<'_, SqlitePool>, location_id: i64) -> Result<(), String> {
    queries::delete_location(&pool, location_id)
        .await
        .map_err(|e| e.to_string())
}
