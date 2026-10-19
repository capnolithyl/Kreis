const profile = document.querySelector('#profile');
const pairingToken = document.querySelector('#pairingToken');
const status = document.querySelector('#status');
const save = document.querySelector('#save');
const refreshProfiles = document.querySelector('#refresh-profiles');
const diagnostics = document.querySelector('#diagnostics');
const browserNames = { vivaldi:'Vivaldi',chrome:'Chrome',edge:'Edge',brave:'Brave',opera:'Opera' };
let availableProfiles = [];

function formatLookup(result) {
  if (!result) return 'No Kreis tab lookup yet. Select a website in the wheel, then reopen this popup.';
  const lines = [];
  if (result.outcome) lines.push('Result: ' + result.outcome);
  if (result.targetHost) lines.push('Requested: ' + result.targetHost + (result.targetPath || '') + ' (' + result.mode + ')');
  lines.push('Tabs visible: ' + result.totalTabs);
  lines.push('Readable URLs: ' + result.readableTabs);
  if (result.targetHost && result.targetHost !== 'invalid URL') {
    lines.push('Matching domain: ' + result.hostMatches);
    lines.push('Matching URL: ' + result.urlMatches);
  }
  if (result.nearbyPaths?.length) lines.push('Same-domain paths: ' + result.nearbyPaths.join(', '));
  if (result.visibleHosts?.length) lines.push('Visible domains: ' + result.visibleHosts.join(', '));
  if (result.when) lines.push('Checked: ' + new Date(result.when).toLocaleTimeString());
  return lines.join('\n');
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'get-status' }).catch(() => null);
  status.textContent = response?.status || 'Disconnected';
  document.querySelector('#native-mod-status').textContent =
    response?.nativeModConnected ? 'Connected' : 'Not connected';
  const { lastLookup } = await chrome.storage.local.get('lastLookup');
  diagnostics.textContent = formatLookup(lastLookup);
}

/** Authenticated temporary connection: only reads configured profile names.
 * No browser tabs, history, or URLs are sent during discovery.
 */
function discoverProfiles(token) {
  return new Promise((resolve, reject) => {
    if (!token) { reject(new Error('Paste the pairing key first')); return; }
    const ws = new WebSocket('ws://127.0.0.1:43991');
    let finished = false;
    const done = (error, profiles) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      ws.close();
      error ? reject(error) : resolve(profiles);
    };
    const deadline = setTimeout(() => done(new Error('Kreis did not respond. Is it running?')), 2800);
    ws.onopen = () => ws.send(JSON.stringify({ type:'hello', token, request:'profiles' }));
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'profile-list' && Array.isArray(message.profiles)) done(null, message.profiles);
      } catch { done(new Error('Invalid response from Kreis')); }
    };
    ws.onerror = () => done(new Error('Could not connect to Kreis on this PC'));
    ws.onclose = () => done(new Error('Pairing key was rejected, or Kreis disconnected'));
  });
}

async function loadProfiles() {
  const current = profile.value;
  refreshProfiles.disabled = true;
  status.textContent = 'Loading profiles from Kreis...';
  try {
    availableProfiles = await discoverProfiles(pairingToken.value.trim());
    profile.replaceChildren();
    for (const item of availableProfiles) {
      const option = new Option(`${browserNames[item.browserId] || item.browserId} · ${item.name}`, item.id);
      profile.appendChild(option);
    }
    if (availableProfiles.some(p => p.id === current)) profile.value = current;
    else {
      const stored = await chrome.storage.local.get(['profileId', 'profile']);
      const previous = stored.profileId || stored.profile;
      if (availableProfiles.some(p => p.id === previous)) profile.value = previous;
    }
    status.textContent = availableProfiles.length ? 'Choose the browser and profile running this extension' :
      'No profiles configured. Add one in Kreis Settings → Connection.';
  } catch(error) { status.textContent = String(error.message || error); }
  finally { refreshProfiles.disabled = false; }
}

