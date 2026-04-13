use std::collections::HashSet;

use sqlx::SqlitePool;
use tauri::State;

use crate::db::queries;

/// Result of a CSV import operation.
#[derive(serde::Serialize, specta::Type)]
pub struct ImportResult {
    pub events_created: usize,
    pub events_skipped: usize,
    pub artists_created: usize,
    pub venues_created: usize,
    pub locations_created: usize,
}

/// A single CSV row after parsing — no database interaction. Shared by the
/// preview and import paths so field-level parsing lives in exactly one place.
/// `parse_error` is populated when the row fails validation; rows with errors
/// are still surfaced to the UI so the user can see what went wrong, but they
/// can't be checked in the preview dialog.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct ParsedRow {
    pub row_index: usize,
    pub date: Option<String>,
    pub end_date: Option<String>,
    pub event_name: String,
    pub venue_name: String,
    pub city: String,
    pub state: String,
    /// Each inner `Vec` is one comma-separated entry from the CSV, already
    /// split on " b2b ". Single-artist entries are length-1 sets; b2b entries
    /// are length-N sets that import as one `set_group`. The preview UI
    /// flattens this for display, but the write path uses the groups as-is
    /// so b2b info from the CSV survives round-trip.
    pub artist_groups: Vec<Vec<String>>,
    pub parse_error: Option<String>,
}

