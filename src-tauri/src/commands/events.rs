use sqlx::SqlitePool;
use tauri::{Manager, State};

use crate::commands::genres;
use crate::commands::media;
use crate::db::models::{ArtistContextSet, EventDetail, UpcomingEvent};
use crate::db::queries;

#[derive(serde::Deserialize, serde::Serialize, specta::Type, Clone)]
pub struct ArtistEntry {
    /// Id of an existing artist when this chip came from a known artist, so the
    /// save links by it instead of re-resolving the (display) name — the same
    /// id-over-name rule the friend chips use. `None` is a freshly typed name,
    /// resolved via find-or-create (and counted as new for the MusicBrainz
    /// metadata fetch). `toggle_b2b` only reshuffles set_group, so it carries
    /// the id straight through.
    pub id: Option<i64>,
    pub name: String,
    pub set_group: Option<i64>,
}

/// Toggle b2b linkage between artist at `index` and the one before it.
/// Returns the updated artist list with corrected set_groups.
#[specta::specta]
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

#[derive(serde::Deserialize, serde::Serialize, specta::Type)]
pub struct CreateEventInput {
    pub name: String,
    pub date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub venue: String,
    pub city: String,
    pub state: String,
    pub artists: Vec<ArtistEntry>,
    /// Friends who attended. Existing friends carry their `id` and link by it;
    /// newly typed friends have `id: None` and are resolved by name
    /// (find-or-create) on the way in. No set_group — friends have no b2b
    /// concept. See [`FriendEntry`] for why the id matters under Streamer Mode.
    pub friends: Vec<FriendEntry>,
}

#[derive(serde::Deserialize, serde::Serialize, specta::Type, Clone)]
pub struct FriendEntry {
    /// Id of an existing friend when this chip came from a known friend. The
    /// save links by this id and *ignores* `name`, which is what lets Streamer
    /// Mode hand back first-name-only display names without a masked "Sarah"
    /// being resolved to a brand-new duplicate friend. `None` means a freshly
    /// typed name, resolved via find-or-create.
    pub id: Option<i64>,
    pub name: String,
}

/// Resolve form friend entries to deduplicated friend ids. Entries with an id
/// link straight by it; id-less entries are new names resolved via
/// find-or-create. Blank new names are skipped; duplicate ids collapse to one
/// so the `event_friends` (event_id, friend_id) primary key can't be violated
/// by the same friend appearing twice.
async fn resolve_friend_ids(
    pool: &SqlitePool,
    entries: &[FriendEntry],
) -> Result<Vec<i64>, String> {
    let mut ids = Vec::new();
    for entry in entries {
        let id = match entry.id {
            Some(id) => id,
            None => {
                let trimmed = entry.name.trim();
                if trimmed.is_empty() {
                    continue;
                }
                queries::find_or_create_friend(pool, trimmed)
                    .await
                    .map_err(|e| e.to_string())?
            }
        };
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    Ok(ids)
}

#[specta::specta]
#[tauri::command]
pub async fn get_events(pool: State<'_, SqlitePool>) -> Result<Vec<EventDetail>, String> {
    queries::get_all_events(&pool).await.map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_upcoming_events(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<UpcomingEvent>, String> {
    queries::get_upcoming_events(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn get_event(pool: State<'_, SqlitePool>, event_id: i64) -> Result<Option<EventDetail>, String> {
    queries::get_event_by_id(&pool, event_id)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
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

#[specta::specta]
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
    let mut new_artist_ids: Vec<i64> = Vec::new();
    for entry in &input.artists {
        let id = match entry.id {
            // Existing artist — link by id; the display name is ignored.
            Some(id) => id,
            // New name — find-or-create, and count a genuine insert as new so
            // only it triggers the MusicBrainz metadata fetch below.
            None => {
                let trimmed = entry.name.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let (id, was_inserted) = queries::find_or_create_artist(&pool, trimmed)
                    .await
                    .map_err(|e| e.to_string())?;
                if was_inserted {
                    new_artist_ids.push(id);
                }
                id
            }
        };
        artists.push((id, entry.set_group));
    }

    let friend_ids = resolve_friend_ids(&pool, &input.friends).await?;

    let event_id = queries::create_event(
        &pool,
        queries::EventWrite {
            name: &input.name,
            date: &input.date,
            end_date: input.end_date.as_deref(),
            notes: input.notes.as_deref(),
            venue_id,
            artists: &artists,
            friends: &friend_ids,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    // Only kick off MusicBrainz lookups when we actually inserted new
    // artists. Unlike the old unconditional spawn — which re-scanned every
    // un-matched artist in the DB on every event creation — this hits the
    // network exactly once per truly-new name.
    if !new_artist_ids.is_empty() {
        let pool_clone = pool.inner().clone();
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            let _ = genres::fetch_genres_bg(&pool_clone, &app_clone, Some(new_artist_ids)).await;
        });
    }

    Ok(event_id)
}

#[specta::specta]
#[tauri::command]
pub async fn update_event(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
    input: CreateEventInput,
) -> Result<(), String> {
    // Editing updates the event's existing venue/location *in place* by id,
    // unlike create_event's find-or-create. Without this, each debounced
    // auto-save during a rename find-or-creates a brand-new venue/location for
    // every half-typed string. Pull the current ids off the event row.
    let (current_venue_id, current_location_id): (i64, i64) = sqlx::query_as(
        "SELECT e.venue_id, v.location_id FROM events e
         JOIN venues v ON e.venue_id = v.id
         WHERE e.id = ?1",
    )
    .bind(event_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let location_id =
        queries::update_or_resolve_location(&pool, current_location_id, &input.city, &input.state)
            .await
            .map_err(|e| e.to_string())?;

    let venue_id = queries::update_or_resolve_venue(&pool, current_venue_id, &input.venue, location_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut artists = Vec::new();
    let mut new_artist_ids: Vec<i64> = Vec::new();
    for entry in &input.artists {
        let id = match entry.id {
            // Existing artist — link by id; the display name is ignored.
            Some(id) => id,
            // New name — find-or-create, and count a genuine insert as new so
            // only it triggers the MusicBrainz metadata fetch below.
            None => {
                let trimmed = entry.name.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let (id, was_inserted) = queries::find_or_create_artist(&pool, trimmed)
                    .await
                    .map_err(|e| e.to_string())?;
                if was_inserted {
                    new_artist_ids.push(id);
                }
                id
            }
        };
        artists.push((id, entry.set_group));
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
            media::rename_event_folder(&app_dir, event_id, &old_name, &input.name)?;
        }
    }

    let friend_ids = resolve_friend_ids(&pool, &input.friends).await?;

    queries::update_event(
        &pool,
        event_id,
        queries::EventWrite {
            name: &input.name,
            date: &input.date,
            end_date: input.end_date.as_deref(),
            notes: input.notes.as_deref(),
            venue_id,
            artists: &artists,
            friends: &friend_ids,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    // Same policy as create_event: a rename, a date change, or a venue
    // change shouldn't trigger a MusicBrainz sweep. Only spawn the fetch
    // when the user's edit actually introduced new artist names.
    if !new_artist_ids.is_empty() {
        let pool_clone = pool.inner().clone();
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            let _ = genres::fetch_genres_bg(&pool_clone, &app_clone, Some(new_artist_ids)).await;
        });
    }

    Ok(())
}

#[specta::specta]
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

#[specta::specta]
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
        media::remove_event_folder(&app_dir, event_id, &name);
    }

    Ok(())
}
