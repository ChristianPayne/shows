use std::path::{Path, PathBuf};

use sqlx::SqlitePool;
use tauri::{Manager, State};
use uuid::Uuid;

use crate::db::models::{EventImage, EventImageRow};
use crate::util::{event_folder_path, images_root};

/// File extensions we accept. HEIC intentionally excluded — decoding it would
/// require pulling in `libheif` or the `image` crate, which we don't need for
/// the MVP.
const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif"];

fn ext_allowed(ext: &str) -> bool {
    let lower = ext.to_ascii_lowercase();
    ALLOWED_EXTENSIONS.iter().any(|e| *e == lower)
}

/// Resolve the app data directory via the Tauri path API. Wrapped so callers
/// get a `String` error instead of a `tauri::Error`.
fn app_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))
}

async fn fetch_event_name(pool: &SqlitePool, event_id: i64) -> Result<String, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT name FROM events WHERE id = ?1")
        .bind(event_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    row.map(|(name,)| name)
        .ok_or_else(|| format!("Event {} not found", event_id))
}

/// Turn a DB row plus the event's current name into the shape the frontend
/// expects — a path it can wrap with `convertFileSrc`. `event_name` and
/// `event_date` are left empty for the per-event query; the bulk query fills
/// them in for the cross-entity gallery captions.
fn build_event_image(
    row: EventImageRow,
    app_data_dir: &Path,
    event_name: &str,
    event_date: Option<String>,
    include_event_meta: bool,
) -> EventImage {
    let folder = event_folder_path(app_data_dir, row.event_id, event_name);
    let absolute = folder.join(&row.filename);
    EventImage {
        id: row.id,
        event_id: row.event_id,
        filename: row.filename,
        mime_type: row.mime_type,
        file_size: row.file_size,
        caption: row.caption,
        created_at: row.created_at,
        absolute_path: absolute.to_string_lossy().into_owned(),
        event_name: if include_event_meta {
            Some(event_name.to_string())
        } else {
            None
        },
        event_date: if include_event_meta { event_date } else { None },
    }
}

#[tauri::command]
pub async fn add_event_image(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
    source_path: String,
) -> Result<EventImage, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "File has no extension".to_string())?
        .to_ascii_lowercase();

    if !ext_allowed(&ext) {
        return Err(format!(
            "Unsupported file type '.{}'. Allowed: {}",
            ext,
            ALLOWED_EXTENSIONS.join(", ")
        ));
    }

    let event_name = fetch_event_name(pool.inner(), event_id).await?;
    let app_dir = app_data_dir(&app_handle)?;
    let folder = event_folder_path(&app_dir, event_id, &event_name);
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Failed to create image folder: {}", e))?;

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let target = folder.join(&filename);
    std::fs::copy(&source, &target).map_err(|e| format!("Failed to copy image: {}", e))?;

    let file_size = std::fs::metadata(&target)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let mime_type = mime_guess::from_path(&target)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    let insert = sqlx::query(
        "INSERT INTO event_images (event_id, filename, mime_type, file_size) \
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(event_id)
    .bind(&filename)
    .bind(&mime_type)
    .bind(file_size)
    .execute(pool.inner())
    .await;

    let result = match insert {
        Ok(r) => r,
        Err(e) => {
            // Roll back the file copy so we don't leave an orphaned blob.
            let _ = std::fs::remove_file(&target);
            return Err(format!("Failed to record image: {}", e));
        }
    };

    let row: EventImageRow = sqlx::query_as(
        "SELECT id, event_id, filename, mime_type, file_size, caption, created_at \
         FROM event_images WHERE id = ?1",
    )
    .bind(result.last_insert_rowid())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(build_event_image(row, &app_dir, &event_name, None, false))
}

#[tauri::command]
pub async fn get_event_images(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
) -> Result<Vec<EventImage>, String> {
    let event_name = fetch_event_name(pool.inner(), event_id).await?;
    let app_dir = app_data_dir(&app_handle)?;

    let rows: Vec<EventImageRow> = sqlx::query_as(
        "SELECT id, event_id, filename, mime_type, file_size, caption, created_at \
         FROM event_images WHERE event_id = ?1 ORDER BY created_at ASC",
    )
    .bind(event_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| build_event_image(r, &app_dir, &event_name, None, false))
        .collect())
}

