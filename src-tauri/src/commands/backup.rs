use std::path::PathBuf;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;
use tauri::Manager;

use crate::db;

#[tauri::command]
pub async fn backup_database(
    app_handle: tauri::AppHandle,
    destination: String,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

    let source = db::db_path(&app_data_dir);

    if !source.exists() {
        return Err("Database file not found".to_string());
    }

    let dest_path = PathBuf::from(&destination);
    std::fs::copy(&source, &dest_path).map_err(|e| format!("Failed to copy database: {}", e))?;

    Ok(destination)
}

#[tauri::command]
pub async fn restore_database(
    app_handle: tauri::AppHandle,
    source: String,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

    let dest = db::db_path(&app_data_dir);
    let source_path = PathBuf::from(&source);

    if !source_path.exists() {
        return Err("Backup file not found".to_string());
    }

    // Verify the source is a valid SQLite database by checking the header
    let header = std::fs::read(&source_path)
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    if header.len() < 16 || &header[..16] != b"SQLite format 3\0" {
        return Err("Selected file is not a valid SQLite database".to_string());
    }

    // Refuse to restore a backup created by a newer version of the app. The
    // migration runner only rolls forward, so a v13 backup restored on a v12
    // app would leave the database in a state the app can't read — and there's
    // no recovery path short of reinstalling the newer app version.
    let backup_version = read_backup_schema_version(&source_path).await?;
    let current_max = db::max_schema_version();
    if backup_version > current_max {
        return Err(format!(
            "This backup was created by a newer version of shows (database v{}). \
             This installation only supports up to database v{}. \
             Update the app first, then restore the backup.",
            backup_version, current_max
        ));
    }

    std::fs::copy(&source_path, &dest)
        .map_err(|e| format!("Failed to restore database: {}", e))?;

    Ok(())
}

/// Open the backup file read-only and read its highest applied schema version.
/// Returns 0 if `schema_version` is missing or empty (a valid pre-migration
/// state — restoration is allowed and the app's migration runner will catch
/// it up on next launch).
async fn read_backup_schema_version(path: &PathBuf) -> Result<i64, String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true);

    let pool = SqlitePool::connect_with(options)
        .await
        .map_err(|e| format!("Could not open backup file: {}", e))?;

    // schema_version may not exist if the backup pre-dates the migration
    // tracking table. In practice every shows backup has it because init
    // creates it before doing anything else, but be defensive.
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
