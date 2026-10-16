mod bridge;
#[cfg(windows)]
mod native_windows;

use std::sync::Arc;
use tauri::{Emitter, Manager, PhysicalPosition};
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}};
use bridge::Bridge;

#[tauri::command]
fn pairing_key(bridge: tauri::State<'_, Arc<Bridge>>) -> String {
    bridge.token.clone()
}

#[tauri::command]
fn connected_profiles(bridge: tauri::State<'_, Arc<Bridge>>) -> Vec<String> {
    bridge.connected()
}

#[tauri::command]
fn focus_application(executable: String) -> Result<(), String> {
    #[cfg(windows)]
    { native_windows::focus_or_launch(&executable) }
    #[cfg(not(windows))]
    { let _ = executable; Err("Kreis currently supports Windows only".into()) }
}

#[cfg(windows)]
#[tauri::command]
fn list_application_windows(executable: String) -> Result<Vec<native_windows::AppWindow>, String> {
    native_windows::list_application_windows(&executable)
}

#[cfg(windows)]
#[tauri::command]
fn focus_application_window(executable: String, window_id: String) -> Result<(), String> {
    native_windows::focus_application_window(&executable, &window_id)
}

fn validate_browser(url: &str, profile: &str, mode: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "Invalid website URL")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS links are allowed".into());
    }
    if !["Work", "Personal"].contains(&profile) { return Err("Unknown browser profile".into()); }
    if !["exact", "prefix", "site"].contains(&mode) { return Err("Unknown matching mode".into()); }
    Ok(())
}

#[tauri::command]
fn activate_browser(bridge: tauri::State<'_, Arc<Bridge>>, url: String, profile: String, match_mode: String) -> Result<bool, String> {
    validate_browser(&url, &profile, &match_mode)?;
    if bridge.send(&profile, &url, &match_mode) { return Ok(true); }
    // If the extension is not connected, the fallback is the DEFAULT browser/profile.
    webbrowser::open(&url).map_err(|e| format!("Could not open {url}: {e}"))?;
    Ok(false)
}

/// None means no compatible extension response; the frontend keeps legacy behavior.
#[tauri::command]
async fn query_browser_tabs(
    bridge: tauri::State<'_, Arc<Bridge>>,
    url: String,
    profile: String,
    match_mode: String
) -> Result<Option<Vec<bridge::BrowserTab>>, String> {
    validate_browser(&url, &profile, &match_mode)?;
    Ok(bridge.matching_tabs(&profile, &url, &match_mode).await)
}

#[tauri::command]
fn focus_browser_tab(bridge: tauri::State<'_, Arc<Bridge>>, profile: String, tab_id: i32) -> Result<(), String> {
    if !["Work", "Personal"].contains(&profile.as_str()) { return Err("Unknown browser profile".into()); }
    if tab_id < 0 { return Err("Invalid tab ID".into()); }
    if bridge.command(&profile, serde_json::json!({"type":"focus-tab","tabId": tab_id})) {
        Ok(())
    } else {
        Err(format!("The {profile} extension disconnected. Please retry."))
    }
}

#[tauri::command]
fn open_browser_tab(bridge: tauri::State<'_, Arc<Bridge>>, url: String, profile: String) -> Result<(), String> {
    validate_browser(&url, &profile, "prefix")?;
    if bridge.command(&profile, serde_json::json!({"type":"open-new","url":url})) {
        return Ok(());
    }
    webbrowser::open(&url).map_err(|e| format!("Could not open {url}: {e}"))
}

fn show_near_cursor(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    let (x, y) = native_windows::cursor_position()?;
    #[cfg(not(windows))]
    let (x, y) = (0, 0);
    let popup = window.outer_size().map_err(|e| e.to_string())?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let target = monitors.iter().find(|monitor| {
        let p = monitor.position(); let s = monitor.size();
        x >= p.x && x < p.x + s.width as i32 && y >= p.y && y < p.y + s.height as i32
    }).or_else(|| monitors.first());
    let (left, top) = if let Some(monitor) = target {
        let p = monitor.position(); let s = monitor.size();
        let max_x = (p.x + s.width as i32 - popup.width as i32).max(p.x);
        let max_y = (p.y + s.height as i32 - popup.height as i32).max(p.y);
        ((x - popup.width as i32 / 2).clamp(p.x, max_x),
         (y - popup.height as i32 / 2).clamp(p.y, max_y))
    } else { (x - popup.width as i32 / 2, y - popup.height as i32 / 2) };
    window.set_position(PhysicalPosition::new(left, top)).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    // Reset the nested wheel whenever the tray or hotkey opens Kreis anew.
    let _ = window.emit("kreis-wheel-opened", ());
    Ok(())
}

#[tauri::command]
fn toggle_at_cursor(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_visible().map_err(|e| e.to_string())? {
        window.hide().map_err(|e| e.to_string())
    } else { show_near_cursor(&window) }
}

#[tauri::command]
fn hide_wheel(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![pairing_key, connected_profiles, focus_application, list_application_windows, focus_application_window, activate_browser, query_browser_tabs, focus_browser_tab, open_browser_tab, toggle_at_cursor, hide_wheel])
        .setup(|app| {
            let token = bridge::load_or_create_token(app.handle()).map_err(std::io::Error::other)?;
            let state = Arc::new(Bridge::new(token));
            app.manage(state.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(error) = bridge::serve(state).await { eprintln!("{error}"); }
            });

            let open = MenuItem::with_id(app, "open", "Open Kreis", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &settings, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("Kreis app icon").clone())
                .tooltip("Kreis · Ctrl+Space")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") { let _ = show_near_cursor(&window); }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            // Tray Settings opens the same cursor-centered category wheel.
                            // Restore the wheel size first in case a settings page was shown.
                            let _ = window.set_size(tauri::LogicalSize::new(600.0, 600.0));
                            if show_near_cursor(&window).is_ok() {
                                let _ = app.emit("show-settings", ());
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") { let _ = show_near_cursor(&window); }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(false) = event { let _ = window.hide(); }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .run(tauri::generate_context!())
        .expect("Unable to run Kreis");
}
