mod commands;
mod models;
mod pskreporter;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![commands::fetch_spots])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
