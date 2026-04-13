//! Single boundary for "what tags does an artist have".
//!
//! Today the only source is the MusicBrainz CSV stored in `artists.tags`,
//! populated by the background metadata fetch. When user-authored custom
//! tags arrive, they'll merge in *here* — a join on a future
//! `artist_custom_tags` table, concatenated with the MB list and deduped —
//! without any call site (queries, commands, UI) needing to know. Keep
//! callers talking to `Vec<String>`, not CSVs, so the source stays a
//! private detail of this module.

use sqlx::SqlitePool;
use std::collections::HashMap;

/// Split a raw comma-separated tag string into trimmed, non-empty tags.
/// Case is preserved — callers that want case-insensitive grouping lowercase
/// themselves (see `top_genres_from_tags`).
pub fn parse_tags_csv(csv: &str) -> Vec<String> {
    csv.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

/// Fetch every artist's tag list in one round trip. Returns a map keyed by
/// `artist_id` so list queries can enrich their rows without an N+1.
/// Artists with no tags simply don't appear in the map — callers should
/// treat a missing entry as an empty list.
pub async fn fetch_all_artist_tags(
    pool: &SqlitePool,
) -> Result<HashMap<i64, Vec<String>>, sqlx::Error> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, tags FROM artists \
         WHERE tags IS NOT NULL AND tags != ''",
    )
    .fetch_all(pool)
    .await?;

    let mut map = HashMap::with_capacity(rows.len());
    for (id, csv) in rows {
        let tags = parse_tags_csv(&csv);
        if !tags.is_empty() {
            map.insert(id, tags);
        }
    }
    Ok(map)
}
