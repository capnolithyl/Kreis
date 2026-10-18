//! Loopback-only, paired WebSocket bridge to the Vivaldi extension.
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, sync::{Arc, Mutex}, time::Duration};
use tauri::Manager;
use tokio::sync::{mpsc::{unbounded_channel, UnboundedSender}, oneshot};
use tokio::time::timeout;
use tokio_tungstenite::{accept_hdr_async, tungstenite::{handshake::server::ErrorResponse, http::StatusCode, Message}};

pub const BRIDGE_PORT: u16 = 43991;
const BROWSERS: &[&str] = &["vivaldi", "chrome", "edge", "brave", "opera"];

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfile {
    pub id: String,
    pub name: String,
    pub browser_id: String,
}

fn legacy_profiles() -> Vec<BrowserProfile> {
    ["Work", "Personal"].iter().map(|name| BrowserProfile {
        id: name.to_string(), name: name.to_string(), browser_id: "vivaldi".into()
    }).collect()
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 72 && id.bytes().all(|b|
        b.is_ascii_alphanumeric() || b == b'-' || b == b'_'
    )
}


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTab {
    pub id: i32,
    pub window_id: i32,
    pub title: String,
}

struct PendingLookup {
    profile: String,
    sender: oneshot::Sender<Result<Vec<BrowserTab>, String>>,
}

pub struct Bridge {
    pub token: String,
    pub clients: Mutex<HashMap<String, UnboundedSender<String>>>,
    configured: Mutex<Vec<BrowserProfile>>,
    pending: Mutex<HashMap<String, PendingLookup>>,
}

