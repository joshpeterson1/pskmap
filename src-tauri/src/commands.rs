use crate::models::SpotQuery;
use crate::mqtt::MqttManager;
use crate::pskreporter;
use tauri::Emitter;

#[tauri::command]
pub async fn subscribe_callsign(
    callsign: String,
    mqtt: tauri::State<'_, MqttManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let callsign = callsign.to_uppercase();
    println!("[PSKmap] subscribe_callsign: {}", callsign);

    // Subscribe to MQTT stream
    mqtt.subscribe(&callsign).await?;

    // Backfill 24h of history via HTTP
    let query = SpotQuery {
        callsign: callsign.clone(),
        band: None,
        mode: None,
        time_range_seconds: 86400,
    };
    match pskreporter::fetch_spots_http(&query).await {
        Ok(spots) => {
            println!("[PSKmap] Backfill: {} spots", spots.len());
            let _ = app.emit("spots-backfill", &spots);
        }
        Err(e) => {
            println!("[PSKmap] Backfill error: {}", e);
            let _ = app.emit("backfill-error", &e);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn unsubscribe(mqtt: tauri::State<'_, MqttManager>) -> Result<(), String> {
    mqtt.unsubscribe().await
}
