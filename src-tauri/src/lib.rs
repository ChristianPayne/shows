mod commands;
mod db;

use commands::{backup, entities, events, export, import, maintenance, settings, stats};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data directory");

            // Initialize the database on a blocking runtime since setup is sync
            let pool = tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(db::init(app_data_dir))
                .expect("Failed to initialize database");

            app.manage(pool);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            events::get_events,
            events::get_event,
            events::create_event,
            events::update_event,
            events::toggle_b2b,
            events::set_event_cancelled,
            events::delete_event,
            entities::get_artists,
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
            export::export_csv,
            backup::backup_database,
            backup::restore_database,
            maintenance::wipe_database,
            settings::get_setting,
            settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
