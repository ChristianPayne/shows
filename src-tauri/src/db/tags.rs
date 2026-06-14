//! Single boundary for "what tags does an artist have".
//!
//! Tags are user-curated: picked from MusicBrainz suggestions or typed by
//! hand, stored one-per-row in the `artist_tags` table. They're normalized to
//! a canonical form (trimmed, lowercased) on the way in so discovery — "other
//! artists sharing this tag" — is an exact match, not a fuzzy one. Callers
//! talk to `Vec<String>`, never the storage layout, so the table stays a
//! private detail of this module.

use sqlx::SqlitePool;
use std::collections::HashMap;

/// Canonical storage + matching form for a tag: trimmed and lowercased.
/// Returns an empty string for blank input (callers skip empties).
pub fn normalize_tag(raw: &str) -> String {
    raw.trim().to_lowercase()
}

/// Fetch every artist's tag list in one round trip. Returns a map keyed by
/// `artist_id` so list queries can enrich their rows without an N+1.
/// Artists with no tags simply don't appear in the map — callers should
/// treat a missing entry as an empty list.
pub async fn fetch_all_artist_tags(
    pool: &SqlitePool,
) -> Result<HashMap<i64, Vec<String>>, sqlx::Error> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT artist_id, tag FROM artist_tags ORDER BY artist_id, tag",
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<i64, Vec<String>> = HashMap::new();
    for (id, tag) in rows {
        map.entry(id).or_default().push(tag);
    }
    Ok(map)
}

/// The curated tags for a single artist, alphabetical.
pub async fn get_artist_tags(
    pool: &SqlitePool,
    artist_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT tag FROM artist_tags WHERE artist_id = ?1 ORDER BY tag")
            .bind(artist_id)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|(t,)| t).collect())
}

/// Add a tag to an artist. No-op on blank input or an already-present tag
/// (the composite primary key makes the insert idempotent).
pub async fn add_artist_tag(
    pool: &SqlitePool,
    artist_id: i64,
    tag: &str,
) -> Result<(), sqlx::Error> {
    let tag = normalize_tag(tag);
    if tag.is_empty() {
        return Ok(());
    }
    sqlx::query("INSERT OR IGNORE INTO artist_tags (artist_id, tag) VALUES (?1, ?2)")
        .bind(artist_id)
        .bind(&tag)
        .execute(pool)
        .await?;
    Ok(())
}

/// Remove a tag from an artist. No-op if the artist didn't have it.
pub async fn remove_artist_tag(
    pool: &SqlitePool,
    artist_id: i64,
    tag: &str,
) -> Result<(), sqlx::Error> {
    let tag = normalize_tag(tag);
    sqlx::query("DELETE FROM artist_tags WHERE artist_id = ?1 AND tag = ?2")
        .bind(artist_id)
        .bind(&tag)
        .execute(pool)
        .await?;
    Ok(())
}

// ── Common tags (suggestion pool) ───────────────────────────────────────────
// Common genres seeded at install (migration 019) that the "Add a tag" field
// offers before any have been applied. Separate from `artist_tags` (what's
// actually on an artist) — this is just the suggestion pool, and it's mutable
// so the user can prune genres they'll never use.

/// Every tag in the common-tags pool, alphabetical.
pub async fn get_common_tags(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT tag FROM common_tags ORDER BY tag")
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|(t,)| t).collect())
}

/// Add a tag to the common-tags pool (normalized, idempotent).
pub async fn add_common_tag(pool: &SqlitePool, tag: &str) -> Result<(), sqlx::Error> {
    let tag = normalize_tag(tag);
    if tag.is_empty() {
        return Ok(());
    }
    sqlx::query("INSERT OR IGNORE INTO common_tags (tag) VALUES (?1)")
        .bind(&tag)
        .execute(pool)
        .await?;
    Ok(())
}

/// Remove a tag from the common-tags pool. Does not touch tags already applied
/// to artists — only stops suggesting it.
pub async fn remove_common_tag(pool: &SqlitePool, tag: &str) -> Result<(), sqlx::Error> {
    let tag = normalize_tag(tag);
    sqlx::query("DELETE FROM common_tags WHERE tag = ?1")
        .bind(&tag)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tag_trims_and_lowercases() {
        // The canonical form is what makes "shared tag" discovery exact:
        // every spelling of a tag must collapse to the same stored value.
        assert_eq!(normalize_tag("  Jam Band "), "jam band");
        assert_eq!(normalize_tag("PSYCHEDELIC"), "psychedelic");
        assert_eq!(normalize_tag("indie"), "indie");
        assert_eq!(normalize_tag("   "), "");
    }
}
