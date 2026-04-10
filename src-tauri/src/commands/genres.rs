use sqlx::SqlitePool;
use tauri::{Emitter, State};

#[derive(Clone, serde::Serialize)]
pub struct GenreProgress {
    pub current: usize,
    pub total: usize,
    pub artist_name: String,
    pub genre: Option<String>,
    pub done: bool,
}

/// Metadata parsed from a MusicBrainz artist response.
struct ArtistMetadata {
    genre: String,
    tags: String,
    country: Option<String>,
    artist_type: Option<String>,
    begin_year: Option<String>,
    end_year: Option<String>,
    active: bool,
    disambiguation: Option<String>,
    mbid: String,
}

/// Fetch metadata from MusicBrainz for all artists that haven't been looked up yet.
#[tauri::command]
pub async fn fetch_genres(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    fetch_genres_bg(pool.inner(), &app_handle).await
}

/// Background-callable version that takes a raw pool reference.
pub async fn fetch_genres_bg(
    pool: &SqlitePool,
    app_handle: &tauri::AppHandle,
) -> Result<usize, String> {
    let artists: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, name FROM artists WHERE mbid IS NULL ORDER BY name"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total = artists.len();
    if total == 0 {
        let _ = app_handle.emit("genre-progress", GenreProgress {
            current: 0,
            total: 0,
            artist_name: String::new(),
            genre: None,
            done: true,
        });
        return Ok(0);
    }

    let client = reqwest::Client::builder()
        .user_agent("ShowsApp/0.1.0 (personal music tracker)")
        .build()
        .map_err(|e| e.to_string())?;

    let mut fetched = 0;

    for (i, (artist_id, artist_name)) in artists.iter().enumerate() {
        let genre = match fetch_artist_metadata(&client, artist_name).await {
            Ok(Some(meta)) => {
                sqlx::query(
                    "UPDATE artists SET genre = ?1, tags = ?2, country = ?3, artist_type = ?4, begin_year = ?5, end_year = ?6, active = ?7, disambiguation = ?8, mbid = ?9 WHERE id = ?10"
                )
                .bind(&meta.genre)
                .bind(&meta.tags)
                .bind(meta.country.as_deref().unwrap_or(""))
                .bind(meta.artist_type.as_deref().unwrap_or(""))
                .bind(meta.begin_year.as_deref().unwrap_or(""))
                .bind(meta.end_year.as_deref().unwrap_or(""))
                .bind(meta.active)
                .bind(meta.disambiguation.as_deref().unwrap_or(""))
                .bind(&meta.mbid)
                .bind(artist_id)
                .execute(pool)
                .await
                .ok();
                fetched += 1;
                Some(meta.genre.clone())
            }
            Ok(None) => {
                // Mark as checked with empty values so we don't re-fetch
                sqlx::query(
                    "UPDATE artists SET genre = '', tags = '', country = '', disambiguation = '', mbid = '' WHERE id = ?1"
                )
                .bind(artist_id)
                .execute(pool)
                .await
                .ok();
                None
            }
            Err(_) => None,
        };

        let _ = app_handle.emit("genre-progress", GenreProgress {
            current: i + 1,
            total,
            artist_name: artist_name.clone(),
            genre,
            done: i + 1 == total,
        });

        // MusicBrainz rate limit: 1 request per second
        if i + 1 < total {
            tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
        }
    }

    Ok(fetched)
}

#[derive(Clone, serde::Serialize)]
pub struct MusicBrainzMatch {
    pub mbid: String,
    pub name: String,
    pub score: i64,
    pub disambiguation: String,
    pub artist_type: String,
    pub country: String,
    pub begin_year: String,
}

/// Search MusicBrainz for multiple artist matches.
#[tauri::command]
pub async fn search_musicbrainz(artist_name: String, limit: Option<i64>) -> Result<Vec<MusicBrainzMatch>, String> {
    let client = reqwest::Client::builder()
        .user_agent("ShowsApp/0.1.0 (personal music tracker)")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://musicbrainz.org/ws/2/artist/?query=artist:{}&fmt=json&limit={}",
        urlencoding::encode(&artist_name),
        limit.unwrap_or(5)
    );

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let artists = body["artists"].as_array().cloned().unwrap_or_default();

    let matches: Vec<MusicBrainzMatch> = artists.iter().map(|a| {
        MusicBrainzMatch {
            mbid: a["id"].as_str().unwrap_or("").to_string(),
            name: a["name"].as_str().unwrap_or("").to_string(),
            score: a["score"].as_i64().unwrap_or(0),
            disambiguation: a["disambiguation"].as_str().unwrap_or("").to_string(),
            artist_type: a["type"].as_str().unwrap_or("").to_string(),
            country: a["country"]
                .as_str()
                .or_else(|| a["area"]["name"].as_str())
                .unwrap_or("")
                .to_string(),
            begin_year: a["life-span"]["begin"].as_str().unwrap_or("").to_string(),
        }
    }).collect();

    Ok(matches)
}

