//! Windows-specific cursor lookup, native application window discovery, and focusing.
use std::{ffi::OsStr, os::windows::ffi::OsStrExt};
use windows_sys::Win32::{
    Foundation::{CloseHandle, BOOL, HWND, LPARAM, POINT},
    System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    UI::Shell::ShellExecuteW,
    UI::WindowsAndMessaging::{
        EnumWindows, GetCursorPos, GetWindow, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow,
        ShowWindow, GW_OWNER, SW_RESTORE,
    },
};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppWindow {
    /// Hexadecimal HWND. Stored as a string to avoid JavaScript 64-bit integer precision loss.
    pub id: String,
    pub title: String,
}

pub fn cursor_position() -> Result<(i32, i32), String> {
    let mut pt = POINT { x: 0, y: 0 };
    // SAFETY: pt is writable and valid for the duration of the call.
    if unsafe { GetCursorPos(&mut pt) } == 0 {
        Err("Windows could not determine the cursor position".into())
    } else {
        Ok((pt.x, pt.y))
    }
}

fn expected_name(executable: &str) -> Result<String, String> {
    let requested = executable.trim();
    if requested.is_empty() { return Err("Executable is empty".into()); }
    let name = std::path::Path::new(requested)
        .file_name().and_then(OsStr::to_str).unwrap_or(requested);
    Ok(if name.to_ascii_lowercase().ends_with(".exe") {
        name.to_owned()
    } else {
        format!("{name}.exe")
    })
}

struct Search {
    executable: String,
    windows: Vec<AppWindow>,
}

unsafe extern "system" fn collect_windows(hwnd: HWND, data: LPARAM) -> BOOL {
    // SAFETY: EnumWindows holds the pointer to Search until enumeration completes.
    let search = unsafe { &mut *(data as *mut Search) };
    if unsafe { IsWindowVisible(hwnd) } == 0
        || unsafe { GetWindow(hwnd, GW_OWNER) } != std::ptr::null_mut() {
        return 1;
    }

    // Ignore untitled helper windows. VS Code exposes one titled top-level HWND per workspace.
    let title_len = unsafe { GetWindowTextLengthW(hwnd) };
    if title_len <= 0 { return 1; }

    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 { return 1; }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() { return 1; }
    let mut path = [0u16; 2048];
    let mut length = path.len() as u32;
    let success = unsafe { QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut length) } != 0;
    unsafe { CloseHandle(handle) };
    if !success { return 1; }

    let process_path = String::from_utf16_lossy(&path[..length as usize]);
    let process_name = std::path::Path::new(&process_path)
        .file_name().and_then(OsStr::to_str).unwrap_or("");
    if !process_name.eq_ignore_ascii_case(&search.executable) { return 1; }

    let mut title = vec![0u16; title_len as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32) };
    if copied <= 0 { return 1; }
    let title = String::from_utf16_lossy(&title[..copied as usize]);
    search.windows.push(AppWindow {
        id: format!("{:X}", hwnd as usize),
        title: title.chars().take(160).collect(),
    });
    1
}

/// Only returns visible, unowned, titled windows belonging to the requested executable.
pub fn list_application_windows(executable: &str) -> Result<Vec<AppWindow>, String> {
    let mut search = Search { executable: expected_name(executable)?, windows: Vec::new() };
    // SAFETY: EnumWindows invokes the callback synchronously; search remains alive throughout.
    unsafe { EnumWindows(Some(collect_windows), &mut search as *mut Search as isize) };
    Ok(search.windows)
}

fn focus_handle(id: &str) -> Result<(), String> {
    let raw = usize::from_str_radix(id, 16).map_err(|_| "Invalid window identifier")?;
    let hwnd = raw as HWND;
    // SAFETY: the HWND is revalidated by fresh enumeration before calling this function.
    unsafe {
        if IsIconic(hwnd) != 0 { ShowWindow(hwnd, SW_RESTORE); }
        SetForegroundWindow(hwnd);
    }
    Ok(())
}

/// Re-enumeration checks the HWND *still* belongs to the expected executable.
pub fn focus_application_window(executable: &str, id: &str) -> Result<(), String> {
    let windows = list_application_windows(executable)?;
    let found = windows.iter().find(|window| window.id.eq_ignore_ascii_case(id));
    match found {
        Some(window) => focus_handle(&window.id),
        None => Err("That application window is no longer open. Reopen Kreis to refresh the list.".into()),
    }
}

pub fn focus_or_launch(executable: &str) -> Result<(), String> {
    // Start Menu / desktop shortcuts are .lnk files, not executable process names.
    // Let the Windows Shell resolve the link safely without invoking cmd.exe.
    if executable.to_ascii_lowercase().ends_with(".lnk") {
        let path: Vec<u16> = OsStr::new(executable).encode_wide().chain(std::iter::once(0)).collect();
        let verb: Vec<u16> = OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();
        let result = unsafe { ShellExecuteW(
            std::ptr::null_mut(), verb.as_ptr(), path.as_ptr(),
            std::ptr::null(), std::ptr::null(), 1
        ) };
        return if (result as isize) > 32 { Ok(()) }
            else { Err(format!("Windows could not open shortcut {executable}")) };
    }
    if let Some(window) = list_application_windows(executable)?.first() {
        return focus_handle(&window.id);
    }
    let name = expected_name(executable)?;
    std::process::Command::new(executable.trim())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!(
            "Could not find a running {name} window or start {executable}: {e}. Set the full .exe path in Kreis settings."
        ))
}
