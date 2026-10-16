/* Kreis companion. One unpacked copy is installed in EACH Vivaldi profile. */
const ENDPOINT = 'ws://127.0.0.1:43991';
let socket = null;
let reconnectTimer = null;
let heartbeat = null;
let isConnecting = false;
let status = 'Disconnected';

function setStatus(value) {
  status = value;
  void chrome.storage.local.set({ connectionStatus: value });
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  return url;
}

function matchesTab(current, target, match) {
  try {
    const a = normalizeUrl(current);
    const b = normalizeUrl(target);
    if (a.origin !== b.origin) return false;
    if (match === 'site') return !a.pathname.startsWith('/wp-admin') && !a.pathname.startsWith('/wp-login.php');
    if (match === 'exact') {
      return a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '') && a.search === b.search;
    }
    // A site root may match other pages on its host. Use 'exact' for the frontend.
    return a.pathname.startsWith(b.pathname);
  } catch { return false; }
}

async function activateTab(url, match) {
  const candidates = await chrome.tabs.query({});
  const matchTab = candidates.find(tab => tab.id !== undefined && tab.windowId !== undefined &&
    matchesTab(tab.url || tab.pendingUrl || '', url, match));
  if (matchTab) {
    await chrome.tabs.update(matchTab.id, { active: true });
    const browserWindow = await chrome.windows.get(matchTab.windowId);
    await chrome.windows.update(matchTab.windowId, browserWindow.state === 'minimized'
      ? { focused: true, state: 'normal' } : { focused: true });
  } else {
    // This extension executes inside the correct Vivaldi profile.
    await chrome.tabs.create({ url, active: true });
  }
}

function clearConnection() {
  if (heartbeat) clearInterval(heartbeat);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  heartbeat = null;
  reconnectTimer = null;
  if (socket) {
    const old = socket;
    socket = null;
    old.onclose = null;
    old.close();
  }
  isConnecting = false;
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => { void connect(); }, 4000);
}

async function connect() {
  if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) return;
  const { pairingToken, profile } = await chrome.storage.local.get(['pairingToken', 'profile']);
  if (!pairingToken || !['Work', 'Personal'].includes(profile)) {
    setStatus('Enter a pairing key and profile');
    return;
  }
  clearConnection();
  isConnecting = true;
  setStatus('Connecting...');
  try {
    const ws = new WebSocket(ENDPOINT);
    socket = ws;
    ws.onopen = () => {
      isConnecting = false;
      ws.send(JSON.stringify({ type: 'hello', token: pairingToken, profile }));
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 20000);
    };
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ready') setStatus('Connected');
        if (message.type === 'activate' && typeof message.url === 'string') {
          void activateTab(message.url, ['exact', 'site'].includes(message.match) ? message.match : 'prefix')
            .catch(error => setStatus(`Activation failed: ${String(error)}`));
        }
      } catch (error) { console.error('Invalid Kreis bridge message', error); }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      isConnecting = false;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      setStatus('Disconnected');
      scheduleReconnect();
    };
    ws.onerror = () => { /* onclose schedules reconnection */ };
  } catch (error) {
    isConnecting = false;
    setStatus(`Connection error: ${String(error)}`);
    scheduleReconnect();
  }
}

chrome.runtime.onInstalled.addListener(() => { void connect(); });
chrome.runtime.onStartup.addListener(() => { void connect(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('pairingToken' in changes || 'profile' in changes)) {
    clearConnection();
    void connect();
  }
});
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'get-status') { respond({ status }); return false; }
  if (message?.type === 'connect') { clearConnection(); void connect(); respond({ ok: true }); return false; }
  return false;
});
void connect();
