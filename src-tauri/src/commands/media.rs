use std::path::{Path, PathBuf};

use sqlx::SqlitePool;
use tauri::{Manager, State};
use uuid::Uuid;

use crate::db::models::{EventMedia, EventMediaRow};
use crate::metadata;
use crate::util::{event_folder_name, event_folder_path, media_root};

/// File extensions we accept. Images are the same set as before; videos
/// cover the common iPhone/desktop formats. Codec support for MOV/HEVC is
/// platform-dependent — see the release notes for the Windows HEVC caveat.
const ALLOWED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "gif", // images
    "mp4", "webm", "mov", // videos
];

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
fn build_event_media(
    row: EventMediaRow,
    app_data_dir: &Path,
    event_name: &str,
    event_date: Option<String>,
    include_event_meta: bool,
) -> EventMedia {
    let folder = event_folder_path(app_data_dir, row.event_id, event_name);
    let absolute = folder.join(&row.filename);
    EventMedia {
        id: row.id,
        event_id: row.event_id,
        filename: row.filename,
        mime_type: row.mime_type,
        file_size: row.file_size,
        caption: row.caption,
        created_at: row.created_at,
        captured_at: row.captured_at,
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
pub async fn add_event_media(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
    source_path: String,
) -> Result<EventMedia, String> {
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
        .map_err(|e| format!("Failed to create media folder: {}", e))?;

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let target = folder.join(&filename);
    std::fs::copy(&source, &target).map_err(|e| format!("Failed to copy media: {}", e))?;

    let file_size = std::fs::metadata(&target)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let mime_type = mime_guess::from_path(&target)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    // Read capture timestamp from the copied file (same bytes as the
    // original, so EXIF/mvhd is intact). Best-effort — a `None` here just
    // means this item falls back to upload-order sorting.
    let captured_at = metadata::extract_captured_at(&target, &mime_type);

    let insert = sqlx::query(
        "INSERT INTO event_media (event_id, filename, mime_type, file_size, captured_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(event_id)
    .bind(&filename)
    .bind(&mime_type)
    .bind(file_size)
    .bind(&captured_at)
    .execute(pool.inner())
    .await;

    let result = match insert {
        Ok(r) => r,
        Err(e) => {
            // Roll back the file copy so we don't leave an orphaned blob.
            let _ = std::fs::remove_file(&target);
            return Err(format!("Failed to record media: {}", e));
        }
    };

    let row: EventMediaRow = sqlx::query_as(
        "SELECT id, event_id, filename, mime_type, file_size, caption, created_at, captured_at \
         FROM event_media WHERE id = ?1",
    )
    .bind(result.last_insert_rowid())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(build_event_media(row, &app_dir, &event_name, None, false))
}

#[tauri::command]
pub async fn get_event_media(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_id: i64,
) -> Result<Vec<EventMedia>, String> {
    let event_name = fetch_event_name(pool.inner(), event_id).await?;
    let app_dir = app_data_dir(&app_handle)?;

    // Chronological sort: media with a real captured_at timestamp lead in
    // the order they were taken; everything without one (screenshots, WebP,
    // etc.) falls back to upload order. SQLite sorts NULLs first by default,
    // so `captured_at IS NULL` as the first key flips that — real timestamps
    // render ahead of the null bucket.
    let rows: Vec<EventMediaRow> = sqlx::query_as(
        "SELECT id, event_id, filename, mime_type, file_size, caption, created_at, captured_at \
         FROM event_media \
         WHERE event_id = ?1 \
         ORDER BY captured_at IS NULL, captured_at ASC, created_at ASC",
    )
    .bind(event_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| build_event_media(r, &app_dir, &event_name, None, false))
        .collect())
}

#[tauri::command]
pub async fn get_media_for_events(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    event_ids: Vec<i64>,
) -> Result<Vec<EventMedia>, String> {
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
        "SELECT m.id, m.event_id, m.filename, m.mime_type, m.file_size, m.caption, m.created_at, m.captured_at, \
                e.name AS event_name, e.date AS event_date \
         FROM event_media m \
         JOIN events e ON e.id = m.event_id \
         WHERE m.event_id IN ({}) \
         ORDER BY e.date DESC, m.captured_at IS NULL, m.captured_at ASC, m.created_at ASC",
        placeholders
    );

    let mut query = sqlx::query_as::<_, JoinedMediaRow>(&sql);
    for id in &event_ids {
        query = query.bind(id);
    }
    let rows: Vec<JoinedMediaRow> = query
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|j| {
            let row = EventMediaRow {
                id: j.id,
                event_id: j.event_id,
                filename: j.filename,
                mime_type: j.mime_type,
                file_size: j.file_size,
                caption: j.caption,
                created_at: j.created_at,
                captured_at: j.captured_at,
            };
            build_event_media(row, &app_dir, &j.event_name, Some(j.event_date), true)
        })
        .collect())
}

