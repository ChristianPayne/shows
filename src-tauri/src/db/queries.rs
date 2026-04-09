use sqlx::SqlitePool;

use super::models::*;

// ── Find-or-create operations ──

pub async fn find_or_create_location(
    pool: &SqlitePool,
    city: &str,
    state: &str,
) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM locations WHERE city = ?1 AND state = ?2")
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

pub async fn find_or_create_venue(
    pool: &SqlitePool,
    name: &str,
) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM venues WHERE name = ?1")
            .bind(name)
            .fetch_optional(pool)
            .await?;

    if let Some((id,)) = row {
        return Ok(id);
    }

    let result = sqlx::query("INSERT INTO venues (name) VALUES (?1)")
        .bind(name)
        .execute(pool)
        .await?;

    Ok(result.last_insert_rowid())
}

pub async fn find_or_create_artist(
    pool: &SqlitePool,
    name: &str,
) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM artists WHERE name = ?1")
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

// ── Event CRUD ──

/// Each artist entry includes an optional set_group for b2b grouping.
pub async fn create_event(
    pool: &SqlitePool,
    name: &str,
    date: &str,
    end_date: Option<&str>,
    venue_id: i64,
    location_id: i64,
    artists: &[(i64, Option<i64>)],
) -> Result<i64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO events (name, date, end_date, venue_id, location_id) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(name)
    .bind(date)
    .bind(end_date)
    .bind(venue_id)
    .bind(location_id)
    .execute(pool)
    .await?;

    let event_id = result.last_insert_rowid();

    for (artist_id, set_group) in artists {
        sqlx::query("INSERT INTO event_artists (event_id, artist_id, set_group) VALUES (?1, ?2, ?3)")
            .bind(event_id)
            .bind(artist_id)
            .bind(set_group)
            .execute(pool)
            .await?;
    }

    Ok(event_id)
}

pub async fn update_event(
    pool: &SqlitePool,
    event_id: i64,
    name: &str,
    date: &str,
    end_date: Option<&str>,
    venue_id: i64,
    location_id: i64,
    artists: &[(i64, Option<i64>)],
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE events SET name = ?1, date = ?2, end_date = ?3, venue_id = ?4, location_id = ?5, updated_at = datetime('now') WHERE id = ?6",
    )
    .bind(name)
    .bind(date)
    .bind(end_date)
    .bind(venue_id)
    .bind(location_id)
    .bind(event_id)
    .execute(pool)
    .await?;

    // Replace artist links: delete existing, insert new
    sqlx::query("DELETE FROM event_artists WHERE event_id = ?1")
        .bind(event_id)
        .execute(pool)
        .await?;

    for (artist_id, set_group) in artists {
        sqlx::query("INSERT INTO event_artists (event_id, artist_id, set_group) VALUES (?1, ?2, ?3)")
            .bind(event_id)
            .bind(artist_id)
            .bind(set_group)
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

pub async fn rename_artist(pool: &SqlitePool, artist_id: i64, name: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE artists SET name = ?1 WHERE id = ?2")
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

/// Merge one location into another. Reassigns all events, then deletes the duplicate.
pub async fn merge_locations(pool: &SqlitePool, keep_id: i64, merge_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE events SET location_id = ?1 WHERE location_id = ?2")
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

/// Delete a location only if it has no linked events.
pub async fn delete_location(pool: &SqlitePool, location_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM locations WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM events WHERE location_id = ?1)")
        .bind(location_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ── Query operations ──

pub async fn get_all_events(pool: &SqlitePool) -> Result<Vec<EventDetail>, sqlx::Error> {
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.name, e.date, e.end_date, e.cancelled, e.venue_id, e.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON e.location_id = l.id
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
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artists: artist_names,
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
        "SELECT e.id, e.name, e.date, e.end_date, e.cancelled, e.venue_id, e.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON e.location_id = l.id
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
                cancelled: row.cancelled,
                venue: row.venue,
                city: row.city,
                state: row.state,
                artists: artist_names,
                venue_id: row.venue_id,
                location_id: row.location_id,
            }))
        }
    }
}

// ── Entity lists with counts ──

pub async fn get_artists_with_counts(
    pool: &SqlitePool,
) -> Result<Vec<EntityWithCount>, sqlx::Error> {
    let rows: Vec<EntityWithCount> = sqlx::query_as(
        "SELECT a.id, a.name, COUNT(ea.event_id) as event_count
         FROM artists a
         LEFT JOIN event_artists ea ON a.id = ea.artist_id
         GROUP BY a.id
         ORDER BY CASE WHEN a.name LIKE 'The %' THEN substr(a.name, 5) ELSE a.name END",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_venues_with_counts(
    pool: &SqlitePool,
) -> Result<Vec<EntityWithCount>, sqlx::Error> {
    let rows: Vec<EntityWithCount> = sqlx::query_as(
        "SELECT v.id, v.name, COUNT(e.id) as event_count
         FROM venues v
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
         LEFT JOIN events e ON l.id = e.location_id
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
        "SELECT e.id, e.name, e.date, e.end_date, e.cancelled, e.venue_id, e.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON e.location_id = l.id
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
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artists: artist_names,
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
        "SELECT e.id, e.name, e.date, e.end_date, e.cancelled, e.venue_id, e.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON e.location_id = l.id
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
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artists: artist_names,
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
        "SELECT e.id, e.name, e.date, e.end_date, e.cancelled, e.venue_id, e.location_id,
                v.name as venue, l.city, l.state
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         JOIN locations l ON e.location_id = l.id
         WHERE e.location_id = ?1
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
            cancelled: row.cancelled,
            venue: row.venue,
            city: row.city,
            state: row.state,
            artists: artist_names,
            venue_id: row.venue_id,
            location_id: row.location_id,
        });
    }

    Ok(events)
}

// ── Stats ──

pub async fn get_stats(pool: &SqlitePool) -> Result<Stats, sqlx::Error> {
    let (total_events,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM events WHERE cancelled = 0")
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
         WHERE e.cancelled = 0
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
         WHERE e.cancelled = 0
         GROUP BY v.id
         ORDER BY count DESC
         LIMIT 10",
    )
    .fetch_all(pool)
    .await?;

    let events_per_year: Vec<YearCount> = sqlx::query_as(
        "SELECT substr(date, 1, 4) as year, COUNT(*) as count
         FROM events
         WHERE cancelled = 0
         GROUP BY year
         ORDER BY year DESC",
    )
    .fetch_all(pool)
    .await?;

    let events_per_month: Vec<MonthCount> = sqlx::query_as(
        "SELECT substr(date, 6, 2) as month, COUNT(*) as count
         FROM events
         WHERE cancelled = 0
         GROUP BY month
         ORDER BY month",
    )
    .fetch_all(pool)
    .await?;

    Ok(Stats {
        total_events,
        total_artists,
        total_venues,
        total_locations,
        top_artists,
        top_venues,
        events_per_year,
        events_per_month,
    })
}