impl Bridge {
    pub fn new(token: String) -> Self {
        Self {
            token,
            clients: Mutex::new(HashMap::new()),
            configured: Mutex::new(legacy_profiles()),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub fn profiles(&self) -> Vec<BrowserProfile> {
        self.configured.lock().expect("profile lock").clone()
    }

    pub fn profile(&self, id: &str) -> Option<BrowserProfile> {
        self.configured.lock().ok()?.iter().find(|p| p.id == id).cloned()
    }

    pub fn set_profiles(&self, profiles: Vec<BrowserProfile>) -> Result<(), String> {
        if profiles.len() > 64 { return Err("Up to 64 browser profiles are supported.".into()); }
        let mut ids = HashSet::new();
        let mut names = HashSet::new();
        for p in &profiles {
            let name = p.name.trim();
            if !valid_id(&p.id) || name.is_empty() || name.len() > 48 ||
                !BROWSERS.contains(&p.browser_id.as_str()) ||
                !ids.insert(p.id.clone()) ||
                !names.insert((p.browser_id.clone(), name.to_lowercase())) {
                return Err("Invalid or repeated browser/profile configuration.".into());
            }
        }
        let mut configured = self.configured.lock().map_err(|e| e.to_string())?;
        *configured = profiles;
        let ids = &ids;
        self.clients.lock().map_err(|e| e.to_string())?.retain(|id, _| ids.contains(id));
        Ok(())
    }

    pub fn command(&self, profile: &str, message: Value) -> bool {
        if self.profile(profile).is_none() { return false; }
        self.clients.lock().expect("bridge client lock")
            .get(profile)
            .is_some_and(|sender| sender.send(message.to_string()).is_ok())
    }

    /// A browser profile searches its own windows. Correlated replies avoid cross-profile
    /// responses, and the timeout also supports users who have not reloaded the extension.
    pub async fn matching_tabs(&self, profile: &str, url: &str, mode: &str, recreate: bool, start_url: &str) -> Result<Option<Vec<BrowserTab>>, String> {
        let (sender, receiver) = oneshot::channel();
        let request_id = uuid::Uuid::new_v4().to_string();
        self.pending.lock().map_err(|e| e.to_string())?.insert(request_id.clone(), PendingLookup {
            profile: profile.to_owned(), sender,
        });

        let sent = self.command(profile, json!({
            "type": "lookup-tabs", "requestId": request_id, "url": url, "match": mode,
            "recreateStack": recreate, "startUrl": start_url
        }));
        if !sent {
            self.pending.lock().map_err(|e| e.to_string())?.remove(&request_id);
            return Ok(None);
        }

        // Native stack recreation creates two tabs and may need more than 1.8 seconds.
        let wait = if mode == "stack" { Duration::from_secs(12) } else { Duration::from_millis(1800) };
        let result = timeout(wait, receiver).await;
        self.pending.lock().map_err(|e| e.to_string())?.remove(&request_id);
        match result {
            Ok(Ok(Ok(tabs))) => Ok(Some(tabs)),
            Ok(Ok(Err(reason))) => Err(reason),
            _ => Ok(None),
        }
    }

    fn handle_lookup_result(&self, profile: &str, value: &Value) {
        let Some(id) = value.get("requestId").and_then(Value::as_str) else { return; };
        let mut pending = self.pending.lock().expect("lookup lock");
        if !pending.get(id).is_some_and(|request| request.profile == profile) { return; }
        if let Some(request) = pending.remove(id) {
            if let Some(reason) = value.get("error").and_then(Value::as_str) {
                let _ = request.sender.send(Err(reason.chars().take(300).collect()));
                return;
            }
            // Never trust browser metadata blindly, even over an authenticated local socket.
            let choices = value.get("tabs")
                .and_then(|tabs| serde_json::from_value::<Vec<BrowserTab>>(tabs.clone()).ok())
                .unwrap_or_default();
            let safe = choices.into_iter()
                .filter(|tab| tab.id >= 0 && tab.window_id >= 0)
                .take(300)
                .map(|mut tab| {
                    tab.title = tab.title.chars().take(160).collect();
                    tab
                })
                .collect();
            let _ = request.sender.send(Ok(safe));
        }
    }


    pub fn send(&self, profile: &str, url: &str, mode: &str) -> bool {
        self.command(profile, json!({ "type": "activate", "url": url, "match": mode }))
    }

    pub fn connected(&self) -> Vec<String> {
        self.clients.lock().expect("bridge client lock")
            .iter().filter(|(_, sender)| !sender.is_closed()).map(|(profile, _)| profile.clone()).collect()
    }
}

pub fn load_or_create_token(app: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("bridge-token.txt");
    if let Ok(value) = std::fs::read_to_string(&path) {
        if value.trim().len() >= 32 { return Ok(value.trim().to_owned()); }
    }
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    std::fs::write(&path, &token).map_err(|e| e.to_string())?;
    Ok(token)
}

pub async fn serve(bridge: Arc<Bridge>, app: tauri::AppHandle) -> Result<(), String> {
    use tokio::net::TcpListener;
    let listener = TcpListener::bind(("127.0.0.1", BRIDGE_PORT)).await
        .map_err(|e| format!("Could not bind Kreis browser bridge: {e}"))?;
    loop {
        let (stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let state = bridge.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move { if let Err(error) = serve_client(stream, state, app).await { eprintln!("Kreis browser bridge: {error}"); } });
    }
}

async fn serve_client(stream: tokio::net::TcpStream, bridge: Arc<Bridge>, app: tauri::AppHandle) -> Result<(), String> {
    // Reject connections from websites. Only unpacked Chromium extension origins are accepted.
    let ws = accept_hdr_async(stream, |request: &tokio_tungstenite::tungstenite::handshake::server::Request, response| {
        let trusted = request.headers().get("origin")
            .and_then(|header| header.to_str().ok())
            .is_some_and(|origin| origin.starts_with("chrome-extension://") && origin.len() > 25);
        if trusted { Ok(response) } else {
            let mut denied = ErrorResponse::new(Some("Chrome extension origin required".into()));
            *denied.status_mut() = StatusCode::FORBIDDEN;
            Err(denied)
        }
    }).await.map_err(|e| e.to_string())?;
    let (mut outgoing, mut incoming) = ws.split();
    let (tx, mut rx) = unbounded_channel::<String>();
    let mut profile: Option<String> = None;
    loop {
        tokio::select! {
            input = incoming.next() => {
                match input {
                    Some(Ok(Message::Text(text))) => {
                        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                        // Deleting a browser profile immediately revokes its
                        // existing socket, not just future tab-routing commands.
                        if profile.as_ref().is_some_and(|id| bridge.profile(id).is_none()) {
                            break;
                        }
                        if profile.is_none() {
                            if value.get("type").and_then(Value::as_str) != Some("hello") ||
                                value.get("token").and_then(Value::as_str) != Some(bridge.token.as_str()) {
                                break;
                            }
                            // Setup popup can securely discover available profiles using
                            // only the pairing key. This session never controls tabs.
                            if value.get("request").and_then(Value::as_str) == Some("profiles") {
                                let result = json!({"type":"profile-list","profiles":bridge.profiles()});
                                let _ = outgoing.send(Message::Text(result.to_string().into())).await;
                                break;
                            }
                            // Older v0.3 Vivaldi extensions send "profile": "Work"
                            // or "Personal". Keep both identifiers routable.
                            let legacy = value.get("profile").and_then(Value::as_str);
                            let id = match value.get("profileId").and_then(Value::as_str).or(legacy) {
                                Some(id) if valid_id(id) => id,
                                _ => break,
                            };
                            let Some(registered) = bridge.profile(id) else { break; };
                            if let Some(browser) = value.get("browserId").and_then(Value::as_str) {
                                if browser != registered.browser_id { break; }
                            } else if registered.browser_id != "vivaldi" ||
                                !matches!(legacy, Some("Work" | "Personal")) {
                                break;
                            }
                            let mut clients = bridge.clients.lock().map_err(|e| e.to_string())?;
                            if clients.get(id).is_some_and(|existing| !existing.is_closed()) {
                                let _ = tx.send(json!({"type":"error","reason":"This profile is already connected in another browser window or extension."}).to_string());
                                // Allow the error message to flush before disconnect.
                                drop(clients);
                                break;
                            }
                            clients.insert(id.to_owned(), tx.clone());
                            drop(clients);
                            profile = Some(id.to_owned());
                            let _ = tx.send(json!({"type":"ready"}).to_string());
                        } else if value.get("type").and_then(Value::as_str) == Some("ping") {
                            let _ = tx.send(json!({"type":"pong"}).to_string());
                        } else if value.get("type").and_then(Value::as_str) == Some("tabs-result") {
                            if let Some(name) = profile.as_ref() {
                                bridge.handle_lookup_result(name, &value);
                            }
                        } else if value.get("type").and_then(Value::as_str) == Some("add-context") {
                            // Only a paired browser profile can ask to populate the picker.
                            // Never accept code, executable paths or arbitrary URL schemes.
                            #[cfg(windows)]
                            if let (Some(name), Some(url)) = (
                                profile.as_ref(), value.get("url").and_then(Value::as_str)
                            ) {
                                if url.len() <= 4096 && url::Url::parse(url).is_ok_and(|parsed|
                                    matches!(parsed.scheme(), "http" | "https")
                                ) {
                                    let title = value.get("title").and_then(Value::as_str)
                                        .unwrap_or("Browser link").trim()
                                        .chars().take(30).collect::<String>();
                                    crate::present_context_entry(&app, crate::context_menu::ContextEntry {
                                        kind: "browser".into(), target: url.into(),
                                        title: if title.is_empty() { "Browser link".into() } else { title },
                                        profile: Some(name.to_string()),
                                    });
                                    let _ = tx.send(json!({"type":"context-add-received"}).to_string());
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    _ => {}
                }
            }
            output = rx.recv() => {
                match output {
                    Some(msg) => { if outgoing.send(Message::Text(msg.into())).await.is_err() { break; } }
                    None => break
                }
            }
        }
    }
    if let Some(label) = profile {
        let mut clients = bridge.clients.lock().map_err(|e| e.to_string())?;
        if clients.get(&label).is_some_and(|current| current.same_channel(&tx)) {
            clients.remove(&label);
        }
    }
    Ok(())
}
