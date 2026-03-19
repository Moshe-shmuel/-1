use tauri::Manager;

#[tauri::command]
fn get_resource_path(app: tauri::AppHandle) -> Result<String, String> {
    app.path().resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::init()) 
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_resource_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}