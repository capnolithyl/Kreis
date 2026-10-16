/* Kreis browser companion. Runs independently in each Vivaldi profile. */
import { findMatchingTab, findMatchingTabs, lookupDiagnostics } from './tab-finder.js';

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

async function allBrowserTabs() {
  // Vivaldi has windows, workspaces, and tab stacks. Ask both APIs and de-duplicate
  // by tab ID rather than assuming the active window contains the desired tab.
  const tabs = await chrome.tabs.query({});
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const seen = new Map();
    for (const tab of [...tabs, ...windows.flatMap(browserWindow => browserWindow.tabs || [])]) {
      if (Number.isInteger(tab.id)) {
        const original = seen.get(tab.id);
        // Prefer the record exposing a readable URL.
        if (!original || (!original.url && tab.url)) seen.set(tab.id, tab);
      }
    }
    return [...seen.values()];
  } catch (error) {
    console.warn('Kreis: windows.getAll failed; using tabs.query results', error);
    return tabs;
  }
}

async function recordLookup(report) {
  await chrome.storage.local.set({ lastLookup: { ...report, when: new Date().toISOString() } });
  console.info('Kreis tab lookup:', report);
}

async function activateTab(url, match) {
  const tabs = await allBrowserTabs();
  const details = lookupDiagnostics(tabs, url, match);
  const matched = findMatchingTab(tabs, url, match);

  try {
    if (matched) {
      await chrome.tabs.update(matched.id, { active: true });
      const browserWindow = await chrome.windows.get(matched.windowId);
      await chrome.windows.update(matched.windowId,
        browserWindow.state === 'minimized'
          ? { state: 'normal', focused: true }
          : { focused: true });
      await recordLookup({ ...details, outcome: 'Focused existing tab', tabId: matched.id });
      return;
    }
    if (tabs.length && details.readableTabs === 0) {
      // Missing tab URLs means a permissions/API issue, not an empty browser.
      // Do not create duplicates while blind.
      throw new Error('The browser returned tabs without readable URLs. Check extension permissions.');
    }
    // Genuine no-match: open a new tab in this specific Vivaldi profile.
    const newTab = await chrome.tabs.create({ url, active: true });
    await recordLookup({ ...details, outcome: 'Opened new tab (no matching URL)', tabId: newTab.id });
  } catch (error) {
    await recordLookup({ ...details, outcome: 'ERROR: ' + String(error) });
    throw error;
  }
}

async function lookupMatchingTabs(url, match) {
  const tabs = await allBrowserTabs();
  const diagnostics = lookupDiagnostics(tabs, url, match);
  if (tabs.length && diagnostics.readableTabs === 0) {
    throw new Error('Browser tabs have no readable URLs; check extension permissions.');
  }
  const matches = findMatchingTabs(tabs, url, match);
  await recordLookup({ ...diagnostics, outcome: matches.length + ' matching tab(s)' });
  // Metadata stays on the local paired connection; never send browser history or tab URLs.
  return matches.slice(0, 300).map(tab => ({
    id: tab.id,
    windowId: tab.windowId,
    title: (tab.title || 'Untitled tab').slice(0, 160)
  }));
}

async function focusTabById(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Invalid tab ID.');
  // Resolve its window at selection time because tabs can move while the wheel is open.
  const tab = await chrome.tabs.get(tabId);
  if (!Number.isInteger(tab.windowId)) throw new Error('Tab is no longer open.');
  await chrome.tabs.update(tabId, { active: true });
  const browserWindow = await chrome.windows.get(tab.windowId);
  await chrome.windows.update(tab.windowId, browserWindow.state === 'minimized'
    ? { state: 'normal', focused: true } : { focused: true });
  await recordLookup({ outcome: 'Focused selected tab', totalTabs: 1,
    readableTabs: 1, tabId, when: new Date().toISOString() });
}

async function openNewTab(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only web URLs are supported.');
  await chrome.tabs.create({ url, active: true });
  await recordLookup({ outcome: 'Opened new tab by request', totalTabs: 0, readableTabs: 0 });
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
            .catch(error => setStatus('Activation failed: ' + String(error)));
        }
        if (message.type === 'lookup-tabs' && typeof message.url === 'string' &&
            typeof message.requestId === 'string') {
          void lookupMatchingTabs(message.url, message.match || 'prefix')
            .then(tabs => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'tabs-result', requestId: message.requestId, tabs }));
              }
            })
            .catch(error => {
              setStatus('Tab lookup failed: ' + String(error));
              // No result means the desktop will use its legacy fallback.
              console.error('Kreis tab lookup failed', error);
            });
        }
        if (message.type === 'focus-tab') {
          void focusTabById(message.tabId)
            .catch(error => setStatus('Activation failed: ' + String(error)));
        }
        if (message.type === 'open-new' && typeof message.url === 'string') {
          void openNewTab(message.url)
            .catch(error => setStatus('Open tab failed: ' + String(error)));
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
    setStatus('Connection error: ' + String(error));
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
  if (message?.type === 'scan-tabs') {
    void allBrowserTabs()
      .then(tabs => respond({ ok: true, report: lookupDiagnostics(tabs, message.url || '', message.match || 'prefix') }))
      .catch(error => respond({ ok: false, error: String(error) }));
    return true;
  }
  return false;
});
void connect();
