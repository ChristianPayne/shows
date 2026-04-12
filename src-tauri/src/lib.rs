mod commands;
mod db;
mod metadata;
mod updater;
mod util;

use std::sync::Mutex;

use commands::{backup, entities, events, export, genres, import, links, maintenance, media, setlists, settings, stats};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data directory");

            // Run DB init and the dev-media-split first-launch migration on
            // the same blocking runtime since setup is sync. The migration
            // is a no-op in release (the dev/release roots collide), so this
            // costs nothing for production users.
            let rt = tokio::runtime::Runtime::new().unwrap();
            let pool = rt
                .block_on(db::init(app_data_dir.clone()))
                .expect("Failed to initialize database");
            if let Err(e) = rt.block_on(media::migrate_dev_media_split(&pool, &app_data_dir)) {
                eprintln!("[startup] media split migration failed: {}", e);
            }

            app.manage(pool);
            app.manage(updater::PendingUpdate(Mutex::new(None)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            events::get_events,
            events::get_event,
            events::get_artist_context,
            events::create_event,
            events::update_event,
            events::toggle_b2b,
            events::set_event_cancelled,
            events::delete_event,
            entities::get_artists,
            entities::get_artist_stats,
            entities::get_venues,
            entities::get_locations,
            entities::get_events_for_artist,
            entities::get_events_for_venue,
            entities::get_events_for_location,
            entities::rename_artist,
            entities::rename_venue,
            entities::rename_location,
            entities::merge_artists,
            entities::merge_venues,
            entities::merge_locations,
            entities::delete_venue,
            entities::delete_artist,
            entities::delete_location,
            stats::get_stats,
            import::import_csv,
            import::preview_csv_import,
            import::import_csv_filtered,
            export::export_csv,
            backup::backup_database,
            backup::restore_database,
            genres::fetch_genres,
            setlists::has_setlistfm_key,
            setlists::get_cached_setlist,
            setlists::get_setlist,
            genres::clear_artist_metadata,
            links::get_artist_links,
            genres::search_musicbrainz,
            genres::apply_musicbrainz_match,
            media::add_event_media,
            media::get_event_media,
            media::get_media_for_events,
            media::delete_event_media,
            media::update_event_media_caption,
            maintenance::wipe_database,
            maintenance::get_db_version,
            settings::get_setting,
            settings::set_setting,
            updater::fetch_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
