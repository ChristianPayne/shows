use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;
use tauri::Manager;
use zip::write::{SimpleFileOptions, ZipWriter};
use zip::{CompressionMethod, ZipArchive};

use crate::db;
use crate::util::media_root;

/// Name used for the database entry inside every zip backup. Restore looks
/// for exactly this name, so don't change it without a format version bump.
const DB_ENTRY: &str = "shows.db";

/// Root prefix for media entries inside new zip backups. Matches the on-disk
/// layout under the app data dir so restore extracts directly to
/// `<app_data_dir>/media/`. Pre-v14 backups used `images/` — `restore_from_zip`
/// accepts both prefixes so legacy backups still round-trip.
const MEDIA_PREFIX: &str = "media/";
const LEGACY_IMAGES_PREFIX: &str = "images/";

#[specta::specta]
#[tauri::command]
pub async fn backup_database(
    app_handle: tauri::AppHandle,
    destination: String,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

    let db_source = db::db_path(&app_data_dir);
    if !db_source.exists() {
        return Err("Database file not found".to_string());
    }

    let dest_path = PathBuf::from(&destination);

    // Write to a sibling `.part` file and rename on success. Same-filesystem
    // rename is atomic, so the final path never exists in a half-written
    // state — without this, the user can spot the in-progress zip in Finder
    // and try to open it before `zip.finish()` writes the central directory.
    let part_path = {
        let mut name = dest_path
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_default();
        name.push(".part");
        dest_path.with_file_name(name)
    };

    if part_path.exists() {
        let _ = std::fs::remove_file(&part_path);
    }

    if let Err(e) = write_backup_zip(&part_path, &db_source, &app_data_dir) {
        let _ = std::fs::remove_file(&part_path);
        return Err(e);
    }

    if let Err(e) = std::fs::rename(&part_path, &dest_path) {
        let _ = std::fs::remove_file(&part_path);
        return Err(format!("Failed to finalize backup file: {}", e));
    }

    Ok(destination)
}

fn write_backup_zip(part_path: &Path, db_source: &Path, app_data_dir: &Path) -> Result<(), String> {
    let dest_file = File::create(part_path)
        .map_err(|e| format!("Failed to create backup file: {}", e))?;

    let mut zip = ZipWriter::new(dest_file);
    // Deflate is the safe default — Stored would skip compression (fine for
    // already-compressed JPEG/PNG but would bloat the DB). Deflate keeps both
    // reasonable and preserves a single cross-platform decoder path.
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file(DB_ENTRY, options)
        .map_err(|e| format!("Failed to start DB entry: {}", e))?;
    let db_bytes = std::fs::read(db_source)
        .map_err(|e| format!("Failed to read database file: {}", e))?;
    zip.write_all(&db_bytes)
        .map_err(|e| format!("Failed to write database to zip: {}", e))?;

    let root = media_root(app_data_dir);
    if root.exists() {
        add_dir_recursive(&mut zip, &root, &root, options)?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize backup zip: {}", e))?;

    Ok(())
}

/// Walk `dir` recursively, adding every file into the zip with a path
/// relative to `root`, prefixed with `media/` so the archive mirrors the
/// on-disk layout.
fn add_dir_recursive(
    zip: &mut ZipWriter<File>,
    root: &Path,
    dir: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read {}: {}", dir.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();
        if path.is_dir() {
            add_dir_recursive(zip, root, &path, options)?;
            continue;
        }

        let rel = path
            .strip_prefix(root)
            .map_err(|e| format!("Path strip failed: {}", e))?;
        let name = format!("{}{}", MEDIA_PREFIX, rel.to_string_lossy().replace('\\', "/"));

        zip.start_file(&name, options)
            .map_err(|e| format!("Failed to start entry {}: {}", name, e))?;
        let bytes =
            std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        zip.write_all(&bytes)
            .map_err(|e| format!("Failed to write entry {}: {}", name, e))?;
    }
    Ok(())
}

#[specta::specta]
#[tauri::command]
pub async fn restore_database(
    app_handle: tauri::AppHandle,
    source: String,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

    let source_path = PathBuf::from(&source);
    if !source_path.exists() {
        return Err("Backup file not found".to_string());
    }

    // Peek the first 4 bytes to decide which restore path to run. SQLite files
    // begin with `SQLite format 3\0`, zip files begin with `PK\x03\x04`.
    let mut header = [0u8; 4];
    {
        let mut f = File::open(&source_path)
            .map_err(|e| format!("Failed to open backup file: {}", e))?;
        let _ = f.read(&mut header);
    }

    if &header == b"PK\x03\x04" {
        restore_from_zip(&app_data_dir, &source_path).await
    } else if header.starts_with(b"SQLi") {
        restore_legacy_db(&app_data_dir, &source_path).await
    } else {
        Err("Selected file is not a valid backup (expected .zip or .db)".to_string())
    }
}

/// Legacy path: raw .db file from before image backups existed. Replace only
/// the database; any images on disk are left in place (they may be orphaned
/// if the legacy DB doesn't have the rows, which is the intentional trade-off
/// for preserving backwards compatibility).
async fn restore_legacy_db(app_data_dir: &Path, source_path: &Path) -> Result<(), String> {
    let dest = db::db_path(app_data_dir);

    let backup_version = read_backup_schema_version(source_path).await?;
    guard_against_newer(backup_version)?;

    std::fs::copy(source_path, &dest)
        .map_err(|e| format!("Failed to restore database: {}", e))?;
    Ok(())
}

