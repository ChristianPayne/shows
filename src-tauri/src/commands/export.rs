use sqlx::SqlitePool;
use tauri::State;

use crate::db::queries;

/// Export all events as CSV to a file. B2b artists are joined with " b2b ".
#[tauri::command]
pub async fn export_csv(pool: State<'_, SqlitePool>, destination: String) -> Result<(), String> {
    let events = queries::get_all_events(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(Vec::new());

    wtr.write_record(["Date", "End Date", "Event", "Artists", "Venue", "Location"])
        .map_err(|e| e.to_string())?;

    for event in &events {
        let artists_str = format_artists_for_export(&event.artist_sets);
        let date = format_date_for_export(&event.date);
        let end_date = event.end_date.as_ref()
            .map(|d| format_date_for_export(d))
            .unwrap_or_default();
        let location = format!("{}, {}", event.city, event.state);

        wtr.write_record([&date, &end_date, &event.name, &artists_str, &event.venue, &location])
            .map_err(|e| e.to_string())?;
    }

    let bytes = wtr.into_inner().map_err(|e| e.to_string())?;
    std::fs::write(&destination, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

fn format_artists_for_export(sets: &[crate::db::models::ArtistSet]) -> String {
    sets.iter()
        .map(|set| {
            set.artists.iter()
                .map(|a| a.name.as_str())
                .collect::<Vec<_>>()
                .join(" b2b ")
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn format_date_for_export(date: &str) -> String {
    // YYYY-MM-DD → M/D/YYYY
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() == 3 {
        let month: u32 = parts[1].parse().unwrap_or(0);
        let day: u32 = parts[2].parse().unwrap_or(0);
        format!("{}/{}/{}", month, day, parts[0])
    } else {
        date.to_string()
    }
}
