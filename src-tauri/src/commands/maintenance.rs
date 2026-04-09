use sqlx::SqlitePool;
use tauri::State;

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