#[tauri::command]
pub async fn get_images_for_events(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_ids: Vec<i64>,
) -> Result<Vec<EventImage>, String> {
    if event_ids.is_empty() {
        return Ok(Vec::new());
    }
    let app_dir = app_data_dir(&app_handle)?;

    // SQLite bound parameters can't take a list directly, so expand a
    // placeholder for each id. event_ids is trusted (comes from our own DB
    // via the frontend), so inlining it is safe — but we bind anyway for
    // consistency and to sidestep any future accidental injection.
    let placeholders = std::iter::repeat_n("?", event_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT i.id, i.event_id, i.filename, i.mime_type, i.file_size, i.caption, i.created_at, \
                e.name AS event_name, e.date AS event_date \
         FROM event_images i \
         JOIN events e ON e.id = i.event_id \
         WHERE i.event_id IN ({}) \
         ORDER BY e.date DESC, i.created_at ASC",
        placeholders
    );

    let mut query = sqlx::query_as::<_, JoinedImageRow>(&sql);
    for id in &event_ids {
        query = query.bind(id);
    }
    let rows: Vec<JoinedImageRow> = query
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|j| {
            let row = EventImageRow {
                id: j.id,
                event_id: j.event_id,
                filename: j.filename,
                mime_type: j.mime_type,
                file_size: j.file_size,
                caption: j.caption,
                created_at: j.created_at,
            };
            build_event_image(row, &app_dir, &j.event_name, Some(j.event_date), true)
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct JoinedImageRow {
    id: i64,
    event_id: i64,
    filename: String,
    mime_type: String,
    file_size: i64,
    caption: Option<String>,
    created_at: String,
    event_name: String,
    event_date: String,
}

#[tauri::command]
pub async fn delete_event_image(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    image_id: i64,
) -> Result<(), String> {
    let row: Option<(i64, String)> =
        sqlx::query_as("SELECT event_id, filename FROM event_images WHERE id = ?1")
            .bind(image_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    let (event_id, filename) = match row {
        Some(r) => r,
        None => return Ok(()), // already gone — treat as success
    };

    let event_name = fetch_event_name(pool.inner(), event_id).await?;
    let app_dir = app_data_dir(&app_handle)?;
    let folder = event_folder_path(&app_dir, event_id, &event_name);
    let target = folder.join(&filename);

    sqlx::query("DELETE FROM event_images WHERE id = ?1")
        .bind(image_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Best-effort file removal: if the file is already gone, don't fail the
    // command — the DB row is the source of truth the UI reacts to.
    let _ = std::fs::remove_file(&target);

    // If the folder is now empty, clean it up so the images/ tree doesn't
    // collect empty directories after the user deletes everything for an event.
    if let Ok(mut iter) = std::fs::read_dir(&folder) {
        if iter.next().is_none() {
            let _ = std::fs::remove_dir(&folder);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn update_event_image_caption(
    pool: State<'_, SqlitePool>,
    image_id: i64,
    caption: Option<String>,
) -> Result<(), String> {
    sqlx::query("UPDATE event_images SET caption = ?1 WHERE id = ?2")
        .bind(caption)
        .bind(image_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers callable from other command modules ──

/// Rename the on-disk image folder when an event's name changes. Called by
/// `events::update_event` *before* the DB update so a filesystem failure
/// aborts cleanly without leaving the two stores inconsistent.
///
/// No-op if the old folder doesn't exist (event had no images yet) or the
/// slugified names are identical (different display name, same slug).
pub fn rename_event_folder(
    app_data_dir: &Path,
    event_id: i64,
    old_name: &str,
    new_name: &str,
) -> Result<(), String> {
    let old = event_folder_path(app_data_dir, event_id, old_name);
    let new = event_folder_path(app_data_dir, event_id, new_name);
    if old == new || !old.exists() {
        return Ok(());
    }
    std::fs::rename(&old, &new)
        .map_err(|e| format!("Failed to rename image folder: {}", e))
}

/// Remove an event's on-disk folder. Called by `events::delete_event` after
/// the SQLite cascade has already fired on event_images rows — the files
/// themselves still need cleanup since the cascade can't reach the filesystem.
pub fn remove_event_folder(app_data_dir: &Path, event_id: i64, event_name: &str) {
    let folder = event_folder_path(app_data_dir, event_id, event_name);
    if folder.exists() {
        let _ = std::fs::remove_dir_all(&folder);
    }
}

/// Nuke the entire images root. Called by `wipe_database`.
pub fn remove_images_root(app_data_dir: &Path) {
    let root = images_root(app_data_dir);
    if root.exists() {
        let _ = std::fs::remove_dir_all(&root);
    }
}