/// Per-row preview classification. `VenueConflict` carries the existing
/// location so the UI can tell the user exactly which other city claims the
/// venue name.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind")]
pub enum PreviewStatus {
    Ok,
    Duplicate,
    VenueConflict { existing_location: String },
    ParseError { message: String },
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct PreviewRow {
    pub row: ParsedRow,
    pub status: PreviewStatus,
}

/// Legacy one-shot import — parses and writes in one call with no row-level
/// filtering. Now a thin wrapper over `run_import` so the write loop lives in
/// one place. Kept so any external caller (or future bulk path) still has the
/// "import everything" entry point.
#[specta::specta]
#[tauri::command]
pub async fn import_csv(
    pool: State<'_, SqlitePool>,
    csv_content: String,
) -> Result<ImportResult, String> {
    let rows = parse_csv_rows(&csv_content)?;
    run_import(pool.inner(), &rows, None).await
}

/// Read-only classification of every CSV row. No writes, no side effects.
/// Preview checks duplicates and venue conflicts against the live database
/// so the user sees the same outcome they'd get on commit — minus races from
/// concurrent writes, which are re-caught on the actual import.
#[specta::specta]
#[tauri::command]
pub async fn preview_csv_import(
    pool: State<'_, SqlitePool>,
    csv_content: String,
) -> Result<Vec<PreviewRow>, String> {
    let rows = parse_csv_rows(&csv_content)?;
    let mut out = Vec::with_capacity(rows.len());

    for row in rows {
        if let Some(err) = row.parse_error.clone() {
            out.push(PreviewRow {
                row,
                status: PreviewStatus::ParseError { message: err },
            });
            continue;
        }

        let status = classify_row(pool.inner(), &row)
            .await
            .map_err(|e| format!("Row {}: {}", row.row_index + 2, e))?;
        out.push(PreviewRow { row, status });
    }

    Ok(out)
}

/// Filtered import — run the write path, but only for rows whose index is in
/// `selected_indices`. Unselected rows are silently skipped (not counted as
/// `events_skipped`; that counter is reserved for duplicates detected during
/// the write).
#[specta::specta]
#[tauri::command]
pub async fn import_csv_filtered(
    pool: State<'_, SqlitePool>,
    csv_content: String,
    selected_indices: Vec<usize>,
) -> Result<ImportResult, String> {
    let rows = parse_csv_rows(&csv_content)?;
    let selection: HashSet<usize> = selected_indices.into_iter().collect();
    run_import(pool.inner(), &rows, Some(&selection)).await
}

// ── Internals ──

/// Pure CSV → `ParsedRow` pipeline. Top-level failures (unreadable header,
/// wrong column count) still return `Err`. Per-row failures are attached to
/// the row via `parse_error` so the UI can show them without aborting the
/// whole preview.
fn parse_csv_rows(csv_content: &str) -> Result<Vec<ParsedRow>, String> {
    // Auto-detect delimiter: pick whichever splits the header into more fields
    let first_line = csv_content.lines().next().unwrap_or("");
    let tab_count = first_line.matches('\t').count();
    let comma_count = first_line.matches(',').count();
    let delimiter = if tab_count >= comma_count { b'\t' } else { b',' };

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .trim(csv::Trim::All)
        .from_reader(csv_content.as_bytes());

    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read headers: {}", e))?
        .clone();
    let header_list: Vec<String> = headers.iter().map(|h| h.trim().to_lowercase()).collect();
    let has_end_date = header_list.iter().any(|h| h == "end date");

    let (idx_date, idx_end_date, idx_event, idx_artists, idx_venue, idx_location) = if has_end_date
    {
        (0, Some(1), 2, 3, 4, 5)
    } else {
        (0, None, 1, 2, 3, 4)
    };

    let min_cols = if has_end_date { 6 } else { 5 };
    let mut out = Vec::new();

    for (i, result) in reader.records().enumerate() {
        let record = result.map_err(|e| format!("Row {}: {}", i + 2, e))?;

        // Column-count errors are rendered per-row rather than aborting the
        // whole parse, so the user can still import the good rows.
        if record.len() < min_cols {
            out.push(ParsedRow {
                row_index: i,
                date: None,
                end_date: None,
                event_name: String::new(),
                venue_name: String::new(),
                city: String::new(),
                state: String::new(),
                artist_groups: Vec::new(),
                parse_error: Some(format!(
                    "Expected {} columns but found {}",
                    min_cols,
                    record.len()
                )),
            });
            continue;
        }

        let date_raw = record.get(idx_date).unwrap_or("").trim();
        let end_date_raw = idx_end_date.map(|i| record.get(i).unwrap_or("").trim());
        let event_name = record.get(idx_event).unwrap_or("").trim().to_string();
        let artists_raw = record.get(idx_artists).unwrap_or("").trim();
        let venue_name = record.get(idx_venue).unwrap_or("").trim().to_string();
        let location_raw = record.get(idx_location).unwrap_or("").trim();

        // Gather the first field-level error rather than bailing — this way
        // one bad row never poisons the rest of the preview.
        let mut parse_error: Option<String> = None;
        if event_name.is_empty() {
            parse_error = Some("Event name is empty".to_string());
        }

        let date = match parse_date(date_raw) {
            Ok(d) => Some(d),
            Err(e) => {
                if parse_error.is_none() {
                    parse_error = Some(format!("Invalid date '{}' — {}", date_raw, e));
                }
                None
            }
        };

        let end_date = match end_date_raw {
            Some(d) if !d.is_empty() => match parse_date(d) {
                Ok(d) => Some(d),
                Err(e) => {
                    if parse_error.is_none() {
                        parse_error = Some(format!("Invalid end date '{}' — {}", d, e));
                    }
                    None
                }
            },
            _ => None,
        };

        let (city, state) = match parse_location(location_raw) {
            Ok(pair) => pair,
            Err(e) => {
                if parse_error.is_none() {
                    parse_error = Some(format!("Invalid location '{}' — {}", location_raw, e));
                }
                (String::new(), String::new())
            }
        };

        let artist_groups = parse_artist_groups(artists_raw);

        out.push(ParsedRow {
            row_index: i,
            date,
            end_date,
            event_name,
            venue_name,
            city,
            state,
            artist_groups,
            parse_error,
        });
    }

    Ok(out)
}

/// Split the artist column into grouped sets. Each comma-separated entry
/// becomes one group, and " b2b " inside an entry splits it further. The
/// import path uses groups directly to assign `set_group` ids; the preview
/// UI flattens them for display.
fn parse_artist_groups(raw: &str) -> Vec<Vec<String>> {
    raw.split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(split_b2b)
        .collect()
}

/// Read-only classification of a single parsed row. Returns `Ok`, `Duplicate`,
/// or `VenueConflict` — `ParseError` is handled by the caller before reaching
/// this function since parse errors don't need DB lookups.
async fn classify_row(pool: &SqlitePool, row: &ParsedRow) -> Result<PreviewStatus, String> {
    let existing_venues = queries::find_venues_with_location_by_name(pool, &row.venue_name)
        .await
        .map_err(|e| format!("Failed to look up venue — {}", e))?;

    // Does the location in this row already exist? If not, no venue-at-this-
    // location match is possible yet.
    let target_location_id = queries::find_location(pool, &row.city, &row.state)
        .await
        .map_err(|e| format!("Failed to look up location — {}", e))?;

    let matched_venue = target_location_id
        .and_then(|lid| existing_venues.iter().find(|(_, vloc, _, _)| *vloc == lid));

    if let Some(&(venue_id, _, _, _)) = matched_venue {
        // Venue + location pair already exists. Check if the event is a dup.
        let date_ref = row.date.as_deref().unwrap_or("");
        let exists = queries::event_exists(pool, &row.event_name, date_ref, venue_id)
            .await
            .map_err(|e| format!("Failed to check for duplicates — {}", e))?;
        if exists {
            return Ok(PreviewStatus::Duplicate);
        }
        return Ok(PreviewStatus::Ok);
    }

    // No venue at the target location. If any venue of this name exists
    // elsewhere, surface it as a conflict — the import would hard-fail
    // otherwise, and the user deserves to see which other city owns the name.
    if let Some((_, _, city, state)) = existing_venues.first() {
        return Ok(PreviewStatus::VenueConflict {
            existing_location: format!("{}, {}", city, state),
        });
    }

    Ok(PreviewStatus::Ok)
}

/// Core import loop — shared by `import_csv` and `import_csv_filtered`. When
/// `selection` is `Some`, only rows whose `row_index` is in the set are
/// written; everything else (including parse errors) is quietly skipped since
/// the caller has already decided not to include them.
async fn run_import(
    pool: &SqlitePool,
    rows: &[ParsedRow],
    selection: Option<&HashSet<usize>>,
) -> Result<ImportResult, String> {
    // Track counts before import to calculate how many new entities were created
    let (artists_before,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artists")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (venues_before,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM venues")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (locations_before,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM locations")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut events_created: usize = 0;
    let mut skipped: usize = 0;

    for row in rows {
        if let Some(sel) = selection {
            if !sel.contains(&row.row_index) {
                continue;
            }
        }
        // `import_csv` (no selection) pre-dates the preview flow and fails the
        // whole import on any parse error, matching its old behavior. In
        // `import_csv_filtered` the selection set should never include parse-
        // error rows (the UI disables them), but we guard here too so a
        // hand-crafted call can't sneak one through.
        if let Some(err) = &row.parse_error {
            return Err(format!("Row {}: {}", row.row_index + 2, err));
        }

        let date = row.date.clone().ok_or_else(|| {
            format!("Row {}: internal: missing date after parse", row.row_index + 2)
        })?;
        let location_id =
            queries::find_or_create_location(pool, &row.city, &row.state)
                .await
                .map_err(|e| {
                    format!(
                        "Row {}: Failed to create location — {}",
                        row.row_index + 2,
                        e
                    )
                })?;

        // Strict venue ↔ location pairing (see classify_row for the read-only
        // equivalent).
        let existing_venues = queries::find_venues_by_name(pool, &row.venue_name)
            .await
            .map_err(|e| format!("Row {}: Failed to look up venue — {}", row.row_index + 2, e))?;

        let venue_id = if let Some(&(id, _)) =
            existing_venues.iter().find(|(_, loc)| *loc == location_id)
        {
            id
        } else if !existing_venues.is_empty() {
            return Err(format!(
                "Row {}: Venue '{}' already exists at a different location. \
                 The CSV row says '{}, {}' but the database has it at a different city. \
                 Resolve the conflict (rename one venue, fix the CSV, or use the UI) and re-run the import.",
                row.row_index + 2,
                row.venue_name,
                row.city,
                row.state
            ));
        } else {
            queries::find_or_create_venue(pool, &row.venue_name, location_id)
                .await
                .map_err(|e| {
                    format!("Row {}: Failed to create venue — {}", row.row_index + 2, e)
                })?
        };

        let exists = queries::event_exists(pool, &row.event_name, &date, venue_id)
            .await
            .map_err(|e| {
                format!(
                    "Row {}: Failed to check for duplicates — {}",
                    row.row_index + 2,
                    e
                )
            })?;
        if exists {
            skipped += 1;
            continue;
        }

        let mut artists: Vec<(i64, Option<i64>)> = Vec::new();
        let mut next_set_group: i64 = 1;
        for group in &row.artist_groups {
            if group.len() > 1 {
                let g = next_set_group;
                next_set_group += 1;
                for name in group {
                    let (id, _was_inserted) = queries::find_or_create_artist(pool, name)
                        .await
                        .map_err(|e| {
                            format!(
                                "Row {}: Failed to create artist '{}' — {}",
                                row.row_index + 2,
                                name,
                                e
                            )
                        })?;
                    artists.push((id, Some(g)));
                }
            } else if let Some(name) = group.first() {
                let (id, _was_inserted) = queries::find_or_create_artist(pool, name)
                    .await
                    .map_err(|e| {
                        format!(
                            "Row {}: Failed to create artist '{}' — {}",
                            row.row_index + 2,
                            name,
                            e
                        )
                    })?;
                artists.push((id, None));
            }
        }

        queries::create_event(
            pool,
            &row.event_name,
            &date,
            row.end_date.as_deref(),
            venue_id,
            &artists,
        )
        .await
        .map_err(|e| format!("Row {}: Failed to create event — {}", row.row_index + 2, e))?;

        events_created += 1;
    }

    let (artists_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artists")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (venues_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM venues")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let (locations_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM locations")
        .fetch_one(pool)
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
    if raw.is_empty() {
        return Err("Date is empty".to_string());
    }
    // Try YYYY-MM-DD first (already in target format)
    if raw.len() == 10 && raw.chars().nth(4) == Some('-') {
        return Ok(raw.to_string());
    }

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
    let trimmed = entry.trim();
    let lower = trimmed.to_lowercase();
    if let Some(pos) = lower.find(" b2b ") {
        let left = trimmed[..pos].trim().to_string();
        let right = trimmed[pos + 5..].trim().to_string();
        let mut result = vec![left];
        result.extend(split_b2b(&right));
        result
    } else {
        vec![trimmed.to_string()]
    }
}
