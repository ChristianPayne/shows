use serde::Serialize;
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

pub struct PendingUpdate(pub Mutex<Option<Update>>);

/// Adjacently-tagged so the frontend can discriminate on `event` and get a
/// typed `data` payload. Kept in sync with the `useUpdater` hook's switch on
/// `event.event`.
#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    version: String,
    current_version: String,
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<UpdateMetadata>, String> {
    let url = Url::parse(
        "https://github.com/ChristianPayne/shows/releases/latest/download/latest.json",
    )
    .expect("invalid updater endpoint URL");

    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    let metadata = update.as_ref().map(|u| UpdateMetadata {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
    });

    *pending_update.0.lock().unwrap() = update;

    Ok(metadata)
}

#[tauri::command]
#[specta::specta]
pub async fn install_update(
    pending_update: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let Some(update) = pending_update.0.lock().unwrap().take() else {
        return Err("there is no pending update".to_string());
    };

    let mut started = false;

    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                    started = true;
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
