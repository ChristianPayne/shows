use sqlx::SqlitePool;
use tauri::State;

use crate::db::models::Stats;
use crate::db::queries;

#[tauri::command]
pub async fn get_stats(pool: State<'_, SqlitePool>) -> Result<Stats, String> {
    queries::get_stats(&pool).await.map_err(|e| e.to_string())
}
