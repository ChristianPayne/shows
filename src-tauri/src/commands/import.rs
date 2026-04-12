use sqlx::SqlitePool;
use tauri::State;

use crate::db::queries;

/// Result of a CSV import operation.
#[derive(serde::Serialize)]
pub struct ImportResult {
    pub events_created: usize,
    pub events_skipped: usize,
    pub artists_created: usize,
    pub venues_created: usize,
    pub locations_created: usize,
}

#[tauri::command]
pub async fn import_csv(pool: State<'_, SqlitePool>, csv_content: String) -> Result<ImportResult, String> {
    // Track counts before import to calculate how many new entities were created
    let (artists_before,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artists")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let (venues_before,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM venues")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let (locations_before,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM locations")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Auto-detect delimiter: pick whichever splits the header into more fields
    let first_line = csv_content.lines().next().unwrap_or("");
    let tab_count = first_line.matches('\t').count();
    let comma_count = first_line.matches(',').count();
    let delimiter = if tab_count >= comma_count { b'\t' } else { b',' };

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .trim(csv::Trim::All)
        .from_reader(csv_content.as_bytes());

    // Detect column layout from headers
    let headers = reader.headers().map_err(|e| format!("Failed to read headers: {}", e))?.clone();
    let header_list: Vec<String> = headers.iter().map(|h| h.trim().to_lowercase()).collect();
    let has_end_date = header_list.iter().any(|h| h == "end date");

    // Column indices based on format
    let (idx_date, idx_end_date, idx_event, idx_artists, idx_venue, idx_location) = if has_end_date {
        // 6-column format: Date, End Date, Event, Artists, Venue, Location
        (0, Some(1), 2, 3, 4, 5)
    } else {
        // 5-column format: Date, Event, Artists, Venue, Location
        (0, None, 1, 2, 3, 4)
    };

    let min_cols = if has_end_date { 6 } else { 5 };
    let mut events_created: usize = 0;
    let mut skipped: usize = 0;

    for (line_num, result) in reader.records().enumerate() {
        let record = result.map_err(|e| format!("Row {}: {}", line_num + 2, e))?;

        if record.len() < min_cols {
            return Err(format!(
                "Row {}: Expected {} columns but found {}. Row content: {:?}",
                line_num + 2,
                min_cols,
                record.len(),
                record.iter().collect::<Vec<_>>()
            ));
        }

        let date_raw = record.get(idx_date).unwrap_or("").trim();
        let end_date_raw = idx_end_date.map(|i| record.get(i).unwrap_or("").trim());
        let event_name = record.get(idx_event).unwrap_or("").trim();
        let artists_raw = record.get(idx_artists).unwrap_or("").trim();
        let venue_name = record.get(idx_venue).unwrap_or("").trim();
        let location_raw = record.get(idx_location).unwrap_or("").trim();

        if event_name.is_empty() {
            return Err(format!("Row {}: Event name is empty", line_num + 2));
        }

        let date = parse_date(date_raw)
            .map_err(|e| format!("Row {}: Invalid date '{}' — {}", line_num + 2, date_raw, e))?;

        let end_date = match end_date_raw {
            Some(d) if !d.is_empty() => Some(parse_date(d)
                .map_err(|e| format!("Row {}: Invalid end date '{}' — {}", line_num + 2, d, e))?),
            _ => None,
        };

        let (city, state) = parse_location(location_raw)
            .map_err(|e| format!("Row {}: Invalid location '{}' — {}", line_num + 2, location_raw, e))?;

        let location_id = queries::find_or_create_location(pool.inner(), &city, &state)
            .await
            .map_err(|e| format!("Row {}: Failed to create location — {}", line_num + 2, e))?;

        let venue_id = queries::find_or_create_venue(pool.inner(), venue_name)
            .await
            .map_err(|e| format!("Row {}: Failed to create venue — {}", line_num + 2, e))?;

        // Skip if an event with the same name, date, and venue already exists
        let existing: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM events WHERE name = ?1 AND date = ?2 AND venue_id = ?3"
        )
        .bind(event_name)
        .bind(&date)
        .bind(venue_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Row {}: Failed to check for duplicates — {}", line_num + 2, e))?;

        if existing.is_some() {
            skipped += 1;
            continue;
        }

        // Parse comma-separated artists, detecting b2b sets
        let artist_entries: Vec<&str> = artists_raw
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let mut artists: Vec<(i64, Option<i64>)> = Vec::new();
        let mut next_set_group: i64 = 1;

        for entry in &artist_entries {
            // Detect b2b patterns: "Artist1 b2b Artist2" or "Artist1 B2B Artist2"
            let b2b_parts = split_b2b(entry);
            if b2b_parts.len() > 1 {
                let group = next_set_group;
                next_set_group += 1;
                for part in &b2b_parts {
                    let id = queries::find_or_create_artist(pool.inner(), part)
                        .await
                        .map_err(|e| format!("Row {}: Failed to create artist '{}' — {}", line_num + 2, part, e))?;
                    artists.push((id, Some(group)));
                }
            } else {
                let id = queries::find_or_create_artist(pool.inner(), entry)
                    .await
                    .map_err(|e| format!("Row {}: Failed to create artist '{}' — {}", line_num + 2, entry, e))?;
                artists.push((id, None));
            }
        }

        queries::create_event(pool.inner(), event_name, &date, end_date.as_deref(), venue_id, location_id, &artists)
            .await
            .map_err(|e| format!("Row {}: Failed to create event — {}", line_num + 2, e))?;

        events_created += 1;
    }

    // Calculate new entities created
    let (artists_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artists")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let (venues_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM venues")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let (locations_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM locations")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(ImportResult {
        events_created,
        events_skipped: skipped,
        artists_created: (artists_after - artists_before) as usize,
        venues_created: (venues_after - venues_before) as usize,
        locations_created: (locations_after - locations_before) as usize,
    })
}

