use sqlx::SqlitePool;
use tauri::State;

use crate::db::models::EventDetail;
use crate::db::queries;

#[derive(serde::Deserialize)]
pub struct ArtistEntry {
    pub name: String,
    pub set_group: Option<i64>,
}

#[derive(serde::Deserialize)]
pub struct CreateEventInput {
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub venue: String,
    pub city: String,
    pub state: String,
    pub artists: Vec<ArtistEntry>,
}

#[tauri::command]
pub async fn get_events(pool: State<'_, SqlitePool>) -> Result<Vec<EventDetail>, String> {
    queries::get_all_events(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_event(pool: State<'_, SqlitePool>, event_id: i64) -> Result<Option<EventDetail>, String> {
    queries::get_event_by_id(&pool, event_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_event(
    pool: State<'_, SqlitePool>,
    input: CreateEventInput,
) -> Result<i64, String> {
    let location_id = queries::find_or_create_location(&pool, &input.city, &input.state)
        .await
        .map_err(|e| e.to_string())?;

    let venue_id = queries::find_or_create_venue(&pool, &input.venue)
        .await
        .map_err(|e| e.to_string())?;

    let mut artists = Vec::new();
    for entry in &input.artists {
        let trimmed = entry.name.trim();
        if !trimmed.is_empty() {
            let id = queries::find_or_create_artist(&pool, trimmed)
                .await
                .map_err(|e| e.to_string())?;
            artists.push((id, entry.set_group));
        }
    }

    queries::create_event(&pool, &input.name, &input.date, input.end_date.as_deref(), venue_id, location_id, &artists)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_event(
    pool: State<'_, SqlitePool>,
    event_id: i64,
    input: CreateEventInput,
) -> Result<(), String> {
    let location_id = queries::find_or_create_location(&pool, &input.city, &input.state)
        .await
        .map_err(|e| e.to_string())?;

    let venue_id = queries::find_or_create_venue(&pool, &input.venue)
        .await
        .map_err(|e| e.to_string())?;

    let mut artists = Vec::new();
    for entry in &input.artists {
        let trimmed = entry.name.trim();
        if !trimmed.is_empty() {
            let id = queries::find_or_create_artist(&pool, trimmed)
                .await
                .map_err(|e| e.to_string())?;
            artists.push((id, entry.set_group));
        }
    }

    queries::update_event(&pool, event_id, &input.name, &input.date, input.end_date.as_deref(), venue_id, location_id, &artists)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_event_cancelled(
    pool: State<'_, SqlitePool>,
    event_id: i64,
    cancelled: bool,
) -> Result<(), String> {
    sqlx::query("UPDATE events SET cancelled = ?1, updated_at = datetime('now') WHERE id = ?2")
        .bind(cancelled)
        .bind(event_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_event(pool: State<'_, SqlitePool>, event_id: i64) -> Result<(), String> {
    queries::delete_event(&pool, event_id)
        .await
        .map_err(|e| e.to_string())
}
