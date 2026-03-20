use crate::external_spots::ExternalSpot;
use crate::pota;
use crate::sota;
use tauri::Manager;

#[tauri::command]
pub async fn fetch_external_spots(
    sources: Vec<String>,
    app: tauri::AppHandle,
) -> Result<Vec<ExternalSpot>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let mut all_spots = Vec::new();

    for source in &sources {
        match source.as_str() {
            "pota" => match pota::fetch_pota_spots().await {
                Ok(spots) => all_spots.extend(spots),
                Err(e) => eprintln!("[PSKmap] POTA error: {}", e),
            },
            "sota" => match sota::fetch_sota_spots(&app_data_dir).await {
                Ok(spots) => all_spots.extend(spots),
                Err(e) => eprintln!("[PSKmap] SOTA error: {}", e),
            },
            _ => eprintln!("[PSKmap] Unknown source: {}", source),
        }
    }

    println!(
        "[PSKmap] Station finder: {} total spots from {:?}",
        all_spots.len(),
        sources
    );
    Ok(all_spots)
}

#[tauri::command]
pub fn check_sota_update(app: tauri::AppHandle) -> bool {
    match app.path().app_data_dir() {
        Ok(dir) => sota::needs_summit_update(&dir),
        Err(_) => true,
    }
}

#[tauri::command]
pub async fn download_sota_summits(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    sota::download_summits_csv(&dir).await
}
