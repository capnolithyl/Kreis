mod bridge;
#[cfg(windows)]
mod native_windows;
#[cfg(windows)]
mod hub_drag;
#[cfg(windows)]
mod folders;
#[cfg(windows)]
mod context_menu;

use std::sync::Arc;
use tauri::{Emitter, Manager, PhysicalPosition, LogicalSize};
#[cfg(windows)]
use std::sync::Mutex;
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}};
use bridge::Bridge;

#[cfg(windows)]
struct StartupContext(Mutex<Option<context_menu::ContextEntry>>);

#[cfg(windows)]
#[tauri::command]
fn take_startup_context(state: tauri::State<'_, StartupContext>) -> Option<context_menu::ContextEntry> {
    state.0.lock().ok()?.take()
}

#[cfg(windows)]
#[tauri::command]
fn set_windows_context_menu(enabled: bool) -> Result<(), String> {
    context_menu::set_enabled(enabled)
}

#[cfg(windows)]
#[tauri::command]
fn windows_context_menu_enabled() -> bool {
    context_menu::is_enabled()
}

/// Bring the picker to the cursor rather than silently editing stored entries.
#[cfg(windows)]
pub(crate) fn present_context_entry(app: &tauri::AppHandle, entry: context_menu::ContextEntry) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(LogicalSize::new(600.0, 600.0));
        if show_near_cursor(&window).is_ok() {
            let _ = app.emit("kreis-context-add", entry);
        }
    }
}

#[tauri::command]
fn pairing_key(bridge: tauri::State<'_, Arc<Bridge>>) -> String {
    bridge.token.clone()
}

#[tauri::command]
fn connected_profiles(bridge: tauri::State<'_, Arc<Bridge>>) -> Vec<String> {
    bridge.connected()
}

#[tauri::command]
fn set_browser_profiles(
    bridge: tauri::State<'_, Arc<Bridge>>,
    profiles: Vec<bridge::BrowserProfile>
) -> Result<(), String> {
    bridge.set_profiles(profiles)
}

/// The folder is validated before hiding the Kreis wheel, then automation
/// runs on a blocking worker so window focus and Ctrl+T delays don't freeze React.
#[tauri::command]
async fn open_folder(window: tauri::WebviewWindow, path: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let folder = folders::resolve_folder(&path)?;
        window.hide().map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || folders::open_folder(&folder))
            .await.map_err(|e| format!("Explorer operation failed: {e}"))?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, path);
        Err("Folder shortcuts are currently supported on Windows only.".into())
    }
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

fn validate_browser(bridge: &Bridge, url: &str, profile: &str, mode: &str) -> Result<(), String> {
    if mode == "stack" {
        if url.trim().is_empty() || url.chars().count() > 60 { return Err("Invalid native Tab Stack name".into()); }
        if bridge.profile(profile).is_none_or(|p| p.browser_id != "vivaldi") {
            return Err("Native Tab Stacks require a configured Vivaldi browser profile.".into());
        }
        return Ok(());
    }
    let parsed = url::Url::parse(url).map_err(|_| "Invalid website URL")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS links are allowed".into());
    }
    if bridge.profile(profile).is_none() { return Err("Unknown or unassigned browser profile. Choose a connected profile in Kreis Settings.".into()); }
    if !["exact", "prefix", "site"].contains(&mode) { return Err("Unknown matching mode".into()); }
    Ok(())
}

#[tauri::command]
fn activate_browser(bridge: tauri::State<'_, Arc<Bridge>>, url: String, profile: String, match_mode: String) -> Result<bool, String> {
    validate_browser(&bridge, &url, &profile, &match_mode)?;
    if bridge.send(&profile, &url, &match_mode) { return Ok(true); }
    // Preserve pre-0.12 Vivaldi behavior without silently opening new
    // browser-specific shortcuts in the wrong browser/profile.
    if profile == "Work" || profile == "Personal" {
        if profile == "Work" || profile == "Personal" {
        webbrowser::open(&url).map_err(|e| format!("Could not open {url}: {e}"))
    } else {
        Err(format!("Browser profile {profile} is disconnected. Pair its extension."))
    }?;
        Ok(false)
    } else {
        Err(format!("Browser profile {profile} is disconnected. Pair its browser extension in Kreis Settings."))
    }
}

/// None means no compatible extension response; the frontend keeps legacy behavior.
#[tauri::command]
async fn query_browser_tabs(
    bridge: tauri::State<'_, Arc<Bridge>>,
    url: String,
    profile: String,
    match_mode: String,
    recreate_stack: Option<bool>,
    start_url: Option<String>
) -> Result<Option<Vec<bridge::BrowserTab>>, String> {
    validate_browser(&bridge, &url, &profile, &match_mode)?;
    let start_url = start_url.unwrap_or_default();
    if match_mode == "stack" && !start_url.trim().is_empty() {
        let parsed = url::Url::parse(&start_url).map_err(|_| "Invalid stack starting URL")?;
        if !matches!(parsed.scheme(), "http" | "https") { return Err("Starting URL must use HTTP(S).".into()); }
    }
    Ok(bridge.matching_tabs(&profile, &url, &match_mode, recreate_stack.unwrap_or(false), &start_url).await)
}

#[tauri::command]
fn focus_browser_tab(bridge: tauri::State<'_, Arc<Bridge>>, profile: String, tab_id: i32) -> Result<(), String> {
    if bridge.profile(&profile).is_none() { return Err("Unknown browser profile".into()); }
    if tab_id < 0 { return Err("Invalid tab ID".into()); }
    if bridge.command(&profile, serde_json::json!({"type":"focus-tab","tabId": tab_id})) {
        Ok(())
    } else {
        Err(format!("The {profile} extension disconnected. Please retry."))
    }
}

#[tauri::command]
fn open_browser_tab(bridge: tauri::State<'_, Arc<Bridge>>, url: String, profile: String) -> Result<(), String> {
    validate_browser(&bridge, &url, &profile, "prefix")?;
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
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        if let Some(request) = context_menu::from_args(&args) {
            present_context_entry(app, request);
        }
    }));
    builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![pairing_key, connected_profiles, set_browser_profiles, open_folder, focus_application, list_application_windows, focus_application_window, activate_browser, query_browser_tabs, focus_browser_tab, open_browser_tab, toggle_at_cursor, hide_wheel, hub_drag::start_hub_drag, take_startup_context, set_windows_context_menu, windows_context_menu_enabled])
        .setup(|app| {
            #[cfg(windows)]
            app.manage(StartupContext(Mutex::new(context_menu::from_args(&std::env::args().collect::<Vec<_>>()))));
            #[cfg(windows)]
            app.manage(Arc::new(hub_drag::HubDragState::default()));
            let token = bridge::load_or_create_token(app.handle()).map_err(std::io::Error::other)?;
            let state = Arc::new(Bridge::new(token));
            app.manage(state.clone());
            let bridge_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = bridge::serve(state, bridge_app).await { eprintln!("{error}"); }
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
            if let tauri::WindowEvent::Focused(false) = event {
                // A pointer-driven window move can generate a transient blur;
                // hiding at that moment interrupts the drag and loses the window.
                #[cfg(windows)]
                if window.state::<Arc<hub_drag::HubDragState>>().should_ignore_blur() {
                    return;
                }
                let _ = window.hide();
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .run(tauri::generate_context!())
        .expect("Unable to run Kreis");
}
