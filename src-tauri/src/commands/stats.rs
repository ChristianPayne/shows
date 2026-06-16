use sqlx::SqlitePool;
use tauri::State;

use crate::db::models::Stats;
use crate::db::queries;

#[specta::specta]
#[tauri::command]
pub async fn get_stats(pool: State<'_, SqlitePool>) -> Result<Stats, String> {
    let mut stats = queries::get_stats(&pool).await.map_err(|e| e.to_string())?;
    // Only the "Most Seen With" friends are people — top artists/venues are
    // public and stay intact.
    if crate::util::streamer_mode_enabled(&pool).await {
        for friend in stats.top_friends.iter_mut() {
            friend.name = crate::util::mask_first_name(&friend.name);
        }
    }
    Ok(stats)
}