(async () => {
  const stored = await chrome.storage.local.get(['profile', 'profileId', 'pairingToken', 'browserId']);
  pairingToken.value = stored.pairingToken || '';
  if (stored.profileId || stored.profile) {
    const option = new Option(`Saved profile: ${stored.profileId || stored.profile}`, stored.profileId || stored.profile);
    profile.add(option);
    profile.value = option.value;
  }
  await refresh();
  if (pairingToken.value) await loadProfiles();
})();

refreshProfiles.addEventListener('click', () => void loadProfiles());
save.addEventListener('click', async () => {
  if (!pairingToken.value.trim()) { status.textContent = 'Enter a pairing key'; return; }
  let selected = availableProfiles.find(p => p.id === profile.value);
  if (!selected) {
    // Avoid accidentally assigning an outdated or deleted profile.
    await loadProfiles();
    selected = availableProfiles.find(p => p.id === profile.value);
  }
  if (!selected) { status.textContent = 'Choose a profile from the connected Kreis app'; return; }
  await chrome.storage.local.set({
    profileId: selected.id, browserId: selected.browserId, pairingToken: pairingToken.value.trim(),
    profile: selected.id === 'Personal' ? 'Personal' : 'Work'
  });
  await chrome.runtime.sendMessage({ type: 'connect' });
  status.textContent = 'Connecting...';
  setTimeout(() => { void refresh(); }, 1200);
});

document.querySelector('#scan').addEventListener('click', async () => {
  const { lastLookup } = await chrome.storage.local.get('lastLookup');
  const result = await chrome.runtime.sendMessage({
    type: 'scan-tabs',
    url: lastLookup?.targetHost && lastLookup.targetHost !== 'invalid URL'
      ? 'https://' + lastLookup.targetHost + (lastLookup.targetPath || '/') : '',
    match: lastLookup?.mode || 'prefix'
  }).catch(error => ({ ok: false, error: String(error) }));
  diagnostics.textContent = result?.ok ? formatLookup(result.report) : 'Scan failed: ' + (result?.error || 'Extension unavailable');
});

function formatStackInspection(r) {
  if (!r) return 'No Vivaldi Tab Stack diagnostic yet.';
  return [
    'Tabs visible: ' + r.total,
    'tabs.query records: ' + r.query + ', with metadata: ' + r.queryData,
    'windows.getAll records: ' + r.windows + ', with metadata: ' + r.windowData,
    'tabs.get records: ' + r.fetched + ', with metadata: ' + r.fetchedData,
    'Individual tab fetch errors: ' + r.getFailures,
    'Tabs belonging to native stacks: ' + r.groupTabs,
    'Native group IDs: ' + r.groupIds,
    'Tabs with named-stack field: ' + r.namedTabs,
    'Distinct stack names: ' + r.groupTitles,
    'Vivaldi-specific tab fields: ' + (r.supportedTabFields?.join(', ') || '(none visible)'),
    'Native metadata readable: ' + (r.metadataAccessible ? 'YES' : 'NO'),
    r.total > r.fetched && !r.metadataAccessible ?
      'Per-tab fallback examined at most ' + r.getSampleLimit + ' tab(s).' : ''
  ].filter(Boolean).join('\n');
}

document.querySelector('#scan-stacks').addEventListener('click', async () => {
  const button = document.querySelector('#scan-stacks');
  const display = document.querySelector('#stack-diagnostics');
  button.disabled=true;
  display.textContent='Checking Vivaldi stack metadata...';
  try {
    const response = await chrome.runtime.sendMessage({type:'scan-vivaldi-stacks'});
    display.textContent=response?.ok
      ? formatStackInspection(response.report) + '\n\nVivaldi UI mod: ' +
        (response.nativeModConnected ? 'Connected' : 'Not connected') +
        (response.ui ? '\nUI tabs: ' + response.ui.tabCount +
          '\nUI native metadata records: ' + response.ui.metadataCount +
          '\nUI named stacks: ' + response.ui.namedStackCount +
          '\nPrivate API: ' + (response.ui.privateAPI ? 'Available' : 'Unavailable') : '')
      : 'Diagnostic failed: '+(response?.error||'No response from companion.');
  } catch(error) {
    display.textContent='Diagnostic failed: '+String(error);
  } finally {
    button.disabled=false;
  }
});
