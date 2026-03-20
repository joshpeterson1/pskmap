use tauri::Manager;

mod commands;
mod db;
mod external_spots;
mod models;
mod mqtt;
mod pota;
mod pskreporter;
mod sota;
mod station_finder;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize SQLite database
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let db_conn = db::init_db(app_data_dir);

            // Prune spots older than 14 days
            {
                let conn = db_conn.lock().unwrap();
                db::prune_old_spots(&conn, 14);
            }

            // Register DB state
            app.manage(db::DbState(db_conn.clone()));

            // Initialize MQTT with DB connection
            let manager = mqtt::MqttManager::new(app.handle().clone(), db_conn);
            app.manage(manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::subscribe_callsign,
            commands::unsubscribe,
            station_finder::fetch_external_spots,
            station_finder::check_sota_update,
            station_finder::download_sota_summits,
            pota::get_pota_programs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
