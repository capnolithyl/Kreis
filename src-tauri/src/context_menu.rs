//! Opt-in, per-user Explorer context-menu verbs and validated CLI arguments.
//! Only our own HKCU registry keys are touched; no UAC or global hooks.

use std::{path::Path, process::{Command, Stdio}};
use serde::Serialize;

const ROOT: &str = r"HKCU\Software\Classes";
const CONTEXT_CLASSES: &[(&str, &str)] = &[
    (r"Directory\shell\KreisAdd", "folder"),
    (r"SystemFileAssociations\.exe\shell\KreisAdd", "app"),
    (r"SystemFileAssociations\.lnk\shell\KreisAdd", "app"),
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntry {
    pub kind: String,
    pub target: String,
    pub title: String,
    pub profile: Option<String>,
}

fn registry_key(subkey: &str) -> String {
    format!(r"{ROOT}\{subkey}")
}

fn reg(args: &[&str]) -> Result<(), String> {
    let output = Command::new("reg.exe").args(args)
        .stdin(Stdio::null()).output()
        .map_err(|error| format!("Could not run Windows Registry utility: {error}"))?;
    if output.status.success() { Ok(()) } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// The verb is installed only after explicit opt-in. A traditional shell verb
/// appears under "Show more options" on Windows 11, not the modern first-level menu.
pub fn set_enabled(enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable = exe.to_string_lossy();
    if executable.contains('"') {
        return Err("The Kreis executable path contains an invalid quotation mark.".into());
    }
    for (subkey, kind) in CONTEXT_CLASSES {
        let key = registry_key(subkey);
        if !enabled {
            // Ignore missing keys, but do not touch unrelated registry entries.
            let _ = reg(&["delete", &key, "/f"]);
            continue;
        }
        reg(&["add", &key, "/ve", "/t", "REG_SZ", "/d", "Add to Kreis", "/f"])?;
        reg(&["add", &key, "/v", "Icon", "/t", "REG_SZ", "/d", &executable, "/f"])?;
        let command_key = format!(r"{key}\command");
        let command = format!(r#""{executable}" --kreis-add-{kind} "%1""#);
        reg(&["add", &command_key, "/ve", "/t", "REG_SZ", "/d", &command, "/f"])?;
    }
    Ok(())
}

pub fn is_enabled() -> bool {
    CONTEXT_CLASSES.iter().all(|(subkey, _)| {
        Command::new("reg.exe").args(["query", &registry_key(subkey)])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .status().is_ok_and(|status| status.success())
    })
}

/// Never accept arbitrary command-line commands or unverified filesystem paths.
pub fn from_args(args: &[String]) -> Option<ContextEntry> {
    let pair = args.windows(2).find(|pair|
        pair[0] == "--kreis-add-folder" || pair[0] == "--kreis-add-app"
    )?;
    let kind = if pair[0] == "--kreis-add-folder" { "folder" } else { "app" };
    let path = Path::new(&pair[1]);
    if !path.is_absolute() { return None; }
    if kind == "folder" {
        if !path.is_dir() { return None; }
    } else if !path.is_file() || !path.extension().is_some_and(|extension|
        extension.eq_ignore_ascii_case("exe") || extension.eq_ignore_ascii_case("lnk")
    ) { return None; }
    let title = if kind == "folder" {
        path.file_name()
    } else {
        path.file_stem()
    }.map(|name| name.to_string_lossy().chars().take(30).collect::<String>())
        .unwrap_or_else(|| "Shortcut".to_string());
    Some(ContextEntry {
        kind: kind.into(), target: path.to_string_lossy().to_string(), title,
        profile: None,
    })
}
