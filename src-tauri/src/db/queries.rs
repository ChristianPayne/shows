use sqlx::SqlitePool;

use super::models::*;

/// Raw row shape returned by the artist metadata query — kept as a type alias
/// because spelling it out inline trips clippy::type_complexity, and the column
/// list is awkward to map to a struct since it's purely a tuple decoded from
/// `query_as`.
type ArtistMetaRow = (
    Option<String>, // genre
    Option<String>, // tags
    Option<String>, // country
    Option<String>, // artist_type
    Option<String>, // begin_year
    Option<String>, // end_year
    Option<bool>,   // active
    Option<String>, // disambiguation
);

// ── Find-or-create operations ──

pub async fn find_or_create_location(
    pool: &SqlitePool,
    city: &str,
    state: &str,
) -> Result<i64, sqlx::Error> {
    // NOCASE so "San Francisco" / "san francisco" map to the same location
    // instead of creating duplicates. The UNIQUE(city, state) constraint stays
    // binary — we dedupe before insert so the constraint never fires on a
    // case-variant, and pre-existing case-variant rows keep working.
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM locations WHERE city = ?1 COLLATE NOCASE AND state = ?2 COLLATE NOCASE")
            .bind(city)
            .bind(state)
            .fetch_optional(pool)
            .await?;

    if let Some((id,)) = row {
        return Ok(id);
    }

    let result = sqlx::query("INSERT INTO locations (city, state) VALUES (?1, ?2)")
        .bind(city)
        .bind(state)
        .execute(pool)
        .await?;

    Ok(result.last_insert_rowid())
}

/// Find or create a venue by (name, location). Same name in different
/// cities is a different venue.
pub async fn find_or_create_venue(
    pool: &SqlitePool,
    name: &str,
    location_id: i64,
) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM venues WHERE name = ?1 COLLATE NOCASE AND location_id = ?2")
            .bind(name)
            .bind(location_id)
            .fetch_optional(pool)
            .await?;

    if let Some((id,)) = row {
        return Ok(id);
    }

    let result = sqlx::query("INSERT INTO venues (name, location_id) VALUES (?1, ?2)")
        .bind(name)
        .bind(location_id)
        .execute(pool)
        .await?;

    Ok(result.last_insert_rowid())
}

/// Look up venues by name across all locations. Used by CSV import to detect
/// when a CSV row mentions a venue that already exists at a different location.
pub async fn find_venues_by_name(
    pool: &SqlitePool,
    name: &str,
) -> Result<Vec<(i64, i64)>, sqlx::Error> {
    sqlx::query_as("SELECT id, location_id FROM venues WHERE name = ?1 COLLATE NOCASE")
        .bind(name)
        .fetch_all(pool)
        .await
}

/// Same as `find_venues_by_name` but includes the city/state of each hit.
/// Used by the CSV preview so conflict messages can tell the user which
/// existing location claims the venue name without an extra round-trip.
pub async fn find_venues_with_location_by_name(
    pool: &SqlitePool,
    name: &str,
) -> Result<Vec<(i64, i64, String, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT v.id, v.location_id, l.city, l.state \
         FROM venues v JOIN locations l ON l.id = v.location_id \
         WHERE v.name = ?1 COLLATE NOCASE",
    )
    .bind(name)
    .fetch_all(pool)
    .await
}

/// Read-only counterpart to `find_or_create_location`. Returns the existing
/// location id or `None` without inserting anything — used by the CSV
/// preview to classify rows without side effects.
pub async fn find_location(
    pool: &SqlitePool,
    city: &str,
    state: &str,
) -> Result<Option<i64>, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM locations WHERE city = ?1 COLLATE NOCASE AND state = ?2 COLLATE NOCASE")
            .bind(city)
            .bind(state)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(id,)| id))
}

/// Does an event with this name/date/venue already exist? Used by preview
/// (before insert) and by the import loop (skip duplicates at write time).
pub async fn event_exists(
    pool: &SqlitePool,
    name: &str,
    date: &str,
    venue_id: i64,
) -> Result<bool, sqlx::Error> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM events WHERE name = ?1 AND date = ?2 AND venue_id = ?3",
    )
    .bind(name)
    .bind(date)
    .bind(venue_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

/// Look up or create an artist by name. Returns the row id plus a
/// `was_inserted` flag so callers can distinguish new artists from existing
/// ones — used by `create_event` / `update_event` to scope the background
/// MusicBrainz metadata fetch to only the artists actually introduced by
/// this mutation, instead of re-scanning every un-matched artist in the DB
/// on every event edit.
pub async fn find_or_create_artist(
    pool: &SqlitePool,
    name: &str,
) -> Result<(i64, bool), sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM artists WHERE name = ?1 COLLATE NOCASE")
            .bind(name)
            .fetch_optional(pool)
            .await?;

    if let Some((id,)) = row {
        return Ok((id, false));
    }

    let result = sqlx::query("INSERT INTO artists (name) VALUES (?1)")
        .bind(name)
        .execute(pool)
        .await?;

    Ok((result.last_insert_rowid(), true))
}

/// Friend counterpart to `find_or_create_artist`. Returns just the id — unlike
/// artists, friends have no metadata to fetch, so there's no "was inserted"
/// flag to act on. Case-insensitive match keeps "Mike" and "mike" the same row.
pub async fn find_or_create_friend(pool: &SqlitePool, name: &str) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM friends WHERE name = ?1 COLLATE NOCASE")
            .bind(name)
            .fetch_optional(pool)
            .await?;

    if let Some((id,)) = row {
        return Ok(id);
    }

    let result = sqlx::query("INSERT INTO friends (name) VALUES (?1)")
        .bind(name)
        .execute(pool)
        .await?;

    Ok(result.last_insert_rowid())
}

