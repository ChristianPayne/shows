use sqlx::SqlitePool;
use tauri::{Emitter, State};
use std::sync::Mutex;
use std::time::Instant;

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SetlistSong {
    pub name: String,
    pub info: Option<String>,
    pub tape: bool,
}

#[derive(Clone, serde::Serialize, specta::Type)]
pub struct SetlistResult {
    pub event_date: String,
    pub venue_name: String,
    pub city: String,
    pub songs: Vec<SetlistSong>,
    pub url: String,
}

// Rate limiter: ensure at least 500ms between requests (2/sec max)
static LAST_REQUEST: Mutex<Option<Instant>> = Mutex::new(None);

fn rate_limit() {
    let mut last = LAST_REQUEST.lock().unwrap();
    if let Some(prev) = *last {
        let elapsed = prev.elapsed();
        if elapsed < std::time::Duration::from_millis(500) {
            std::thread::sleep(std::time::Duration::from_millis(500) - elapsed);
        }
    }
    *last = Some(Instant::now());
}

async fn get_api_key(pool: &SqlitePool) -> Option<String> {
    let key: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'setlistfm_api_key'")
        .fetch_optional(pool)
        .await
        .ok()?;
    key.filter(|k| !k.is_empty())
}

#[specta::specta]
#[tauri::command]
pub async fn has_setlistfm_key(pool: State<'_, SqlitePool>) -> Result<bool, String> {
    Ok(get_api_key(pool.inner()).await.is_some())
}

/// Check cache only — no API call. Returns None if not cached.
#[specta::specta]
#[tauri::command]
pub async fn get_cached_setlist(
    pool: State<'_, SqlitePool>,
    artist_mbid: String,
    date: String,
) -> Result<Option<SetlistResult>, String> {
    if artist_mbid.is_empty() || artist_mbid == "skip" {
        return Ok(None);
    }

    let cached: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT songs_json, venue_name, city, url FROM setlist_cache WHERE artist_mbid = ?1 AND event_date = ?2"
    )
    .bind(&artist_mbid)
    .bind(&date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    match cached {
        Some((songs_json, venue_name, city, url)) => {
            let songs: Vec<SetlistSong> = serde_json::from_str(&songs_json).unwrap_or_default();
            Ok(Some(SetlistResult {
                event_date: date,
                venue_name,
                city,
                songs,
                url,
            }))
        }
        None => Ok(None),
    }
}

/// Fetch setlist from API (with cache check first).
#[specta::specta]
#[tauri::command]
pub async fn get_setlist(
    pool: State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
    artist_mbid: String,
    date: String,
) -> Result<Option<SetlistResult>, String> {
    let api_key = get_api_key(pool.inner()).await
        .ok_or("setlist.fm API key not configured")?;

    if artist_mbid.is_empty() || artist_mbid == "skip" {
        return Ok(None);
    }

    // Check cache first
    let cached: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT songs_json, venue_name, city, url FROM setlist_cache WHERE artist_mbid = ?1 AND event_date = ?2"
    )
    .bind(&artist_mbid)
    .bind(&date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if let Some((songs_json, venue_name, city, url)) = cached {
        let songs: Vec<SetlistSong> = serde_json::from_str(&songs_json).unwrap_or_default();
        return Ok(Some(SetlistResult {
            event_date: date,
            venue_name,
            city,
            songs,
            url,
        }));
    }

    // Emit searching status
    let _ = app_handle.emit("setlist-status", serde_json::json!({
        "status": "searching",
        "artist_mbid": &artist_mbid,
    }));

    // Rate limit before making the request
    rate_limit();

    let setlist_date = convert_date(&date)?;

    let client = reqwest::Client::builder()
        .user_agent("ShowsApp/0.1.0 (personal music tracker)")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://api.setlist.fm/rest/1.0/search/setlists?artistMbid={}&date={}&p=1",
        artist_mbid, setlist_date
    );

    let resp = client
        .get(&url)
        .header("x-api-key", &api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        cache_setlist(pool.inner(), &artist_mbid, &date, &[], "", "", "").await;
        let _ = app_handle.emit("setlist-status", serde_json::json!({
            "status": "not_found",
        }));
        return Ok(None);
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let setlist = match body["setlist"].as_array().and_then(|arr| arr.first()) {
        Some(s) => s,
        None => {
            cache_setlist(pool.inner(), &artist_mbid, &date, &[], "", "", "").await;
            let _ = app_handle.emit("setlist-status", serde_json::json!({
                "status": "not_found",
            }));
            return Ok(None);
        }
    };

    let mut songs: Vec<SetlistSong> = Vec::new();
    if let Some(sets) = setlist["sets"]["set"].as_array() {
        for set in sets {
            if let Some(set_songs) = set["song"].as_array() {
                for song in set_songs {
                    songs.push(SetlistSong {
                        name: song["name"].as_str().unwrap_or("").to_string(),
                        info: song["info"].as_str().map(|s| s.to_string()),
                        tape: song["tape"].as_bool().unwrap_or(false),
                    });
                }
            }
        }
    }

    let venue_name = setlist["venue"]["name"].as_str().unwrap_or("").to_string();
    let city = setlist["venue"]["city"]["name"].as_str().unwrap_or("").to_string();
    let setlist_url = setlist["url"].as_str().unwrap_or("").to_string();

    // Cache the result
    cache_setlist(pool.inner(), &artist_mbid, &date, &songs, &venue_name, &city, &setlist_url).await;

    let _ = app_handle.emit("setlist-status", serde_json::json!({
        "status": "found",
        "song_count": songs.len(),
    }));

    Ok(Some(SetlistResult {
        event_date: date,
        venue_name,
        city,
        songs,
        url: setlist_url,
    }))
}

async fn cache_setlist(
    pool: &SqlitePool,
    artist_mbid: &str,
    event_date: &str,
    songs: &[SetlistSong],
    venue_name: &str,
    city: &str,
    url: &str,
) {
    let songs_json = serde_json::to_string(songs).unwrap_or_else(|_| "[]".to_string());
    sqlx::query(
        "INSERT OR REPLACE INTO setlist_cache (artist_mbid, event_date, songs_json, venue_name, city, url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    )
    .bind(artist_mbid)
    .bind(event_date)
    .bind(&songs_json)
    .bind(venue_name)
    .bind(city)
    .bind(url)
    .execute(pool)
    .await
    .ok();
}

fn convert_date(date: &str) -> Result<String, String> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err(format!("Invalid date format: {}", date));
    }
    Ok(format!("{}-{}-{}", parts[2], parts[1], parts[0]))
}
