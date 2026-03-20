use crate::db::{self, DbState};
use crate::models::SpotQuery;
use crate::mqtt::MqttManager;
use crate::pskreporter;
use tauri::Emitter;

#[tauri::command]
pub async fn subscribe_callsign(
    callsign: String,
    mqtt: tauri::State<'_, MqttManager>,
    db_state: tauri::State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let callsign = callsign.to_uppercase();
    println!("[PSKmap] subscribe_callsign: {}", callsign);

    // Subscribe to MQTT stream
    mqtt.subscribe(&callsign).await?;

    // Check DB for last sequence number (incremental fetch)
    let seq_key = format!("last_seq_no:{}", callsign);
    let last_seq_no = {
        let conn = db_state.0.lock().unwrap();
        db::get_metadata(&conn, &seq_key).and_then(|v| v.parse::<u64>().ok())
    };

    if let Some(seq) = last_seq_no {
        println!("[PSKmap] Found cached seq for {}: {}", callsign, seq);
    }

    // Fetch from PSKreporter (incremental or full)
    let query = SpotQuery {
        callsign: callsign.clone(),
        band: None,
        mode: None,
        time_range_seconds: 86400,
    };

    match pskreporter::fetch_spots_http(&query, last_seq_no).await {
        Ok(result) => {
            // Store new spots in DB
            {
                let conn = db_state.0.lock().unwrap();
                db::insert_spots(&conn, &result.spots);

                // Update last sequence number
                if let Some(seq) = result.last_sequence_number {
                    db::set_metadata(&conn, &seq_key, &seq.to_string());
                }
            }

            println!(
                "[PSKmap] Backfill: {} new spots from HTTP",
                result.spots.len()
            );

            // Emit ALL cached spots for this callsign from DB
            let all_spots = {
                let conn = db_state.0.lock().unwrap();
                db::get_spots_for_callsign(&conn, &callsign)
            };

            println!("[PSKmap] Emitting {} total spots from DB", all_spots.len());
            let _ = app.emit("spots-backfill", &all_spots);
        }
        Err(e) => {
            println!("[PSKmap] Backfill error: {}", e);

            // On error, still emit cached spots if we have any
            let cached_spots = {
                let conn = db_state.0.lock().unwrap();
                db::get_spots_for_callsign(&conn, &callsign)
            };

            if !cached_spots.is_empty() {
                println!(
                    "[PSKmap] Serving {} cached spots despite backfill error",
                    cached_spots.len()
                );
                let _ = app.emit("spots-backfill", &cached_spots);
            } else {
                let _ = app.emit("backfill-error", &e);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn unsubscribe(mqtt: tauri::State<'_, MqttManager>) -> Result<(), String> {
    mqtt.unsubscribe().await
}
