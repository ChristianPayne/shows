pub mod models;
pub mod queries;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
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
    // v11: setlist cache table
    include_str!("../../migrations/011_add_setlist_cache.sql"),
    // v12: venues own their location; drop location_id from events
    "", // procedural migration — handled below
    // v13: event_images table for per-event lineup/photo attachments
    include_str!("../../migrations/013_event_images.sql"),
    // v14: rename event_images → event_media and images/ → media/ on disk,
    // widening the feature to hold videos as well as images.
    "", // procedural migration — handled below
    // v15: add nullable captured_at column for the media's embedded capture
    // timestamp (EXIF DateTimeOriginal on images, mvhd creation_time on
    // MP4/MOV) so galleries sort chronologically instead of by upload order.
    include_str!("../../migrations/015_media_captured_at.sql"),
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

        // Procedural migrations dispatched by version number
        if version == 3 {
            migrate_b2b_artists(&pool).await?;
        } else if version == 12 {
            migrate_venue_owns_location(&pool).await?;
        } else if version == 14 {
            migrate_rename_media(&pool, &app_data_dir).await?;
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
pub fn db_path(app_data_dir: &Path) -> PathBuf {
    let db_name = if cfg!(debug_assertions) { "shows_dev.db" } else { "shows.db" };
    app_data_dir.join(db_name)
}

/// The highest schema version this build of the app knows how to read.
/// Used by restore to refuse backups created by a newer build of the app,
/// which would otherwise leave the database in an unreadable state on next
/// launch (the migration runner only rolls forward, never back).
pub fn max_schema_version() -> i64 {
    MIGRATIONS.len() as i64
}

/// v12 — Move location ownership from `events` onto `venues`.
///
/// Each venue physically exists in one place, so the (name, location) pair is
/// the natural identity. Previously `events.location_id` lived alongside
/// `events.venue_id` with nothing enforcing they agreed, which let the same
/// venue silently pick up different locations across events.
///
/// Implemented as a raw SQL script (instead of a sqlx transaction) because the
/// table-rebuild dance needs `PRAGMA foreign_keys=OFF` around the DROP/rename
/// steps, and that pragma cannot change inside a sqlx-managed transaction. We
/// hand the whole script to SQLite and let it manage BEGIN/COMMIT itself —
/// SQLite knows how to interleave PRAGMA toggles around its own transactions.
///
/// The script is idempotent against partial failure: if it fails before
/// COMMIT, SQLite rolls back the whole transaction and `schema_version`
/// doesn't advance, so the next launch retries from scratch.
async fn migrate_venue_owns_location(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let sql = r#"
PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

ALTER TABLE venues ADD COLUMN location_id INTEGER REFERENCES locations(id);

UPDATE venues SET location_id = (
    SELECT e.location_id FROM events e
    WHERE e.venue_id = venues.id
    GROUP BY e.location_id
    ORDER BY COUNT(*) DESC, MAX(e.date) DESC
    LIMIT 1
);

DELETE FROM venues WHERE location_id IS NULL;

CREATE TABLE venues_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location_id INTEGER NOT NULL REFERENCES locations(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(name, location_id)
);

INSERT INTO venues_new (id, name, location_id, created_at)
SELECT id, name, location_id, created_at FROM venues;

DROP TABLE venues;
ALTER TABLE venues_new RENAME TO venues;

CREATE TABLE events_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    end_date TEXT,
    cancelled INTEGER NOT NULL DEFAULT 0,
    venue_id INTEGER NOT NULL REFERENCES venues(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO events_new (id, name, date, end_date, cancelled, venue_id, created_at, updated_at)
SELECT id, name, date, end_date, cancelled, venue_id, created_at, updated_at FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_venues_location_id ON venues(location_id);

COMMIT;

PRAGMA foreign_keys=ON;
"#;

    sqlx::raw_sql(sql).execute(pool).await?;
    Ok(())
}

/// v14 — Rename `event_images` → `event_media` and the on-disk `images/`
/// folder → `media/`, reflecting that event attachments now cover both images
/// and videos. Schema itself is otherwise unchanged; `mime_type` is the field
/// that distinguishes images from videos.
///
/// The filesystem rename is the tricky bit. It's intentionally done *before*
/// the SQL changes so that a mid-migration failure lands us in one of two
/// recoverable states:
///
/// 1. Filesystem rename fails → SQL untouched, schema_version stays at 13,
///    next launch retries the whole thing.
/// 2. Filesystem rename succeeds, SQL fails → schema_version still at 13,
///    next launch sees `media/` exists (source `images/` doesn't), skips the
///    rename attempt, retries the SQL. Idempotent.
///
/// We never end up with a renamed table but a still-`images/` folder, which
/// would leave absolute paths in the app broken.
async fn migrate_rename_media(pool: &SqlitePool, app_data_dir: &Path) -> Result<(), sqlx::Error> {
    let old = app_data_dir.join("images");
    let new = app_data_dir.join("media");
    if old.exists() && !new.exists() {
        // If this rename fails we *don't* want to proceed to the SQL changes
        // — bail out and let the next launch retry. Tunnel the io::Error
        // through sqlx::Error::Protocol so we don't need a custom error type.
        std::fs::rename(&old, &new)
            .map_err(|e| sqlx::Error::Protocol(format!("Failed to rename images/ → media/: {}", e)))?;
    }

    let sql = r#"
BEGIN TRANSACTION;

ALTER TABLE event_images RENAME TO event_media;
DROP INDEX IF EXISTS idx_event_images_event_id;
CREATE INDEX idx_event_media_event_id ON event_media(event_id);

COMMIT;
"#;

    sqlx::raw_sql(sql).execute(pool).await?;
    Ok(())
}