async fn restore_from_zip(app_data_dir: &Path, source_path: &Path) -> Result<(), String> {
    let file =
        File::open(source_path).map_err(|e| format!("Failed to open backup zip: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read backup zip: {}", e))?;

    // Extract the DB to a temp location first so we can run the schema guard
    // against it before touching the real file.
    let tmp_dir = std::env::temp_dir().join(format!("shows-restore-{}", std::process::id()));
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let tmp_db = tmp_dir.join("shows.db");

    {
        let mut db_entry = archive
            .by_name(DB_ENTRY)
            .map_err(|_| format!("Backup zip missing {}", DB_ENTRY))?;
        let mut out = File::create(&tmp_db)
            .map_err(|e| format!("Failed to write temp DB: {}", e))?;
        std::io::copy(&mut db_entry, &mut out)
            .map_err(|e| format!("Failed to extract DB: {}", e))?;
    }

    let backup_version = read_backup_schema_version(&tmp_db).await?;
    if let Err(e) = guard_against_newer(backup_version) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(e);
    }

    // Swap the database first. If anything below fails, the user at least
    // has the new DB — images are secondary to data integrity.
    let dest_db = db::db_path(app_data_dir);
    std::fs::copy(&tmp_db, &dest_db)
        .map_err(|e| format!("Failed to install restored DB: {}", e))?;

    // Now swap the media directory. Rename-old → extract-new → delete-old,
    // with a rollback to the stashed directory if extraction fails.
    let media_dest = media_root(app_data_dir);
    let stash = app_data_dir.join("media.old");
    if stash.exists() {
        let _ = std::fs::remove_dir_all(&stash);
    }
    if media_dest.exists() {
        std::fs::rename(&media_dest, &stash)
            .map_err(|e| format!("Failed to stash existing media: {}", e))?;
    }

    std::fs::create_dir_all(&media_dest)
        .map_err(|e| format!("Failed to create media dir: {}", e))?;

    let extract_result = extract_media(&mut archive, &media_dest);
    match extract_result {
        Ok(_) => {
            if stash.exists() {
                let _ = std::fs::remove_dir_all(&stash);
            }
        }
        Err(e) => {
            // Roll back: drop the half-extracted tree and put the stash back.
            let _ = std::fs::remove_dir_all(&media_dest);
            if stash.exists() {
                let _ = std::fs::rename(&stash, &media_dest);
            }
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Err(e);
        }
    }

    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(())
}

/// Extract every media entry from the archive into `dest`. New-format
/// backups use the `media/` prefix; legacy backups (pre-v14) used `images/`,
/// and we accept both so old zips still restore into the current `media/`
/// layout. Entries outside both prefixes are ignored — the only other
/// expected entry is `shows.db`, which the caller has already handled.
fn extract_media(archive: &mut ZipArchive<File>, dest: &Path) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        let name = entry.name().to_string();
        let rel = if let Some(r) = name.strip_prefix(MEDIA_PREFIX) {
            r
        } else if let Some(r) = name.strip_prefix(LEGACY_IMAGES_PREFIX) {
            r
        } else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        // Guard against path traversal — reject entries with `..` segments.
        if rel.split('/').any(|seg| seg == ".." || seg.is_empty()) {
            return Err(format!("Unsafe path in backup: {}", name));
        }
        let target = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&target)
                .map_err(|e| format!("Failed to create dir {}: {}", target.display(), e))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create dir {}: {}", parent.display(), e))?;
        }
        let mut out = File::create(&target)
            .map_err(|e| format!("Failed to write {}: {}", target.display(), e))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("Failed to extract {}: {}", name, e))?;
    }
    Ok(())
}

/// Refuse to restore a backup whose schema_version exceeds what this build
/// knows. The migration runner only rolls forward, so accepting a newer-
/// version DB would leave the app unable to read its own file on next launch.
fn guard_against_newer(backup_version: i64) -> Result<(), String> {
    let current_max = db::max_schema_version();
    if backup_version > current_max {
        return Err(format!(
            "This backup was created by a newer version of shows (database v{}). \
             This installation only supports up to database v{}. \
             Update the app first, then restore the backup.",
            backup_version, current_max
        ));
    }
    Ok(())
}

/// Open the backup file read-only and read its highest applied schema version.
/// Returns 0 if `schema_version` is missing or empty (a valid pre-migration
/// state — restoration is allowed and the app's migration runner will catch
/// it up on next launch).
async fn read_backup_schema_version(path: &Path) -> Result<i64, String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);

    let pool = SqlitePool::connect_with(options)
        .await
        .map_err(|e| format!("Could not open backup file: {}", e))?;

    let result: Result<Option<i64>, sqlx::Error> =
        sqlx::query_scalar("SELECT MAX(version) FROM schema_version")
            .fetch_one(&pool)
            .await;

    pool.close().await;

    match result {
        Ok(v) => Ok(v.unwrap_or(0)),
        Err(_) => Ok(0),
    }
}
