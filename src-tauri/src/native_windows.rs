//! Windows-specific cursor lookup and application focusing.
use std::ffi::OsStr;
use windows_sys::Win32::{
    Foundation::{CloseHandle, BOOL, HWND, LPARAM, POINT},
    System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    UI::WindowsAndMessaging::{
        EnumWindows, GetCursorPos, GetWindow, GetWindowThreadProcessId, IsIconic,
        IsWindowVisible, SetForegroundWindow, ShowWindow, GW_OWNER, SW_RESTORE,
    },
};

pub fn cursor_position() -> Result<(i32, i32), String> {
    let mut pt = POINT { x: 0, y: 0 };
    // SAFETY: pt is writable and valid for the duration of the call.
    if unsafe { GetCursorPos(&mut pt) } == 0 {
        Err("Windows could not determine the cursor position".into())
    } else {
        Ok((pt.x, pt.y))
    }
}

struct Search<'a> {
    requested: &'a str,
    found: Option<HWND>,
}

unsafe extern "system" fn find_window(hwnd: HWND, data: LPARAM) -> BOOL {
    // SAFETY: EnumWindows passes the address of Search until enumeration ends.
    let search = unsafe { &mut *(data as *mut Search<'_>) };
    if unsafe { IsWindowVisible(hwnd) } == 0 || unsafe { GetWindow(hwnd, GW_OWNER) } != std::ptr::null_mut() {
        return 1;
    }
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 { return 1; }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() { return 1; }
    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) } != 0;
    unsafe { CloseHandle(handle) };
    if !ok { return 1; }
    let process = String::from_utf16_lossy(&buffer[..size as usize]);
    let name = std::path::Path::new(&process)
        .file_name().and_then(OsStr::to_str).unwrap_or("");
    if name.eq_ignore_ascii_case(search.requested) {
        search.found = Some(hwnd);
        return 0;
    }
    1
}

pub fn focus_or_launch(executable: &str) -> Result<(), String> {
    let executable = executable.trim();
    if executable.is_empty() { return Err("Executable is empty".into()); }
    let process_name = std::path::Path::new(executable)
        .file_name().and_then(OsStr::to_str).unwrap_or(executable);
    let expected = if process_name.to_ascii_lowercase().ends_with(".exe") {
        process_name.to_string()
    } else { format!("{process_name}.exe") };
    let mut search = Search { requested: &expected, found: None };
    // SAFETY: the callback is synchronous and Search outlives enumeration.
    unsafe { EnumWindows(Some(find_window), &mut search as *mut Search<'_> as isize) };
    if let Some(hwnd) = search.found {
        // SAFETY: the handle came from a live enumerated desktop window.
        unsafe {
            if IsIconic(hwnd) != 0 { ShowWindow(hwnd, SW_RESTORE); }
            SetForegroundWindow(hwnd);
        }
        return Ok(());
    }
    // A full path is more reliable when the executable is not on PATH.
    std::process::Command::new(executable)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not find a running {expected} window or start {executable}: {e}. Set the full .exe path in Kreis settings."))
}
