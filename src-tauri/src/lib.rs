mod commands;
mod db;
mod metadata;
mod updater;
mod util;

use std::sync::Mutex;

use commands::{backup, entities, events, export, genres, import, links, maintenance, media, query, setlists, settings, stats};
use tauri::Manager;

/// Shared builder construction so `run()` and the bindings-generation test
/// stay in lock-step — the command list only exists in one place, and the
/// test can call `.export()` on its own copy without spinning up a window.
pub fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            events::get_events,
            events::get_upcoming_events,
            events::get_event,
            events::get_artist_context,
            events::create_event,
            events::update_event,
            events::toggle_b2b,
            events::set_event_cancelled,
            events::delete_event,
            entities::get_artists,
            entities::get_artist_tag_counts,
            entities::get_artist_stats,
            entities::get_venues,
            entities::get_venue_autocomplete,
            entities::get_locations,
            entities::get_friends,
            entities::create_friend,
            entities::get_events_for_artist,
            entities::get_events_for_venue,
            entities::get_events_for_location,
            entities::get_events_for_friend,
            entities::get_artist_event_names,
            entities::get_venue_event_names,
            entities::get_location_event_names,
            entities::get_friend_event_names,
            query::query_events,
            query::query_artists,
            query::query_venues,
            query::query_locations,
            query::query_friends,
            entities::rename_artist,
            entities::rename_venue,
            entities::rename_location,
            entities::rename_friend,
            entities::merge_artists,
            entities::merge_venues,
            entities::merge_locations,
            entities::delete_venue,
            entities::delete_artist,
            entities::delete_location,
            entities::delete_friend,
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
            media::get_all_media,
            media::get_media_counts,
            media::delete_event_media,
            media::update_event_media_caption,
            maintenance::wipe_database,
            maintenance::get_db_version,
            settings::get_setting,
            settings::set_setting,
            updater::fetch_update,
            updater::install_update,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // tauri-specta owns both IPC dispatch and TS binding generation now. In
    // dev builds the Builder emits `src/bindings.ts` on startup so the
    // frontend's hand-written wrappers stay obsolete; in release builds
    // the `export` call is compiled out so bundled apps never touch that
    // path. Every command listed in `make_specta_builder` has a matching
    // `#[specta::specta]` annotation — specta's macro enforces the link at
    // compile time.
    let specta_builder = make_specta_builder();

    #[cfg(debug_assertions)]
    specta_builder
        .export(
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("// @ts-nocheck\n"),
            "../src/bindings.ts",
        )
        .expect("failed to export typescript bindings");

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
        .invoke_handler(specta_builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
