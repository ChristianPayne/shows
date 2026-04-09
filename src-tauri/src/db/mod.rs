pub mod models;
pub mod queries;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::str::FromStr;

/// Initialize the SQLite database, run migrations, and return the connection pool.
pub async fn init(app_data_dir: PathBuf) -> Result<SqlitePool, sqlx::Error> {
    std::fs::create_dir_all(&app_data_dir).ok();

    let db_path = app_data_dir.join("shows.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run migrations embedded at compile time
    let migration_sql = include_str!("../../migrations/001_initial_schema.sql");
    sqlx::raw_sql(migration_sql).execute(&pool).await?;

    // Migration 002: add set_group column (idempotent check)
    let has_set_group: bool = sqlx::query_scalar::<_, String>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='event_artists'"
    )
    .fetch_one(&pool)
    .await
    .map(|sql| sql.contains("set_group"))
    .unwrap_or(false);

    if !has_set_group {
        let migration_002 = include_str!("../../migrations/002_add_set_group.sql");
        sqlx::raw_sql(migration_002).execute(&pool).await?;
    }

    // Migration 003: split existing "b2b" artists into separate entities
    migrate_b2b_artists(&pool).await?;

    // Migration 004: add end_date column
    let has_end_date: bool = sqlx::query_scalar::<_, String>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='events'"
    )
    .fetch_one(&pool)
    .await
    .map(|sql| sql.contains("end_date"))
    .unwrap_or(false);

    if !has_end_date {
        let migration_004 = include_str!("../../migrations/004_add_end_date.sql");
        sqlx::raw_sql(migration_004).execute(&pool).await?;
    }

    // Migration 005: add cancelled column
    let has_cancelled: bool = sqlx::query_scalar::<_, String>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='events'"
    )
    .fetch_one(&pool)
    .await
    .map(|sql| sql.contains("cancelled"))
    .unwrap_or(false);

    if !has_cancelled {
        let migration_005 = include_str!("../../migrations/005_add_cancelled.sql");
        sqlx::raw_sql(migration_005).execute(&pool).await?;
    }

    Ok(pool)
}

/// Split any artist whose name contains " b2b " into separate artists
/// and update event_artists links with proper set_groups.
/// Idempotent — only processes artists that still have "b2b" in their name.
async fn migrate_b2b_artists(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Find all artists with b2b in their name (case-insensitive)
    let b2b_artists: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, name FROM artists WHERE name LIKE '%b2b%'"
    )
    .fetch_all(pool)
    .await?;

    for (old_artist_id, old_name) in b2b_artists {
        // Split the name on " b2b " (case-insensitive)
        let parts = split_b2b_name(&old_name);
        if parts.len() <= 1 {
            continue;
        }

        // Find all events this artist is linked to
        let event_ids: Vec<(i64,)> = sqlx::query_as(
            "SELECT event_id FROM event_artists WHERE artist_id = ?1"
        )
        .bind(old_artist_id)
        .fetch_all(pool)
        .await?;

        for (event_id,) in &event_ids {
            // Determine the next available set_group for this event
            let max_group: Option<i64> = sqlx::query_scalar(
                "SELECT MAX(set_group) FROM event_artists WHERE event_id = ?1"
            )
            .bind(event_id)
            .fetch_one(pool)
            .await?;
            let set_group = max_group.unwrap_or(0) + 1;

            // Remove the old link
            sqlx::query("DELETE FROM event_artists WHERE event_id = ?1 AND artist_id = ?2")
                .bind(event_id)
                .bind(old_artist_id)
                .execute(pool)
                .await?;

            // Create/find each individual artist and link them
            for part in &parts {
                let artist_id = find_or_create_artist_raw(pool, part).await?;
                // Insert, ignoring if this artist is already linked to this event
                sqlx::query(
                    "INSERT OR IGNORE INTO event_artists (event_id, artist_id, set_group) VALUES (?1, ?2, ?3)"
                )
                .bind(event_id)
                .bind(artist_id)
                .bind(set_group)
                .execute(pool)
                .await?;
            }
        }

        // Delete the old b2b artist if it has no remaining links
        sqlx::query(
            "DELETE FROM artists WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM event_artists WHERE artist_id = ?1)"
        )
        .bind(old_artist_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

fn split_b2b_name(name: &str) -> Vec<String> {
    let lower = name.to_lowercase();
    if let Some(pos) = lower.find(" b2b ") {
        let left = name[..pos].trim().to_string();
        let right = name[pos + 5..].trim().to_string();
        let mut result = vec![left];
        result.extend(split_b2b_name(&right));
        result
    } else {
        vec![name.trim().to_string()]
    }
}

async fn find_or_create_artist_raw(pool: &SqlitePool, name: &str) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> = sqlx::query_as("SELECT id FROM artists WHERE name = ?1")
        .bind(name)
        .fetch_optional(pool)
        .await?;
    if let Some((id,)) = row {
        return Ok(id);
    }
    let result = sqlx::query("INSERT INTO artists (name) VALUES (?1)")
        .bind(name)
        .execute(pool)
        .await?;
    Ok(result.last_insert_rowid())
}

/// Get the path to the database file.
pub fn db_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("shows.db")
}
