use std::path::PathBuf;
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

    std::fs::copy(&source_path, &dest)
        .map_err(|e| format!("Failed to restore database: {}", e))?;

    Ok(())
}
