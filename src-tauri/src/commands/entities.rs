use sqlx::SqlitePool;
use tauri::State;

use crate::commands::genres;
use crate::db::models::{ArtistStats, ArtistWithCount, EventDetail, LocationWithCount, VenueWithCount};
use crate::db::queries;

#[tauri::command]
pub async fn get_artists(pool: State<'_, SqlitePool>) -> Result<Vec<ArtistWithCount>, String> {
    queries::get_artists_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_venues(pool: State<'_, SqlitePool>) -> Result<Vec<VenueWithCount>, String> {
    queries::get_venues_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_locations(pool: State<'_, SqlitePool>) -> Result<Vec<LocationWithCount>, String> {
    queries::get_locations_with_counts(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_events_for_artist(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
) -> Result<Vec<EventDetail>, String> {
    queries::get_events_for_artist(&pool, artist_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_events_for_venue(
    pool: State<'_, SqlitePool>,
    venue_id: i64,
) -> Result<Vec<EventDetail>, String> {
    queries::get_events_for_venue(&pool, venue_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_events_for_location(
    pool: State<'_, SqlitePool>,
    location_id: i64,
) -> Result<Vec<EventDetail>, String> {
    queries::get_events_for_location(&pool, location_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_artist_stats(pool: State<'_, SqlitePool>, artist_id: i64) -> Result<ArtistStats, String> {
    queries::get_artist_stats(&pool, artist_id)
        .await
        .map_err(|e| e.to_string())
}

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

#[tauri::command]
pub async fn rename_venue(pool: State<'_, SqlitePool>, venue_id: i64, name: String) -> Result<(), String> {
    queries::rename_venue(&pool, venue_id, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_location(pool: State<'_, SqlitePool>, location_id: i64, city: String, state: String) -> Result<(), String> {
    queries::rename_location(&pool, location_id, &city, &state).await.map_err(|e| e.to_string())
}

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

#[tauri::command]
pub async fn delete_venue(pool: State<'_, SqlitePool>, venue_id: i64) -> Result<(), String> {
    queries::delete_venue(&pool, venue_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_artist(pool: State<'_, SqlitePool>, artist_id: i64) -> Result<(), String> {
    queries::delete_artist(&pool, artist_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_location(pool: State<'_, SqlitePool>, location_id: i64) -> Result<(), String> {
    queries::delete_location(&pool, location_id)
        .await
        .map_err(|e| e.to_string())
}
