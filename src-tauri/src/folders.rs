//! Windows Explorer folder activation. Tabs are not exposed by a public Windows API.
//! Existing *active* folder tabs are located through Shell.Application, while
//! new tabs use Explorer's Ctrl+T and address bar, with a safe new-window fallback.
use std::{
    ffi::OsStr,
    os::windows::{ffi::OsStrExt, process::CommandExt},
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};
use windows_sys::Win32::{
    Foundation::{BOOL, HWND, LPARAM},
    UI::{
        Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, KEYBDINPUT, INPUT_KEYBOARD,
            KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VK_CONTROL, VK_RETURN,
        },
        WindowsAndMessaging::{
            EnumWindows, GetClassNameW, GetForegroundWindow, GetWindow,
            GetWindowTextLengthW, GetWindowTextW, IsIconic, IsWindowVisible,
            SetForegroundWindow, ShowWindow, GW_OWNER, SW_RESTORE,
        },
    },
};

const VK_T: u16 = 0x54;
const VK_L: u16 = 0x4C;

/// This is the Windows 11 22H2 build that shipped tabbed File Explorer.
const FIRST_TABBED_EXPLORER_BUILD: u32 = 22621;

#[repr(C)]
struct OsVersionInfo {
    size: u32,
    major: u32,
    minor: u32,
    build: u32,
    platform: u32,
    service_pack: [u16; 128],
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(info: *mut OsVersionInfo) -> i32;
}

fn supports_explorer_tabs() -> bool {
    let mut info = OsVersionInfo {
        size: std::mem::size_of::<OsVersionInfo>() as u32,
        major: 0, minor: 0, build: 0, platform: 0, service_pack: [0; 128],
    };
    unsafe { RtlGetVersion(&mut info) == 0 && info.build >= FIRST_TABBED_EXPLORER_BUILD }
}

fn expand_environment_variables(path: &str) -> String {
    let mut result = String::with_capacity(path.len());
    let mut remaining = path;
    while let Some(start) = remaining.find('%') {
        result.push_str(&remaining[..start]);
        let after = &remaining[start + 1..];
        if let Some(end) = after.find('%') {
            let var = &after[..end];
            match std::env::var(var) {
                Ok(value) => result.push_str(&value),
                Err(_) => { result.push('%'); result.push_str(var); result.push('%'); }
            }
            remaining = &after[end + 1..];
        } else {
            result.push_str(&remaining[start..]);
            return result;
        }
    }
    result.push_str(remaining);
    result
}

pub fn resolve_folder(path: &str) -> Result<PathBuf, String> {
    let supplied = path.trim().trim_matches('"');
    if supplied.is_empty() { return Err("Enter a folder path.".into()); }
    let path = if supplied == "~" || supplied.starts_with("~\\") || supplied.starts_with("~/") {
        let home = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE is unavailable")?;
        format!("{home}{}", &supplied[1..])
    } else {
        expand_environment_variables(supplied)
    };
    let candidate = Path::new(&path);
    if !candidate.is_absolute() {
        return Err("Use an absolute folder path, such as C:\\Users\\You\\Downloads or %USERPROFILE%\\Downloads.".into());
    }
    let canonical = std::fs::canonicalize(candidate)
        .map_err(|_| format!("The folder does not exist or cannot be accessed: {path}"))?;
    if !canonical.is_dir() { return Err(format!("Not a folder: {path}")); }
    // Canonicalize uses verbatim Windows paths; Explorer and Shell COM want ordinary paths.
    let name = canonical.to_string_lossy();
    let display = if let Some(rest) = name.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else if let Some(rest) = name.strip_prefix(r"\\?\") {
        rest.to_owned()
    } else {
        name.into_owned()
    };
    Ok(PathBuf::from(display))
}

unsafe extern "system" fn explorer_window_callback(hwnd: HWND, ptr: LPARAM) -> BOOL {
    let results = unsafe { &mut *(ptr as *mut Vec<HWND>) };
    if unsafe { IsWindowVisible(hwnd) } == 0
        || unsafe { GetWindow(hwnd, GW_OWNER) } != std::ptr::null_mut() {
        return 1;
    }
    let mut class = [0u16; 128];
    let size = unsafe { GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32) };
    if size > 0 && String::from_utf16_lossy(&class[..size as usize]) == "CabinetWClass" {
        results.push(hwnd);
    }
    1
}

fn explorer_windows() -> Vec<HWND> {
    let mut windows = Vec::new();
    unsafe { EnumWindows(Some(explorer_window_callback), &mut windows as *mut Vec<HWND> as isize) };
    windows
}

fn current_title(hwnd: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 { return String::new(); }
    let mut chars = vec![0u16; len as usize + 1];
    let read = unsafe { GetWindowTextW(hwnd, chars.as_mut_ptr(), chars.len() as i32) };
    if read <= 0 { return String::new(); }
    String::from_utf16_lossy(&chars[..read as usize])
}