/// Parse date from M/D/YYYY or MM/DD/YYYY to YYYY-MM-DD format for SQLite storage.
fn parse_date(raw: &str) -> Result<String, String> {
    // Try YYYY-MM-DD first (already in target format)
    if raw.len() == 10 && raw.chars().nth(4) == Some('-') {
        return Ok(raw.to_string());
    }

    // Parse M/D/YYYY or MM/DD/YYYY
    let parts: Vec<&str> = raw.split('/').collect();
    if parts.len() != 3 {
        return Err("Expected format M/D/YYYY or YYYY-MM-DD".to_string());
    }

    let month: u32 = parts[0].parse().map_err(|_| "Invalid month")?;
    let day: u32 = parts[1].parse().map_err(|_| "Invalid day")?;
    let year: u32 = parts[2].parse().map_err(|_| "Invalid year")?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || year < 1900 {
        return Err("Date values out of range".to_string());
    }

    Ok(format!("{:04}-{:02}-{:02}", year, month, day))
}

/// Parse "City, ST" into (city, state) tuple.
fn parse_location(raw: &str) -> Result<(String, String), String> {
    // Find the last comma to handle cities with commas in the name
    let last_comma = raw.rfind(',').ok_or("Expected format 'City, ST'")?;
    let city = raw[..last_comma].trim().to_string();
    let state = raw[last_comma + 1..].trim().to_string();

    if city.is_empty() || state.is_empty() {
        return Err("City and state cannot be empty".to_string());
    }

    Ok((city, state))
}

/// Split a b2b artist entry into individual names.
/// Handles patterns like "Artist1 b2b Artist2", "Artist1 B2B Artist2".
fn split_b2b(entry: &str) -> Vec<String> {
    // Case-insensitive split on " b2b "
    let lower = entry.to_lowercase();
    if let Some(pos) = lower.find(" b2b ") {
        let left = entry[..pos].trim().to_string();
        let right = entry[pos + 5..].trim().to_string();
        // Handle chained b2bs: "A b2b B b2b C"
        let mut result = vec![left];
        result.extend(split_b2b(&right));
        result
    } else {
        vec![entry.trim().to_string()]
    }
}
