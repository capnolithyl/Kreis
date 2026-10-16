//! Loopback-only, paired WebSocket bridge to the Vivaldi extension.
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::{Arc, Mutex}};
use tauri::Manager;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio_tungstenite::{accept_hdr_async, tungstenite::{handshake::server::ErrorResponse, http::StatusCode, Message}};

pub const BRIDGE_PORT: u16 = 43991;

pub struct Bridge {
    pub token: String,
    pub clients: Mutex<HashMap<String, UnboundedSender<String>>>,
}

impl Bridge {
    pub fn new(token: String) -> Self { Self { token, clients: Mutex::new(HashMap::new()) } }

    pub fn send(&self, profile: &str, url: &str, mode: &str) -> bool {
        let message = json!({ "type": "activate", "url": url, "match": mode }).to_string();
        let lock = self.clients.lock().expect("bridge client lock");
        lock.get(profile).is_some_and(|client| client.send(message).is_ok())
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

pub async fn serve(bridge: Arc<Bridge>) -> Result<(), String> {
    use tokio::net::TcpListener;
    let listener = TcpListener::bind(("127.0.0.1", BRIDGE_PORT)).await
        .map_err(|e| format!("Could not bind Kreis browser bridge: {e}"))?;
    loop {
        let (stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let state = bridge.clone();
        tauri::async_runtime::spawn(async move { if let Err(error) = serve_client(stream, state).await { eprintln!("Kreis browser bridge: {error}"); } });
    }
}

async fn serve_client(stream: tokio::net::TcpStream, bridge: Arc<Bridge>) -> Result<(), String> {
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
                        if profile.is_none() {
                            if value.get("type").and_then(Value::as_str) != Some("hello") ||
                                value.get("token").and_then(Value::as_str) != Some(bridge.token.as_str()) {
                                break;
                            }
                            let name = match value.get("profile").and_then(Value::as_str) {
                                Some("Personal") => "Personal",
                                Some("Work") => "Work",
                                _ => break,
                            };
                            let label = name.to_string();
                            bridge.clients.lock().map_err(|e| e.to_string())?.insert(label.clone(), tx.clone());
                            profile = Some(label);
                            let _ = tx.send(json!({"type":"ready"}).to_string());
                        } else if value.get("type").and_then(Value::as_str) == Some("ping") {
                            let _ = tx.send(json!({"type":"pong"}).to_string());
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
