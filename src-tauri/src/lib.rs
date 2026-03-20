use tauri::Manager;

mod commands;
mod models;
mod mqtt;
mod pskreporter;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let manager = mqtt::MqttManager::new(app.handle().clone());
            app.manage(manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::subscribe_callsign,
            commands::unsubscribe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