/// Enumerating Explorer tabs via Shell.Application is best-effort.
/// A COM HWND can refer to the *parent window*, so only accept a result if
/// its current window caption also corresponds to that folder's active tab.
fn find_active_folder_window(folder: &Path, windows: &[HWND]) -> Option<HWND> {
    let filename = folder.file_name().unwrap_or_else(|| OsStr::new(""))
        .to_string_lossy().to_string();
    if filename.is_empty() { return None; }

    let script = r#"
try {
  $expected = $env:KREIS_FOLDER_QUERY.TrimEnd('\')
  $shell = New-Object -ComObject Shell.Application
  foreach ($item in $shell.Windows()) {
    try {
      $folder = [string]$item.Document.Folder.Self.Path
      if ($folder.TrimEnd('\') -ieq $expected) {
        [Console]::WriteLine([string]$item.HWND)
      }
    } catch {}
  }
} catch {}
"#;
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("KREIS_FOLDER_QUERY", folder.as_os_str())
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW: no flashing PowerShell console
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let raw = line.trim().parse::<u64>().ok()?;
        if let Some(&window) = windows.iter().find(|&&w| w as usize as u64 == raw) {
            let title = current_title(window);
            if title.eq_ignore_ascii_case(&filename)
                || title.to_ascii_lowercase().starts_with(&format!("{} - ", filename.to_ascii_lowercase())) {
                return Some(window);
            }
        }
    }
    None
}

fn focus(hwnd: HWND) -> bool {
    unsafe {
        if IsIconic(hwnd) != 0 { ShowWindow(hwnd, SW_RESTORE); }
        SetForegroundWindow(hwnd);
        for _ in 0..8 {
            if GetForegroundWindow() == hwnd { return true; }
            thread::sleep(Duration::from_millis(35));
        }
    }
    false
}

fn keyboard(vk: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0,
            },
        },
    }
}

fn send_keys(inputs: &[INPUT]) -> bool {
    unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) }
        == inputs.len() as u32
}

fn shortcut(letter: u16) -> bool {
    send_keys(&[
        keyboard(VK_CONTROL, 0),
        keyboard(letter, 0),
        keyboard(letter, KEYEVENTF_KEYUP),
        keyboard(VK_CONTROL, KEYEVENTF_KEYUP),
    ])
}

/// Type through Unicode key events without changing the user's clipboard.
fn type_folder_path(path: &Path) -> bool {
    let mut input = Vec::new();
    for character in path.as_os_str().encode_wide() {
        let key = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: 0, wScan: character, dwFlags: KEYEVENTF_UNICODE,
                    time: 0, dwExtraInfo: 0,
                }
            },
        };
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: 0, wScan: character,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0, dwExtraInfo: 0,
                },
            },
        };
        input.extend([key, up]);
    }
    // Bound allocations and input synthesis, even for very long paths.
    if input.len() > 8192 { return false; }
    send_keys(&input)
}

fn open_new_explorer_window(folder: &Path) -> Result<String, String> {
    Command::new("explorer.exe").arg(folder)
        .spawn().map(|_| "new-window".into())
        .map_err(|error| format!("Unable to open the folder in File Explorer: {error}"))
}

pub fn open_folder(folder: &Path) -> Result<String, String> {
    let windows = explorer_windows();
    if windows.is_empty() { return open_new_explorer_window(folder); }

    if let Some(window) = find_active_folder_window(folder, &windows) {
        if focus(window) { return Ok("existing-window".into()); }
    }

    // Older Windows versions cannot open Explorer tabs with Ctrl+T.
    if !supports_explorer_tabs() { return open_new_explorer_window(folder); }

    // Select the topmost Explorer HWND; after focus, recheck it before every
    // keyboard phase so we never type a folder path into the wrong application.
    let window = windows[0];
    if !focus(window) { return open_new_explorer_window(folder); }
    if !shortcut(VK_T) { return open_new_explorer_window(folder); }

    thread::sleep(Duration::from_millis(240));
    if unsafe { GetForegroundWindow() } != window { return open_new_explorer_window(folder); }
    if !shortcut(VK_L) { return open_new_explorer_window(folder); }
    thread::sleep(Duration::from_millis(120));
    if unsafe { GetForegroundWindow() } != window { return open_new_explorer_window(folder); }
    if !type_folder_path(folder) { return open_new_explorer_window(folder); }
    thread::sleep(Duration::from_millis(50));
    if unsafe { GetForegroundWindow() } != window { return open_new_explorer_window(folder); }
    if !send_keys(&[keyboard(VK_RETURN, 0), keyboard(VK_RETURN, KEYEVENTF_KEYUP)]) {
        return open_new_explorer_window(folder);
    }
    Ok("new-tab".into())
}