/// Fetch full metadata for a specific MusicBrainz artist by ID and save to our DB.
#[tauri::command]
pub async fn apply_musicbrainz_match(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
    mbid: String,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("ShowsApp/0.1.0 (personal music tracker)")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://musicbrainz.org/ws/2/artist/{}?fmt=json&inc=tags",
        mbid
    );

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let artist: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let tags: Vec<(String, i64)> = artist["tags"]
        .as_array()
        .map(|arr| {
            let mut t: Vec<(String, i64)> = arr
                .iter()
                .filter_map(|tag| {
                    let name = tag["name"].as_str()?.to_string();
                    let count = tag["count"].as_i64().unwrap_or(0);
                    Some((name, count))
                })
                .collect();
            t.sort_by(|a, b| b.1.cmp(&a.1));
            t
        })
        .unwrap_or_default();

    let genre = tags.first().map(|(n, _)| n.as_str()).unwrap_or("");
    let all_tags: Vec<&str> = tags.iter().map(|(n, _)| n.as_str()).collect();
    let country = artist["country"]
        .as_str()
        .or_else(|| artist["area"]["name"].as_str())
        .unwrap_or("");
    let artist_type = artist["type"].as_str().unwrap_or("");
    let begin_year = artist["life-span"]["begin"].as_str().unwrap_or("");
    let end_year = artist["life-span"]["end"].as_str().unwrap_or("");
    let active = artist["life-span"]["ended"].as_bool().map(|b| !b).unwrap_or(true);

    sqlx::query(
        "UPDATE artists SET genre = ?1, tags = ?2, country = ?3, artist_type = ?4, begin_year = ?5, end_year = ?6, active = ?7, disambiguation = ?8, mbid = ?9, link_spotify = NULL, link_instagram = NULL, link_youtube = NULL, link_soundcloud = NULL, link_bandcamp = NULL, link_website = NULL WHERE id = ?10"
    )
    .bind(genre)
    .bind(all_tags.join(", "))
    .bind(country)
    .bind(artist_type)
    .bind(begin_year)
    .bind(end_year)
    .bind(active)
    .bind(artist["disambiguation"].as_str().unwrap_or(""))
    .bind(&mbid)
    .bind(artist_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Clear all metadata and set mbid to "skip" so the fetcher ignores this artist.
#[tauri::command]
pub async fn clear_artist_metadata(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE artists SET genre = '', tags = '', country = '', artist_type = '', begin_year = '', end_year = '', active = NULL, disambiguation = '', mbid = 'skip', link_spotify = NULL, link_instagram = NULL, link_youtube = NULL, link_soundcloud = NULL, link_bandcamp = NULL, link_website = NULL WHERE id = ?1"
    )
    .bind(artist_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn fetch_artist_metadata(
    client: &reqwest::Client,
    artist_name: &str,
) -> Result<Option<ArtistMetadata>, reqwest::Error> {
    let url = format!(
        "https://musicbrainz.org/ws/2/artist/?query=artist:{}&fmt=json&limit=1",
        urlencoding::encode(artist_name)
    );

    let resp = client.get(&url).send().await?;
    let body: serde_json::Value = resp.json().await?;

    let artist = match body["artists"].get(0) {
        Some(a) => a,
        None => return Ok(None),
    };

    // Tags — sorted by popularity
    let tags: Vec<(String, i64)> = artist["tags"]
        .as_array()
        .map(|arr| {
            let mut t: Vec<(String, i64)> = arr
                .iter()
                .filter_map(|tag| {
                    let name = tag["name"].as_str()?.to_string();
                    let count = tag["count"].as_i64().unwrap_or(0);
                    Some((name, count))
                })
                .collect();
            t.sort_by(|a, b| b.1.cmp(&a.1));
            t
        })
        .unwrap_or_default();

    let genre = tags.first().map(|(name, _)| name.clone()).unwrap_or_default();
    let all_tags: Vec<String> = tags.into_iter().map(|(name, _)| name).collect();

    // Try country from top-level, fall back to area name
    let country = artist["country"]
        .as_str()
        .or_else(|| artist["area"]["name"].as_str())
        .map(|s| s.to_string());
    let artist_type = artist["type"].as_str().map(|s| s.to_string());
    let begin_year = artist["life-span"]["begin"].as_str().map(|s| s.to_string());
    let end_year = artist["life-span"]["end"].as_str().map(|s| s.to_string());
    let active = artist["life-span"]["ended"].as_bool().map(|b| !b).unwrap_or(true);
    let disambiguation = artist["disambiguation"].as_str().map(|s| s.to_string());
    let mbid = artist["id"].as_str().unwrap_or("").to_string();

    Ok(Some(ArtistMetadata {
        genre,
        tags: all_tags.join(", "),
        country,
        artist_type,
        begin_year,
        end_year,
        active,
        disambiguation,
        mbid,
    }))
}
