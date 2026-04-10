use sqlx::SqlitePool;
use tauri::State;

#[derive(Clone, serde::Serialize, sqlx::FromRow)]
pub struct ArtistLinks {
    pub link_spotify: Option<String>,
    pub link_instagram: Option<String>,
    pub link_youtube: Option<String>,
    pub link_soundcloud: Option<String>,
    pub link_bandcamp: Option<String>,
    pub link_website: Option<String>,
}

/// Get external links for an artist. Returns from DB if cached,
/// otherwise fetches from MusicBrainz using the stored mbid and saves.
#[tauri::command]
pub async fn get_artist_links(
    pool: State<'_, SqlitePool>,
    artist_id: i64,
) -> Result<Option<ArtistLinks>, String> {
    // Check if we already have links cached
    let cached: ArtistLinks = sqlx::query_as(
        "SELECT link_spotify, link_instagram, link_youtube, link_soundcloud, link_bandcamp, link_website FROM artists WHERE id = ?1"
    )
    .bind(artist_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // If any link field is non-null, we've already fetched (even if empty)
    if cached.link_spotify.is_some() {
        return Ok(Some(cached));
    }

    // Get mbid
    let mbid: Option<String> = sqlx::query_scalar(
        "SELECT mbid FROM artists WHERE id = ?1"
    )
    .bind(artist_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mbid = match mbid {
        Some(id) if !id.is_empty() => id,
        _ => return Ok(None),
    };

    // Fetch from MusicBrainz
    let links = fetch_links_from_musicbrainz(&mbid).await.map_err(|e| e.to_string())?;

    // Save to DB
    sqlx::query(
        "UPDATE artists SET link_spotify = ?1, link_instagram = ?2, link_youtube = ?3, link_soundcloud = ?4, link_bandcamp = ?5, link_website = ?6 WHERE id = ?7"
    )
    .bind(links.link_spotify.as_deref().unwrap_or(""))
    .bind(links.link_instagram.as_deref().unwrap_or(""))
    .bind(links.link_youtube.as_deref().unwrap_or(""))
    .bind(links.link_soundcloud.as_deref().unwrap_or(""))
    .bind(links.link_bandcamp.as_deref().unwrap_or(""))
    .bind(links.link_website.as_deref().unwrap_or(""))
    .bind(artist_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(Some(links))
}

async fn fetch_links_from_musicbrainz(mbid: &str) -> Result<ArtistLinks, reqwest::Error> {
    let client = reqwest::Client::builder()
        .user_agent("ShowsApp/0.1.0 (personal music tracker)")
        .build()?;

    let url = format!(
        "https://musicbrainz.org/ws/2/artist/{}?fmt=json&inc=url-rels",
        mbid
    );

    let resp = client.get(&url).send().await?;
    let body: serde_json::Value = resp.json().await?;

    let mut links = ArtistLinks {
        link_spotify: None,
        link_instagram: None,
        link_youtube: None,
        link_soundcloud: None,
        link_bandcamp: None,
        link_website: None,
    };

    if let Some(rels) = body["relations"].as_array() {
        for rel in rels {
            let url = match rel["url"]["resource"].as_str() {
                Some(u) => u.to_string(),
                None => continue,
            };
            let rel_type = rel["type"].as_str().unwrap_or("");

            if url.contains("spotify.com") && links.link_spotify.is_none() {
                links.link_spotify = Some(url);
            } else if url.contains("instagram.com") && links.link_instagram.is_none() {
                links.link_instagram = Some(url);
            } else if (url.contains("youtube.com") || url.contains("youtu.be")) && links.link_youtube.is_none() {
                links.link_youtube = Some(url);
            } else if url.contains("soundcloud.com") && links.link_soundcloud.is_none() {
                links.link_soundcloud = Some(url);
            } else if url.contains("bandcamp.com") && links.link_bandcamp.is_none() {
                links.link_bandcamp = Some(url);
            } else if rel_type == "official homepage" && links.link_website.is_none() {
                links.link_website = Some(url);
            }
        }
    }

    Ok(links)
}
