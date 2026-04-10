pub mod models;
pub mod queries;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::str::FromStr;

/// All migrations in order. Each runs exactly once.
/// The index + 1 is the version number.
const MIGRATIONS: &[&str] = &[
    // v1: initial schema
    include_str!("../../migrations/001_initial_schema.sql"),
    // v2: add set_group to event_artists for b2b support
    include_str!("../../migrations/002_add_set_group.sql"),
    // v3: split b2b artists (handled in Rust, marker only)
    "", // procedural migration — handled below
    // v4: add end_date to events
    include_str!("../../migrations/004_add_end_date.sql"),
    // v5: add cancelled flag to events
    include_str!("../../migrations/005_add_cancelled.sql"),
    // v6: add genre to artists
    include_str!("../../migrations/006_add_genre.sql"),
    // v7: add country, type, tags, active period to artists
    include_str!("../../migrations/007_add_artist_metadata.sql"),
    // v8: add disambiguation to artists
    include_str!("../../migrations/008_add_disambiguation.sql"),
    // v9: add mbid to artists for tracking manual matches
    include_str!("../../migrations/009_add_mbid.sql"),
    // v10: add external links to artists
    include_str!("../../migrations/010_add_artist_links.sql"),
];

/// Initialize the SQLite database, run pending migrations, and return the connection pool.
pub async fn init(app_data_dir: PathBuf) -> Result<SqlitePool, sqlx::Error> {
    std::fs::create_dir_all(&app_data_dir).ok();

    let db_name = if cfg!(debug_assertions) { "shows_dev.db" } else { "shows.db" };
    let db_path = app_data_dir.join(db_name);
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Create the version tracking table if it doesn't exist
    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)"
    )
    .execute(&pool)
    .await?;

    // Get current version (0 if no migrations have run)
    let current_version: i64 = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT MAX(version) FROM schema_version"
    )
    .fetch_one(&pool)
    .await?
    .unwrap_or(0);

    // Run any pending migrations
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version <= current_version {
            continue;
        }

        // v3 is a procedural migration
        if version == 3 {
            migrate_b2b_artists(&pool).await?;
        } else if !sql.is_empty() {
            sqlx::raw_sql(sql).execute(&pool).await?;
        }

        // Record that this migration has been applied
        sqlx::query("INSERT INTO schema_version (version) VALUES (?1)")
            .bind(version)
            .execute(&pool)
            .await?;
    }

    Ok(pool)
}

/// Split any artist whose name contains " b2b " into separate artists
/// and update event_artists links with proper set_groups.
async fn migrate_b2b_artists(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let b2b_artists: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, name FROM artists WHERE name LIKE '%b2b%'"
    )
    .fetch_all(pool)
    .await?;

    for (old_artist_id, old_name) in b2b_artists {
        let parts = split_b2b_name(&old_name);
        if parts.len() <= 1 {
            continue;
        }

        let event_ids: Vec<(i64,)> = sqlx::query_as(
            "SELECT event_id FROM event_artists WHERE artist_id = ?1"
        )
        .bind(old_artist_id)
        .fetch_all(pool)
        .await?;

        for (event_id,) in &event_ids {
            let max_group: Option<i64> = sqlx::query_scalar(
                "SELECT MAX(set_group) FROM event_artists WHERE event_id = ?1"
            )
            .bind(event_id)
            .fetch_one(pool)
            .await?;
            let set_group = max_group.unwrap_or(0) + 1;

            sqlx::query("DELETE FROM event_artists WHERE event_id = ?1 AND artist_id = ?2")
                .bind(event_id)
                .bind(old_artist_id)
                .execute(pool)
                .await?;

            for part in &parts {
                let artist_id = find_or_create_artist_raw(pool, part).await?;
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
    let db_name = if cfg!(debug_assertions) { "shows_dev.db" } else { "shows.db" };
    app_data_dir.join(db_name)
}
