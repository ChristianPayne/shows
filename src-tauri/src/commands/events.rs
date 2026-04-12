use sqlx::SqlitePool;
use tauri::{Manager, State};

use crate::commands::genres;
use crate::commands::images;
use crate::db::models::{ArtistContextSet, EventDetail};
use crate::db::queries;

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct ArtistEntry {
    pub name: String,
    pub set_group: Option<i64>,
}

/// Toggle b2b linkage between artist at `index` and the one before it.
/// Returns the updated artist list with corrected set_groups.
#[tauri::command]
pub fn toggle_b2b(artists: Vec<ArtistEntry>, index: usize) -> Vec<ArtistEntry> {
    if index == 0 || index >= artists.len() {
        return artists;
    }

    let mut result = artists;
    let prev_group = result[index - 1].set_group;
    let curr_group = result[index].set_group;

    // Check if they're already in the same group
    let already_linked = match (prev_group, curr_group) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    };

    if already_linked {
        // Unlink: remove current from the group
        result[index].set_group = None;
        // If the previous artist is now alone in its group, ungroup it too
        let group = prev_group.unwrap();
        let count = result.iter().filter(|a| a.set_group == Some(group)).count();
        if count <= 1 {
            for a in result.iter_mut() {
                if a.set_group == Some(group) {
                    a.set_group = None;
                }
            }
        }
    } else {
        // Link: assign both to the same group
        let max_group = result.iter()
            .filter_map(|a| a.set_group)
            .max()
            .unwrap_or(0);
        let new_group = prev_group.unwrap_or(max_group + 1);

        // If prev didn't have a group, assign the new one
        if prev_group.is_none() {
            result[index - 1].set_group = Some(new_group);
        }
        result[index].set_group = Some(new_group);
    }

    result
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
pub async fn get_artist_context(
    pool: State<'_, SqlitePool>,
    event_id: i64,
    event_date: String,
) -> Result<Vec<ArtistContextSet>, String> {
    queries::get_artist_context_for_event(&pool, event_id, &event_date)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_event(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    input: CreateEventInput,
) -> Result<i64, String> {
    let location_id = queries::find_or_create_location(&pool, &input.city, &input.state)
        .await
        .map_err(|e| e.to_string())?;

    let venue_id = queries::find_or_create_venue(&pool, &input.venue, location_id)
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

    let event_id = queries::create_event(&pool, &input.name, &input.date, input.end_date.as_deref(), venue_id, &artists)
        .await
        .map_err(|e| e.to_string())?;

    // Fetch metadata for any new artists in the background
    let pool_clone = pool.inner().clone();
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        let _ = genres::fetch_genres_bg(&pool_clone, &app_clone).await;
    });

    Ok(event_id)
}

#[tauri::command]
pub async fn update_event(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
    input: CreateEventInput,
) -> Result<(), String> {
    let location_id = queries::find_or_create_location(&pool, &input.city, &input.state)
        .await
        .map_err(|e| e.to_string())?;

    let venue_id = queries::find_or_create_venue(&pool, &input.venue, location_id)
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

    // Keep the on-disk image folder in sync with the event name. We rename
    // *before* touching the DB so a filesystem failure aborts the whole
    // operation cleanly — doing it in the other order would let the DB move
    // ahead while the folder stayed on the old slug.
    let old_name: Option<(String,)> =
        sqlx::query_as("SELECT name FROM events WHERE id = ?1")
            .bind(event_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
    if let Some((old_name,)) = old_name {
        if old_name != input.name {
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("Could not resolve app data directory: {}", e))?;
            images::rename_event_folder(&app_dir, event_id, &old_name, &input.name)?;
        }
    }

    queries::update_event(
        &pool,
        event_id,
        queries::UpdateEventInput {
            name: &input.name,
            date: &input.date,
            end_date: input.end_date.as_deref(),
            venue_id,
            artists: &artists,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    // Fetch metadata for any new artists in the background
    let pool_clone = pool.inner().clone();
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        let _ = genres::fetch_genres_bg(&pool_clone, &app_clone).await;
    });

    Ok(())
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
pub async fn delete_event(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
) -> Result<(), String> {
    // Grab the name *before* deleting so we can compute the folder path after
    // the row is gone. If the event doesn't exist, fall through to the delete
    // (it will no-op) and skip the folder cleanup.
    let name: Option<(String,)> = sqlx::query_as("SELECT name FROM events WHERE id = ?1")
        .bind(event_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    queries::delete_event(&pool, event_id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some((name,)) = name {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Could not resolve app data directory: {}", e))?;
        images::remove_event_folder(&app_dir, event_id, &name);
    }

    Ok(())
}