/// Fetch the friends linked to one event, ordered by name. Used to populate
/// `EventDetail::friends` at every event-fetch site.
pub async fn fetch_event_friends(pool: &SqlitePool, event_id: i64) -> Result<Vec<Friend>, sqlx::Error> {
    let mut friends: Vec<Friend> = sqlx::query_as(
        "SELECT f.id, f.name FROM friends f
         JOIN event_friends ef ON f.id = ef.friend_id
         WHERE ef.event_id = ?1
         ORDER BY f.name COLLATE NOCASE",
    )
    .bind(event_id)
    .fetch_all(pool)
    .await?;
    mask_friend_names_if_streamer(pool, &mut friends).await;
    Ok(friends)
}

/// Strip friend names to first-name-only when Streamer Mode is on. This is the
/// single enforcement point for friend masking: it lives at the read path
/// (every SELECT of a friend name funnels through here, `get_friends_with_counts`,
/// or the top_friends stats query), so a command physically cannot surface a
/// full name by forgetting to mask — the data leaves the DB already stripped.
/// Generic over the row type so the three call sites share one implementation.
async fn mask_friend_names_if_streamer<T: HasFriendName>(pool: &SqlitePool, rows: &mut [T]) {
    if crate::util::streamer_mode_enabled(pool).await {
        for row in rows.iter_mut() {
            row.set_name(crate::util::mask_first_name(row.name()));
        }
    }
}

/// Lets [`mask_friend_names_if_streamer`] mask any row that carries a friend's
/// name, regardless of the surrounding struct.
trait HasFriendName {
    fn name(&self) -> &str;
    fn set_name(&mut self, name: String);
}

impl HasFriendName for Friend {
    fn name(&self) -> &str { &self.name }
    fn set_name(&mut self, name: String) { self.name = name; }
}

impl HasFriendName for FriendWithCount {
    fn name(&self) -> &str { &self.name }
    fn set_name(&mut self, name: String) { self.name = name; }
}

impl HasFriendName for EntityCount {
    fn name(&self) -> &str { &self.name }
    fn set_name(&mut self, name: String) { self.name = name; }
}

// ── Event CRUD ──

/// Borrowed bundle of the fields written to an event, shared by `create_event`
/// and `update_event`. Lives here (not in models) because it's purely a
/// query-layer input shape, never serialized. Each artist entry includes an
/// optional set_group for b2b grouping; location is derived from the venue, so
/// it's not a field.
pub struct EventWrite<'a> {
    pub name: &'a str,
    pub date: &'a str,
    pub end_date: Option<&'a str>,
    pub notes: Option<&'a str>,
    pub venue_id: i64,
    pub artists: &'a [(i64, Option<i64>)],
    pub friends: &'a [i64],
}

pub async fn create_event(pool: &SqlitePool, input: EventWrite<'_>) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO events (name, date, end_date, notes, venue_id) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(input.name)
    .bind(input.date)
    .bind(input.end_date)
    .bind(input.notes)
    .bind(input.venue_id)
    .execute(pool)
    .await?;

    let event_id = result.last_insert_rowid();

    for (artist_id, set_group) in input.artists {
        sqlx::query("INSERT INTO event_artists (event_id, artist_id, set_group) VALUES (?1, ?2, ?3)")
            .bind(event_id)
            .bind(artist_id)
            .bind(set_group)
            .execute(pool)
            .await?;
    }

    for friend_id in input.friends {
        sqlx::query("INSERT INTO event_friends (event_id, friend_id) VALUES (?1, ?2)")
            .bind(event_id)
            .bind(friend_id)
            .execute(pool)
            .await?;
    }

    Ok(event_id)
}

