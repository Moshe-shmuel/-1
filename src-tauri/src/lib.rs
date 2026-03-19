use tauri::Manager;

#[tauri::command]
fn get_resource_path(app: tauri::AppHandle) -> Result<String, String> {
    // ב-Tauri 2, הגישה לנתיבים מתבצעת דרך app.path() שמגיע מהליבה
    app.path().resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // תיקון קריטי: ב-Tauri 2 תוסף ה-SQL מופעל באמצעות Builder ולא init
        .plugin(tauri_plugin_sql::Builder::default().build()) 
        // תוסף ה-FS אכן משתמש ב-init
        .plugin(tauri_plugin_fs::init())
        // רישום הפקודות (Commands)
        .invoke_handler(tauri::generate_handler![get_resource_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}