use sqlx::SqlitePool;
use tauri::State;

/// Returns the highest applied schema migration version. This is the database
/// version, distinct from the app version — useful for surfacing in the UI so
/// users (and bug reports) can pinpoint which schema they're on.
#[tauri::command]
pub async fn get_db_version(pool: State<'_, SqlitePool>) -> Result<i64, String> {
    let version: Option<i64> = sqlx::query_scalar("SELECT MAX(version) FROM schema_version")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(version.unwrap_or(0))
}

#[tauri::command]
pub async fn wipe_database(pool: State<'_, SqlitePool>) -> Result<(), String> {
    // Delete in order that respects foreign keys
    sqlx::query("DELETE FROM event_artists")
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM events")
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM artists")
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM venues")
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM locations")
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