pub async fn update_event(
    pool: &SqlitePool,
    event_id: i64,
    input: EventWrite<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE events SET name = ?1, date = ?2, end_date = ?3, notes = ?4, venue_id = ?5, updated_at = datetime('now') WHERE id = ?6",
    )
    .bind(input.name)
    .bind(input.date)
    .bind(input.end_date)
    .bind(input.notes)
    .bind(input.venue_id)
    .bind(event_id)
    .execute(pool)
    .await?;

    // Replace artist links: delete existing, insert new
    sqlx::query("DELETE FROM event_artists WHERE event_id = ?1")
        .bind(event_id)
        .execute(pool)
        .await?;

    for (artist_id, set_group) in input.artists {
        sqlx::query("INSERT INTO event_artists (event_id, artist_id, set_group) VALUES (?1, ?2, ?3)")
            .bind(event_id)
            .bind(artist_id)
            .bind(set_group)
            .execute(pool)
            .await?;
    }

    // Replace friend links the same way: delete existing, insert new.
    sqlx::query("DELETE FROM event_friends WHERE event_id = ?1")
        .bind(event_id)
        .execute(pool)
        .await?;

    for friend_id in input.friends {
        sqlx::query("INSERT INTO event_friends (event_id, friend_id) VALUES (?1, ?2)")
            .bind(event_id)
            .bind(friend_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn delete_event(pool: &SqlitePool, event_id: i64) -> Result<(), sqlx::Error> {
    // event_artists cascade on delete, but be explicit
    sqlx::query("DELETE FROM event_artists WHERE event_id = ?1")
        .bind(event_id)
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM events WHERE id = ?1")
        .bind(event_id)
        .execute(pool)
        .await?;

    Ok(())
}

// ── Rename entities ──

/// Rename an artist *and* wipe all MusicBrainz-derived fields in the same
/// statement. Used by `rename_artist` so a typo fix ("Nein Inch Nails" →
/// "Nine Inch Nails") invalidates the metadata tied to the old name, with
/// `mbid` reset to NULL so the background refetch picks the row up. All
/// clearable columns are listed explicitly — keep this list in sync with
/// `clear_artist_metadata` and any future artist metadata migrations.
pub async fn rename_artist_and_clear_metadata(
    pool: &SqlitePool,
    artist_id: i64,
    name: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE artists SET \
            name = ?1, \
            mbid = NULL, \
            genre = NULL, \
            tags = NULL, \
            country = NULL, \
            artist_type = NULL, \
            begin_year = NULL, \
            end_year = NULL, \
            active = NULL, \
            disambiguation = NULL, \
            link_spotify = NULL, \
            link_instagram = NULL, \
            link_youtube = NULL, \
            link_soundcloud = NULL, \
            link_bandcamp = NULL, \
            link_website = NULL \
         WHERE id = ?2",
    )
    .bind(name)
    .bind(artist_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn rename_venue(pool: &SqlitePool, venue_id: i64, name: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE venues SET name = ?1 WHERE id = ?2")
        .bind(name)
        .bind(venue_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn rename_location(pool: &SqlitePool, location_id: i64, city: &str, state: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE locations SET city = ?1, state = ?2 WHERE id = ?3")
        .bind(city)
        .bind(state)
        .bind(location_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn rename_friend(pool: &SqlitePool, friend_id: i64, name: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE friends SET name = ?1 WHERE id = ?2")
        .bind(name)
        .bind(friend_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ── Merge entities ──

/// Merge one artist into another. Reassigns all event links, then deletes the duplicate.
pub async fn merge_artists(pool: &SqlitePool, keep_id: i64, merge_id: i64) -> Result<(), sqlx::Error> {
    // Reassign event_artists rows, skipping any that would create duplicates
    sqlx::query(
        "UPDATE OR IGNORE event_artists SET artist_id = ?1 WHERE artist_id = ?2"
    )
    .bind(keep_id)
    .bind(merge_id)
    .execute(pool)
    .await?;

    // Delete any remaining rows for the merged artist (duplicates that were ignored)
    sqlx::query("DELETE FROM event_artists WHERE artist_id = ?1")
        .bind(merge_id)
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM artists WHERE id = ?1")
        .bind(merge_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Merge one venue into another. Reassigns all events, then deletes the duplicate.
pub async fn merge_venues(pool: &SqlitePool, keep_id: i64, merge_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE events SET venue_id = ?1 WHERE venue_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM venues WHERE id = ?1")
        .bind(merge_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Merge one location into another. Reassigns all venues, then deletes the duplicate.
/// Note: this can create venue duplicates if both locations had a venue with the same
/// name. Those collisions are handled by INSERT OR IGNORE — the merged-from venue is
/// simply dropped if its name already exists at the keep location, and its events
/// fall through to the existing venue via the venue merge below.
pub async fn merge_locations(pool: &SqlitePool, keep_id: i64, merge_id: i64) -> Result<(), sqlx::Error> {
    // Find venue collisions: venues at merge_id whose name already exists at keep_id.
    let collisions: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT old.id, new.id
         FROM venues old
         JOIN venues new ON old.name = new.name
         WHERE old.location_id = ?1 AND new.location_id = ?2",
    )
    .bind(merge_id)
    .bind(keep_id)
    .fetch_all(pool)
    .await?;

    // Reassign each colliding venue's events to the surviving venue, then drop the dup.
    for (old_id, new_id) in collisions {
        sqlx::query("UPDATE events SET venue_id = ?1 WHERE venue_id = ?2")
            .bind(new_id)
            .bind(old_id)
            .execute(pool)
            .await?;
        sqlx::query("DELETE FROM venues WHERE id = ?1")
            .bind(old_id)
            .execute(pool)
            .await?;
    }

    // Move any remaining venues at the merge location to the keep location.
    sqlx::query("UPDATE venues SET location_id = ?1 WHERE location_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM locations WHERE id = ?1")
        .bind(merge_id)
        .execute(pool)
        .await?;

    Ok(())
}

// ── Delete orphaned entities ──

/// Delete a venue only if it has no linked events.
pub async fn delete_venue(pool: &SqlitePool, venue_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM venues WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM events WHERE venue_id = ?1)")
        .bind(venue_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete an artist only if it has no linked events.
pub async fn delete_artist(pool: &SqlitePool, artist_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM artists WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM event_artists WHERE artist_id = ?1)")
        .bind(artist_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete a friend only if they have no linked events.
pub async fn delete_friend(pool: &SqlitePool, friend_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM friends WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM event_friends WHERE friend_id = ?1)")
        .bind(friend_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete a location only if no venues live there. (Venues, in turn, are only
/// deletable when they have no events — so this transitively guarantees no
/// events depend on the location either.)
pub async fn delete_location(pool: &SqlitePool, location_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM locations WHERE id = ?1
         AND NOT EXISTS (SELECT 1 FROM venues WHERE location_id = ?1)",
    )
    .bind(location_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ── Artist detail stats ──

pub async fn get_artist_stats(pool: &SqlitePool, artist_id: i64) -> Result<ArtistStats, sqlx::Error> {
    // Artist metadata from MusicBrainz
    let meta: Option<ArtistMetaRow> = sqlx::query_as(
        "SELECT genre, tags, country, artist_type, begin_year, end_year, active, disambiguation FROM artists WHERE id = ?1"
    )
    .bind(artist_id)
    .fetch_optional(pool)
    .await?;

    let (genre, _old_tags, country, artist_type, begin_year, end_year, active, disambiguation) = meta.unwrap_or_default();
    let genre = genre.filter(|g| !g.is_empty());
    // Tags come from the curated artist_tags table now, not the old CSV column.
    let tag_list = super::tags::get_artist_tags(pool, artist_id).await?;
    let tags = if tag_list.is_empty() {
        None
    } else {
        Some(tag_list.join(", "))
    };
    let country = country.filter(|c| !c.is_empty());
    let disambiguation = disambiguation.filter(|d| !d.is_empty());

    // First/last seen dates
    let dates: Option<(String, String)> = sqlx::query_as(
        "SELECT MIN(e.date), MAX(e.date) FROM events e
         JOIN event_artists ea ON e.id = ea.event_id
         WHERE ea.artist_id = ?1 AND e.date <= date('now')"
    )
    .bind(artist_id)
    .fetch_optional(pool)
    .await?;

    let (first_seen, last_seen) = match dates {
        Some((f, l)) => (Some(f), Some(l)),
        None => (None, None),
    };

    // Unique venues
    let (unique_venues,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT e.venue_id) FROM events e
         JOIN event_artists ea ON e.id = ea.event_id
         WHERE ea.artist_id = ?1"
    )
    .bind(artist_id)
    .fetch_one(pool)
    .await?;

    // Unique locations — reached through the artist's venues
    let (unique_locations,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT v.location_id) FROM events e
         JOIN event_artists ea ON e.id = ea.event_id
         JOIN venues v ON e.venue_id = v.id
         WHERE ea.artist_id = ?1"
    )
    .bind(artist_id)
    .fetch_one(pool)
    .await?;

    // Related artists — other artists who appear at the same events, ranked by co-occurrence
    let related_artists: Vec<RelatedArtist> = sqlx::query_as(
        "SELECT a.id, a.name, COUNT(*) as shared_events
         FROM artists a
         JOIN event_artists ea ON a.id = ea.artist_id
         WHERE ea.event_id IN (
             SELECT event_id FROM event_artists WHERE artist_id = ?1
         )
         AND a.id != ?1
         GROUP BY a.id
         ORDER BY shared_events DESC
         LIMIT 10"
    )
    .bind(artist_id)
    .fetch_all(pool)
    .await?;

    Ok(ArtistStats {
        genre,
        tags,
        country,
        artist_type,
        begin_year,
        end_year,
        active,
        disambiguation,
        first_seen,
        last_seen,
        unique_venues,
        unique_locations,
        related_artists,
    })
}

// ── Enriched artist context for event detail ──

/// For each artist on a given event, return their total event count
/// and whether this event is the first time they were seen.
pub async fn get_artist_context_for_event(
    pool: &SqlitePool,
    event_id: i64,
    event_date: &str,
) -> Result<Vec<ArtistContextSet>, sqlx::Error> {
    let artists: Vec<ArtistInfo> = sqlx::query_as(
        "SELECT a.id, a.name, ea.set_group FROM artists a
         JOIN event_artists ea ON a.id = ea.artist_id
         WHERE ea.event_id = ?1
         ORDER BY ea.set_group NULLS LAST, a.name",
    )
    .bind(event_id)
    .fetch_all(pool)
    .await?;

    let mut contexts: Vec<ArtistContext> = Vec::new();

    for artist in &artists {
        // Total number of events this artist appears in
        let (total,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM event_artists WHERE artist_id = ?1"
        )
        .bind(artist.id)
        .fetch_one(pool)
        .await?;

        // Earliest event date for this artist
        let (earliest,): (String,) = sqlx::query_as(
            "SELECT MIN(e.date) FROM events e
             JOIN event_artists ea ON e.id = ea.event_id
             WHERE ea.artist_id = ?1"
        )
        .bind(artist.id)
        .fetch_one(pool)
        .await?;

        let mbid: Option<String> = sqlx::query_scalar(
            "SELECT mbid FROM artists WHERE id = ?1"
        )
        .bind(artist.id)
        .fetch_one(pool)
        .await?;
        let mbid = mbid.filter(|m| !m.is_empty() && m != "skip");

        contexts.push(ArtistContext {
            id: artist.id,
            name: artist.name.clone(),
            set_group: artist.set_group,
            total_events: total,
            first_event: earliest == event_date,
            mbid,
        });
    }

    // Group into sets, same logic as EventDetail::group_artists
    let mut sets: Vec<ArtistContextSet> = Vec::new();
    let mut group_map: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();

    for ctx in contexts {
        if let Some(group) = ctx.set_group {
            if let Some(&idx) = group_map.get(&group) {
                sets[idx].artists.push(ctx);
            } else {
                let idx = sets.len();
                group_map.insert(group, idx);
                sets.push(ArtistContextSet { artists: vec![ctx] });
            }
        } else {
            sets.push(ArtistContextSet { artists: vec![ctx] });
        }
    }

    Ok(sets)
}

// ── Query operations ──

pub async fn get_all_events(pool: &SqlitePool) -> Result<Vec<EventDetail>, sqlx::Error> {
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         ORDER BY e.date DESC",
    )
    .fetch_all(pool)
    .await?;

    let mut events: Vec<EventDetail> = Vec::new();

    for row in rows {
        let artist_names: Vec<ArtistInfo> = sqlx::query_as(
            "SELECT a.id, a.name, ea.set_group FROM artists a
             JOIN event_artists ea ON a.id = ea.artist_id
             WHERE ea.event_id = ?1
             ORDER BY ea.set_group NULLS LAST, a.name",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;

        events.push(EventDetail {
            id: row.id,
            name: row.name,
            date: row.date,
            end_date: row.end_date,
            notes: row.notes,
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artist_sets: EventDetail::group_artists(artist_names),
            friends: fetch_event_friends(pool, row.id).await?,
            venue_id: row.venue_id,
            location_id: row.location_id,
        });
    }

    Ok(events)
}

pub async fn get_event_by_id(
    pool: &SqlitePool,
    event_id: i64,
) -> Result<Option<EventDetail>, sqlx::Error> {
    let row: Option<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         WHERE e.id = ?1",
    )
    .bind(event_id)
    .fetch_optional(pool)
    .await?;

    match row {
        None => Ok(None),
        Some(row) => {
            let artist_names: Vec<ArtistInfo> = sqlx::query_as(
                "SELECT a.id, a.name, ea.set_group FROM artists a
                 JOIN event_artists ea ON a.id = ea.artist_id
                 WHERE ea.event_id = ?1
                 ORDER BY ea.set_group NULLS LAST, a.name",
            )
            .bind(row.id)
            .fetch_all(pool)
            .await?;

            Ok(Some(EventDetail {
                id: row.id,
                name: row.name,
                date: row.date,
                end_date: row.end_date,
                notes: row.notes,
                cancelled: row.cancelled,
                venue: row.venue,
                city: row.city,
                state: row.state,
                artist_sets: EventDetail::group_artists(artist_names),
                friends: fetch_event_friends(pool, row.id).await?,
                venue_id: row.venue_id,
                location_id: row.location_id,
            }))
        }
    }
}

/// Other artists in the collection that share at least one tag with the given
/// artist, ranked by number of shared tags (then by how often you've seen
/// them). Powers the "similar artists by tags" suggestions on the detail page.
pub async fn get_similar_artists_by_tags(
    pool: &SqlitePool,
    artist_id: i64,
) -> Result<Vec<SimilarArtist>, sqlx::Error> {
    sqlx::query_as::<_, SimilarArtist>(
        "SELECT a.id, a.name,
                COUNT(DISTINCT mine.tag) AS shared_tags,
                (SELECT COUNT(*) FROM event_artists ea WHERE ea.artist_id = a.id) AS event_count
         FROM artist_tags mine
         JOIN artist_tags theirs
           ON theirs.tag = mine.tag AND theirs.artist_id != mine.artist_id
         JOIN artists a ON a.id = theirs.artist_id
         WHERE mine.artist_id = ?1
         GROUP BY a.id, a.name
         ORDER BY shared_tags DESC, event_count DESC, a.name
         LIMIT 12",
    )
    .bind(artist_id)
    .fetch_all(pool)
    .await
}

// ── Entity lists with counts ──

pub async fn get_artists_with_counts(
    pool: &SqlitePool,
) -> Result<Vec<ArtistWithCount>, sqlx::Error> {
    // Intermediate shape so sqlx can still derive FromRow — the public
    // `ArtistWithCount` carries `tags: Vec<String>`, which doesn't map cleanly
    // onto a single SQL column.
    #[derive(sqlx::FromRow)]
    struct Row {
        id: i64,
        name: String,
        event_count: i64,
        genre: Option<String>,
        country: Option<String>,
        artist_type: Option<String>,
    }

    let rows: Vec<Row> = sqlx::query_as(
        "SELECT a.id, a.name, COUNT(ea.event_id) as event_count, a.genre, a.country, a.artist_type
         FROM artists a
         LEFT JOIN event_artists ea ON a.id = ea.artist_id
         GROUP BY a.id
         ORDER BY CASE WHEN a.name LIKE 'The %' THEN substr(a.name, 5) ELSE a.name END",
    )
    .fetch_all(pool)
    .await?;

    let mut tag_map = super::tags::fetch_all_artist_tags(pool).await?;

    Ok(rows
        .into_iter()
        .map(|r| ArtistWithCount {
            tags: tag_map.remove(&r.id).unwrap_or_default(),
            id: r.id,
            name: r.name,
            event_count: r.event_count,
            genre: r.genre,
            country: r.country,
            artist_type: r.artist_type,
        })
        .collect())
}

pub async fn get_venues_with_counts(
    pool: &SqlitePool,
) -> Result<Vec<VenueWithCount>, sqlx::Error> {
    let rows: Vec<VenueWithCount> = sqlx::query_as(
        "SELECT v.id, v.name, COUNT(e.id) as event_count, v.location_id, l.city, l.state
         FROM venues v
         JOIN locations l ON v.location_id = l.id
         LEFT JOIN events e ON v.id = e.venue_id
         GROUP BY v.id
         ORDER BY CASE WHEN v.name LIKE 'The %' THEN substr(v.name, 5) ELSE v.name END",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_locations_with_counts(
    pool: &SqlitePool,
) -> Result<Vec<LocationWithCount>, sqlx::Error> {
    let rows: Vec<LocationWithCount> = sqlx::query_as(
        "SELECT l.id, l.city, l.state, COUNT(e.id) as event_count
         FROM locations l
         LEFT JOIN venues v ON l.id = v.location_id
         LEFT JOIN events e ON v.id = e.venue_id
         GROUP BY l.id
         ORDER BY l.state, l.city",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_events_for_artist(
    pool: &SqlitePool,
    artist_id: i64,
) -> Result<Vec<EventDetail>, sqlx::Error> {
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         JOIN event_artists ea ON e.id = ea.event_id
         WHERE ea.artist_id = ?1
         ORDER BY e.date DESC",
    )
    .bind(artist_id)
    .fetch_all(pool)
    .await?;

    let mut events = Vec::new();
    for row in rows {
        let artist_names: Vec<ArtistInfo> = sqlx::query_as(
            "SELECT a.id, a.name, ea.set_group FROM artists a
             JOIN event_artists ea ON a.id = ea.artist_id
             WHERE ea.event_id = ?1
             ORDER BY ea.set_group NULLS LAST, a.name",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;

        events.push(EventDetail {
            id: row.id,
            name: row.name,
            date: row.date,
            end_date: row.end_date,
            notes: row.notes,
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artist_sets: EventDetail::group_artists(artist_names),
            friends: fetch_event_friends(pool, row.id).await?,
            venue_id: row.venue_id,
            location_id: row.location_id,
        });
    }

    Ok(events)
}

pub async fn get_events_for_venue(
    pool: &SqlitePool,
    venue_id: i64,
) -> Result<Vec<EventDetail>, sqlx::Error> {
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         WHERE e.venue_id = ?1
         ORDER BY e.date DESC",
    )
    .bind(venue_id)
    .fetch_all(pool)
    .await?;

    let mut events = Vec::new();
    for row in rows {
        let artist_names: Vec<ArtistInfo> = sqlx::query_as(
            "SELECT a.id, a.name, ea.set_group FROM artists a
             JOIN event_artists ea ON a.id = ea.artist_id
             WHERE ea.event_id = ?1
             ORDER BY ea.set_group NULLS LAST, a.name",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;

        events.push(EventDetail {
            id: row.id,
            name: row.name,
            date: row.date,
            end_date: row.end_date,
            notes: row.notes,
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artist_sets: EventDetail::group_artists(artist_names),
            friends: fetch_event_friends(pool, row.id).await?,
            venue_id: row.venue_id,
            location_id: row.location_id,
        });
    }

    Ok(events)
}

pub async fn get_events_for_location(
    pool: &SqlitePool,
    location_id: i64,
) -> Result<Vec<EventDetail>, sqlx::Error> {
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         WHERE v.location_id = ?1
         ORDER BY e.date DESC",
    )
    .bind(location_id)
    .fetch_all(pool)
    .await?;

    let mut events = Vec::new();
    for row in rows {
        let artist_names: Vec<ArtistInfo> = sqlx::query_as(
            "SELECT a.id, a.name, ea.set_group FROM artists a
             JOIN event_artists ea ON a.id = ea.artist_id
             WHERE ea.event_id = ?1
             ORDER BY ea.set_group NULLS LAST, a.name",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;

        events.push(EventDetail {
            id: row.id,
            name: row.name,
            date: row.date,
            end_date: row.end_date,
            notes: row.notes,
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artist_sets: EventDetail::group_artists(artist_names),
            friends: fetch_event_friends(pool, row.id).await?,
            venue_id: row.venue_id,
            location_id: row.location_id,
        });
    }

    Ok(events)
}

pub async fn get_events_for_friend(
    pool: &SqlitePool,
    friend_id: i64,
) -> Result<Vec<EventDetail>, sqlx::Error> {
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         JOIN event_friends ef ON e.id = ef.event_id
         WHERE ef.friend_id = ?1
         ORDER BY e.date DESC",
    )
    .bind(friend_id)
    .fetch_all(pool)
    .await?;

    let mut events = Vec::new();
    for row in rows {
        let artist_names: Vec<ArtistInfo> = sqlx::query_as(
            "SELECT a.id, a.name, ea.set_group FROM artists a
             JOIN event_artists ea ON a.id = ea.artist_id
             WHERE ea.event_id = ?1
             ORDER BY ea.set_group NULLS LAST, a.name",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;

        events.push(EventDetail {
            id: row.id,
            name: row.name,
            date: row.date,
            end_date: row.end_date,
            notes: row.notes,
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artist_sets: EventDetail::group_artists(artist_names),
            friends: fetch_event_friends(pool, row.id).await?,
            venue_id: row.venue_id,
            location_id: row.location_id,
        });
    }

    Ok(events)
}

pub async fn get_friends_with_counts(
    pool: &SqlitePool,
) -> Result<Vec<FriendWithCount>, sqlx::Error> {
    let mut rows: Vec<FriendWithCount> = sqlx::query_as(
        "SELECT f.id, f.name, COUNT(ef.event_id) as event_count
         FROM friends f
         LEFT JOIN event_friends ef ON f.id = ef.friend_id
         GROUP BY f.id
         ORDER BY f.name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;

    mask_friend_names_if_streamer(pool, &mut rows).await;
    Ok(rows)
}

// ── Upcoming events (dashboard) ──

pub async fn get_upcoming_events(pool: &SqlitePool) -> Result<Vec<UpcomingEvent>, sqlx::Error> {
    // Filter + sort in SQL so the dashboard useMemo goes away entirely. The
    // days_until column is computed server-side via SQLite's julianday so
    // the result shape is ready to render without any client-side math.
    // `date('now', 'localtime')` matches what the TS used to do with
    // `new Date().setHours(0,0,0,0)` — local midnight, not UTC.
    #[derive(sqlx::FromRow)]
    struct UpcomingRow {
        id: i64,
        name: String,
        date: String,
        end_date: Option<String>,
        notes: Option<String>,
        cancelled: bool,
        venue_id: i64,
        location_id: i64,
        venue: String,
        city: String,
        state: String,
        days_until: i64,
    }

    let rows: Vec<UpcomingRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.notes, e.cancelled, e.venue_id, v.location_id,
                v.name as venue, l.city, l.state,
                CAST(julianday(e.date) - julianday(date('now', 'localtime')) AS INTEGER) as days_until
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON v.location_id = l.id
         WHERE e.date >= date('now', 'localtime') AND e.cancelled = 0
         ORDER BY e.date ASC",
    )
    .fetch_all(pool)
    .await?;

    let mut upcoming = Vec::new();
    for row in rows {
        let artist_names: Vec<ArtistInfo> = sqlx::query_as(
            "SELECT a.id, a.name, ea.set_group FROM artists a
             JOIN event_artists ea ON a.id = ea.artist_id
             WHERE ea.event_id = ?1
             ORDER BY ea.set_group NULLS LAST, a.name",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;

        upcoming.push(UpcomingEvent {
            event: EventDetail {
                id: row.id,
                name: row.name,
                date: row.date,
                end_date: row.end_date,
                notes: row.notes,
                cancelled: row.cancelled,
                venue: row.venue,
                city: row.city,
                state: row.state,
                artist_sets: EventDetail::group_artists(artist_names),
                friends: fetch_event_friends(pool, row.id).await?,
                venue_id: row.venue_id,
                location_id: row.location_id,
            },
            days_until: row.days_until,
        });
    }

    Ok(upcoming)
}

// ── Venue autocomplete data (event form) ──

pub async fn get_venue_autocomplete(
    pool: &SqlitePool,
) -> Result<Vec<VenueAutocompleteEntry>, sqlx::Error> {
    // Join raw venue rows to their locations, then group by lowercased name
    // so "The Independent" and "the independent" collapse to one entry
    // (first-seen casing wins). This was the spot the audit flagged with an
    // active divergence risk — the EventForm used to re-implement this loop
    // in TypeScript, and the inline comment literally said "mirrors Rust's
    // dedupe." Now the rule has exactly one home.
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT v.name, l.city, l.state
         FROM venues v
         JOIN locations l ON v.location_id = l.id
         ORDER BY v.name COLLATE NOCASE, l.state, l.city",
    )
    .fetch_all(pool)
    .await?;

    let mut entries: Vec<VenueAutocompleteEntry> = Vec::new();
    let mut index_of: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (name, city, state) in rows {
        let key = name.to_lowercase();
        if let Some(&idx) = index_of.get(&key) {
            entries[idx].locations.push(VenueLocation { city, state });
        } else {
            index_of.insert(key, entries.len());
            entries.push(VenueAutocompleteEntry {
                display_name: name,
                locations: vec![VenueLocation { city, state }],
            });
        }
    }
    Ok(entries)
}

// ── Artist tag chip aggregation (Artists list filter strip) ──

pub async fn get_artist_tag_counts(pool: &SqlitePool) -> Result<Vec<TagCount>, sqlx::Error> {
    // Walks the same fetch_all_artist_tags data the list query uses, so tag
    // semantics stay consistent — one tag list per artist, pre-cleaned by
    // the tags module. Counts are "how many distinct artists carry this
    // tag", matching the previous TypeScript aggregation this replaced.
    //
    // First-seen casing wins for the display name: the iteration order
    // over the HashMap is non-deterministic, so the "first" here is "first
    // encountered during this particular call" — good enough for a chip
    // label, and stable within a single query's result. The same tag ends
    // up with the same count regardless of which spelling survives.
    let tag_map = super::tags::fetch_all_artist_tags(pool).await?;

    let mut buckets: std::collections::HashMap<String, (String, i64)> =
        std::collections::HashMap::new();
    for (_artist_id, tags) in tag_map {
        for tag in tags {
            let key = tag.to_lowercase();
            buckets
                .entry(key)
                .and_modify(|(_, c)| *c += 1)
                .or_insert((tag, 1));
        }
    }

    let mut counts: Vec<TagCount> = buckets
        .into_iter()
        .map(|(key, (display, count))| TagCount { key, display, count })
        .collect();

    // Sort mirrors the old TS order: count desc, display alphabetical on
    // ties — so the chip strip has a deterministic layout across renders.
    counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.display.cmp(&b.display)));
    Ok(counts)
}

// ── Media counts (Media page tab strip) ──

pub async fn get_media_counts(pool: &SqlitePool) -> Result<MediaCounts, sqlx::Error> {
    // Video rows are whatever has a `video/*` mime type; everything else
    // counts as a photo. This matches the frontend's `isVideoMime` check,
    // which uses the same prefix test. One query, two COUNTs — cheap.
    let (photos, videos): (i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(CASE WHEN mime_type NOT LIKE 'video/%' THEN 1 END) as photos,
            COUNT(CASE WHEN mime_type LIKE 'video/%' THEN 1 END) as videos
         FROM event_media",
    )
    .fetch_one(pool)
    .await?;
    Ok(MediaCounts {
        all: photos + videos,
        photos,
        videos,
    })
}

// ── Per-entity event-name aggregation for list tooltips ──
//
// The Artists/Venues/Locations list pages render a bar for each row with a
// hover tooltip showing the event names tied to that row. Before these
// queries existed, the frontend pulled *every* event via `get_events` and
// walked the relationships in TypeScript — a lot of data on the wire for
// a small amount of displayed text, and aggregation logic leaking into a
// layer that's supposed to be display-only. Now the database does the
// grouping in one round-trip.
//
// `group_event_names` is the one place the grouping actually happens.
// The three entity-specific functions just vary the SQL.

fn group_event_names(pairs: Vec<(i64, String)>) -> Vec<EntityEventNames> {
    // Preserves per-id ordering because we iterate in SQL-returned order
    // (date DESC). HashMap entry insertion order is fine as a side effect —
    // the frontend turns the result into a lookup map, so the outer Vec's
    // order is not load-bearing.
    let mut map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
    for (id, name) in pairs {
        map.entry(id).or_default().push(name);
    }
    map.into_iter()
        .map(|(id, names)| EntityEventNames { id, names })
        .collect()
}

pub async fn get_artist_event_names(
    pool: &SqlitePool,
) -> Result<Vec<EntityEventNames>, sqlx::Error> {
    // An artist row per (event, set_group) pairing — so if an artist appears
    // in multiple set_groups of the same event, the event name is listed
    // twice. That matches the old TypeScript behavior, which walked every
    // artist slot indiscriminately.
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT ea.artist_id, e.name
         FROM event_artists ea
         JOIN events e ON e.id = ea.event_id
         ORDER BY e.date DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(group_event_names(rows))
}

pub async fn get_venue_event_names(
    pool: &SqlitePool,
) -> Result<Vec<EntityEventNames>, sqlx::Error> {
    let rows: Vec<(i64, String)> =
        sqlx::query_as("SELECT venue_id, name FROM events ORDER BY date DESC")
            .fetch_all(pool)
            .await?;
    Ok(group_event_names(rows))
}

pub async fn get_location_event_names(
    pool: &SqlitePool,
) -> Result<Vec<EntityEventNames>, sqlx::Error> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT v.location_id, e.name
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         ORDER BY e.date DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(group_event_names(rows))
}

pub async fn get_friend_event_names(
    pool: &SqlitePool,
) -> Result<Vec<EntityEventNames>, sqlx::Error> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT ef.friend_id, e.name
         FROM event_friends ef
         JOIN events e ON e.id = ef.event_id
         ORDER BY e.date DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(group_event_names(rows))
}

// ── Stats ──

pub async fn get_stats(pool: &SqlitePool) -> Result<Stats, sqlx::Error> {
    let (total_events,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM events WHERE cancelled = 0 AND date <= date('now')")
            .fetch_one(pool)
            .await?;

    let (total_artists,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM artists")
            .fetch_one(pool)
            .await?;

    let (total_venues,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM venues")
            .fetch_one(pool)
            .await?;

    let (total_locations,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM locations")
            .fetch_one(pool)
            .await?;

    let top_artists: Vec<EntityCount> = sqlx::query_as(
        "SELECT a.id, a.name, COUNT(ea.event_id) as count
         FROM artists a
         JOIN event_artists ea ON a.id = ea.artist_id
         JOIN events e ON ea.event_id = e.id
         WHERE e.cancelled = 0 AND e.date <= date('now')
         GROUP BY a.id
         ORDER BY count DESC
         LIMIT 10",
    )
    .fetch_all(pool)
    .await?;

    let top_venues: Vec<EntityCount> = sqlx::query_as(
        "SELECT v.id, v.name, COUNT(e.id) as count
         FROM venues v
         JOIN events e ON v.id = e.venue_id
         WHERE e.cancelled = 0 AND e.date <= date('now')
         GROUP BY v.id
         ORDER BY count DESC
         LIMIT 10",
    )
    .fetch_all(pool)
    .await?;

    let mut top_friends: Vec<EntityCount> = sqlx::query_as(
        "SELECT f.id, f.name, COUNT(ef.event_id) as count
         FROM friends f
         JOIN event_friends ef ON f.id = ef.friend_id
         JOIN events e ON ef.event_id = e.id
         WHERE e.cancelled = 0 AND e.date <= date('now')
         GROUP BY f.id
         ORDER BY count DESC
         LIMIT 10",
    )
    .fetch_all(pool)
    .await?;
    // Only friends are masked here — top_artists/top_venues use EntityCount too
    // but are public, so they deliberately don't go through this.
    mask_friend_names_if_streamer(pool, &mut top_friends).await;

    let events_per_year: Vec<YearCount> = sqlx::query_as(
        "SELECT substr(date, 1, 4) as year, COUNT(*) as count
         FROM events
         WHERE cancelled = 0 AND date <= date('now')
         GROUP BY year
         ORDER BY year DESC",
    )
    .fetch_all(pool)
    .await?;

    let events_per_month: Vec<MonthCount> = sqlx::query_as(
        "SELECT substr(date, 6, 2) as month, COUNT(*) as count
         FROM events
         WHERE cancelled = 0 AND date <= date('now')
         GROUP BY month
         ORDER BY month",
    )
    .fetch_all(pool)
    .await?;

    let top_genres = top_genres_from_tags(pool).await?;

    Ok(Stats {
        total_events,
        total_artists,
        total_venues,
        total_locations,
        top_artists,
        top_venues,
        top_friends,
        events_per_year,
        events_per_month,
        top_genres,
    })
}

/// Aggregate the Top Genres radar data from the user-curated `artist_tags`.
/// Each tag on an artist contributes the full set of attended events that
/// artist played at, counted by **distinct event ids** so a festival with
/// five indie bands still only counts once for "indie", not five times. We
/// join events → event_artists → artist_tags once, then bucket
/// `HashMap<tag, HashSet<event_id>>` in memory — cheap at personal-tracker
/// scale and keeps the SQL simple.
async fn top_genres_from_tags(pool: &SqlitePool) -> Result<Vec<GenreCount>, sqlx::Error> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT DISTINCT e.id, t.tag
         FROM events e
         JOIN event_artists ea ON ea.event_id = e.id
         JOIN artist_tags t ON t.artist_id = ea.artist_id
         WHERE e.cancelled = 0 AND e.date <= date('now')",
    )
    .fetch_all(pool)
    .await?;

    // Tags are already normalized (lowercased) at write time, so bucketing is a
    // straight group-by — no case folding or display-name reconciliation.
    let mut buckets: std::collections::HashMap<String, std::collections::HashSet<i64>> =
        std::collections::HashMap::new();

    for (event_id, tag) in rows {
        buckets.entry(tag).or_default().insert(event_id);
    }

    let mut counts: Vec<GenreCount> = buckets
        .into_iter()
        .map(|(tag, set)| GenreCount {
            name: tag,
            count: set.len() as i64,
        })
        .collect();

    // Sort by event count descending, break ties alphabetically so the
    // radar order is stable across renders.
    counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    counts.truncate(8);

    Ok(counts)
}
