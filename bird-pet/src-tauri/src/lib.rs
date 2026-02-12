// Desktop app uses main.rs as entry point.
// This lib.rs is retained for Tauri's build system and potential mobile support.
// All commands, plugins, and state management are configured in main.rs.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