/// Every media item across every event, for the top-level Media tab. Shares
/// `get_media_for_events`'s JOIN shape (event name + date populated), and
/// matches its sort so the Media tab groups naturally by event in the same
/// order per-event galleries render internally. Intentionally unpaginated —
/// a personal tracker with a few hundred items renders fine, and streaming
/// adds complexity we don't need yet.
#[tauri::command]
pub async fn get_all_media(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<EventMedia>, String> {
    let app_dir = app_data_dir(&app_handle)?;

    let rows: Vec<JoinedMediaRow> = sqlx::query_as(
        "SELECT m.id, m.event_id, m.filename, m.mime_type, m.file_size, m.caption, m.created_at, m.captured_at, \
                e.name AS event_name, e.date AS event_date \
         FROM event_media m \
         JOIN events e ON e.id = m.event_id \
         ORDER BY e.date DESC, m.captured_at IS NULL, m.captured_at ASC, m.created_at ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|j| {
            let row = EventMediaRow {
                id: j.id,
                event_id: j.event_id,
                filename: j.filename,
                mime_type: j.mime_type,
                file_size: j.file_size,
                caption: j.caption,
                created_at: j.created_at,
                captured_at: j.captured_at,
            };
            build_event_media(row, &app_dir, &j.event_name, Some(j.event_date), true)
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct JoinedMediaRow {
    id: i64,
    event_id: i64,
    filename: String,
    mime_type: String,
    file_size: i64,
    caption: Option<String>,
    created_at: String,
    captured_at: Option<String>,
    event_name: String,
    event_date: String,
}

#[tauri::command]
pub async fn delete_event_media(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    media_id: i64,
) -> Result<(), String> {
    let row: Option<(i64, String)> =
        sqlx::query_as("SELECT event_id, filename FROM event_media WHERE id = ?1")
            .bind(media_id)
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

    sqlx::query("DELETE FROM event_media WHERE id = ?1")
        .bind(media_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Best-effort file removal: if the file is already gone, don't fail the
    // command — the DB row is the source of truth the UI reacts to.
    let _ = std::fs::remove_file(&target);

    // If the folder is now empty, clean it up so the media/ tree doesn't
    // collect empty directories after the user deletes everything for an event.
    if let Ok(mut iter) = std::fs::read_dir(&folder) {
        if iter.next().is_none() {
            let _ = std::fs::remove_dir(&folder);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn update_event_media_caption(
    pool: State<'_, SqlitePool>,
    media_id: i64,
    caption: Option<String>,
) -> Result<(), String> {
    sqlx::query("UPDATE event_media SET caption = ?1 WHERE id = ?2")
        .bind(caption)
        .bind(media_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers callable from other command modules ──

/// Rename the on-disk media folder when an event's name changes. Called by
/// `events::update_event` *before* the DB update so a filesystem failure
/// aborts cleanly without leaving the two stores inconsistent.
///
/// No-op if the old folder doesn't exist (event had no media yet) or the
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
        .map_err(|e| format!("Failed to rename media folder: {}", e))
}

/// Remove an event's on-disk folder. Called by `events::delete_event` after
/// the SQLite cascade has already fired on event_media rows — the files
/// themselves still need cleanup since the cascade can't reach the filesystem.
pub fn remove_event_folder(app_data_dir: &Path, event_id: i64, event_name: &str) {
    let folder = event_folder_path(app_data_dir, event_id, event_name);
    if folder.exists() {
        let _ = std::fs::remove_dir_all(&folder);
    }
}

/// Nuke the entire media root. Called by `wipe_database`.
pub fn remove_media_root(app_data_dir: &Path) {
    let root = media_root(app_data_dir);
    if root.exists() {
        let _ = std::fs::remove_dir_all(&root);
    }
}

/// One-shot first-launch migration for the dev/release media split.
///
/// Before this split, both `shows.db` and `shows_dev.db` shared the same
/// `media/` folder, so dev uploads and release uploads were interleaved on
/// disk with no way to tell them apart. After the split, dev writes to
/// `media_dev/` and release writes to `media/`.
///
/// On first launch after the split, we need to move the *dev-owned* files
/// out of the shared folder into their new home. The DB is the source of
/// truth for which files belong to the current build: every row in
/// `event_media` points (via `<slug>-<id>`) at a folder that belongs to
/// whichever DB we're currently running against. We walk that list and
/// move the matching folders.
///
/// Release build is a transparent no-op:
/// - `media_root()` returns `media` in release, so `new_root == old_root`
/// - The `new_root == old_root` early return fires and nothing happens
///
/// Dev build on a fresh install is also a no-op: the old `media/` folder
/// doesn't exist, so there's nothing to move.
///
/// Safe to call on every startup: once `media_dev/` exists, the outer
/// guard skips everything.
pub async fn migrate_dev_media_split(
    pool: &SqlitePool,
    app_data_dir: &Path,
) -> Result<(), String> {
    let new_root = media_root(app_data_dir);
    let old_root = app_data_dir.join("media");

    // Release build (or any build where the names collide): nothing to do.
    if new_root == old_root {
        return Ok(());
    }

    // Already migrated — the presence of the new root is the sentinel.
    if new_root.exists() {
        return Ok(());
    }

    // Nothing to migrate from — fresh dev install with no prior uploads.
    if !old_root.exists() {
        return Ok(());
    }

    std::fs::create_dir_all(&new_root)
        .map_err(|e| format!("Failed to create media_dev: {}", e))?;

    // Pull every event that has attached media, with its current name so
    // we can recompute the current folder slug. Renames already keep the
    // folder in sync with `events.name` (see `rename_event_folder` in
    // events.rs), so the current-name slug is the right one to look for.
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT DISTINCT e.id, e.name \
         FROM events e JOIN event_media m ON m.event_id = e.id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to enumerate dev media folders: {}", e))?;

    let mut moved = 0usize;
    for (id, name) in &rows {
        let folder_name = event_folder_name(*id, name);
        let old = old_root.join(&folder_name);
        let new = new_root.join(&folder_name);
        if old.exists() && !new.exists() {
            std::fs::rename(&old, &new).map_err(|e| {
                format!("Failed to move {} → media_dev/: {}", folder_name, e)
            })?;
            moved += 1;
        }
    }

    eprintln!(
        "[dev] media split migration: moved {} event folder(s) into media_dev/",
        moved
    );
    Ok(())
}
