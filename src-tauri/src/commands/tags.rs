//! User-curated artist tags: read/add/remove, MusicBrainz tag *suggestions*
//! (never auto-applied — the user picks), and tag-overlap artist discovery.

use sqlx::SqlitePool;
use tauri::State;

use crate::db::models::SimilarArtist;
use crate::db::{queries, tags};

/// A candidate tag offered by MusicBrainz, with its community vote count so the
/// UI can surface the most-agreed-upon tags first. Suggestions are never
/// written to the DB on their own — the user clicks the ones they want.
#[derive(Clone, serde::Serialize, specta::Type)]
pub struct TagSuggestion {
    pub name: String,
    pub count: i64,
}

/// The artist's current curated tags.
#[specta::specta]
#[tauri::command]
pub async fn get_artist_tags(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
) -> Result<Vec<String>, String> {
    tags::get_artist_tags(pool.inner(), artist_id)
        .await
        .map_err(|e| e.to_string())
}

/// Save a tag onto an artist. Normalized + idempotent (see `db::tags`).
#[specta::specta]
#[tauri::command]
pub async fn add_artist_tag(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
    tag: String,
) -> Result<(), String> {
    tags::add_artist_tag(pool.inner(), artist_id, &tag)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a tag from an artist.
#[specta::specta]
#[tauri::command]
pub async fn remove_artist_tag(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
    tag: String,
) -> Result<(), String> {
    tags::remove_artist_tag(pool.inner(), artist_id, &tag)
        .await
        .map_err(|e| e.to_string())
}

/// The common-tags suggestion pool (seeded common genres + anything you added).
#[specta::specta]
#[tauri::command]
pub async fn get_common_tags(pool: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    tags::get_common_tags(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

/// Add a tag to the common-tags pool.
#[specta::specta]
#[tauri::command]
pub async fn add_common_tag(
    pool: State<'_, SqlitePool>,
    tag: String,
) -> Result<(), String> {
    tags::add_common_tag(pool.inner(), &tag)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a tag from the common-tags pool (leaves applied tags untouched).
#[specta::specta]
#[tauri::command]
pub async fn remove_common_tag(
    pool: State<'_, SqlitePool>,
    tag: String,
) -> Result<(), String> {
    tags::remove_common_tag(pool.inner(), &tag)
        .await
        .map_err(|e| e.to_string())
}

/// Artists in the collection that share tags with this one, ranked by overlap.
#[specta::specta]
#[tauri::command]
pub async fn get_similar_artists_by_tags(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
) -> Result<Vec<SimilarArtist>, String> {
    queries::get_similar_artists_by_tags(pool.inner(), artist_id)
        .await
        .map_err(|e| e.to_string())
}

/// Pull tag *suggestions* for an artist from MusicBrainz. Prefers an exact
/// lookup by the stored MBID; falls back to a name search. Returns the
/// folksonomy tags sorted by vote count. Writes nothing — the user decides
/// which to save via `add_artist_tag`.
#[specta::specta]
#[tauri::command]
pub async fn suggest_artist_tags(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
) -> Result<Vec<TagSuggestion>, String> {
    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT name, mbid FROM artists WHERE id = ?1")
            .bind(artist_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
    let (name, mbid) = row.ok_or_else(|| "Artist not found".to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("ShowsApp/0.1.0 (personal music tracker)")
        .build()
        .map_err(|e| e.to_string())?;

    // A real MBID (not NULL, the empty "checked, no match" marker, or "skip")
    // gives an exact lookup; otherwise search by name and take the top hit.
    let real_mbid = mbid.filter(|m| !m.is_empty() && m != "skip");
    let artist_json: serde_json::Value = if let Some(mbid) = real_mbid {
        let url = format!(
            "https://musicbrainz.org/ws/2/artist/{}?fmt=json&inc=tags",
            mbid
        );
        client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?
    } else {
        let url = format!(
            "https://musicbrainz.org/ws/2/artist/?query=artist:{}&fmt=json&limit=1",
            urlencoding::encode(&name)
        );
        let body: serde_json::Value = client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        body["artists"]
            .get(0)
            .cloned()
            .unwrap_or(serde_json::Value::Null)
    };

    let mut suggestions: Vec<TagSuggestion> = artist_json["tags"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|tag| {
                    Some(TagSuggestion {
                        name: tag["name"].as_str()?.to_string(),
                        count: tag["count"].as_i64().unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    suggestions.sort_by(|a, b| b.count.cmp(&a.count));
    Ok(suggestions)
}
