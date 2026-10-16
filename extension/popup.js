const profile = document.querySelector('#profile');
const pairingToken = document.querySelector('#pairingToken');
const status = document.querySelector('#status');
const save = document.querySelector('#save');
const diagnostics = document.querySelector('#diagnostics');

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
  const { lastLookup } = await chrome.storage.local.get('lastLookup');
  diagnostics.textContent = formatLookup(lastLookup);
}

(async () => {
  const stored = await chrome.storage.local.get(['profile', 'pairingToken']);
  profile.value = stored.profile || 'Work';
  pairingToken.value = stored.pairingToken || '';
  await refresh();
})();

save.addEventListener('click', async () => {
  if (!pairingToken.value.trim()) { status.textContent = 'Enter a pairing key'; return; }
  await chrome.storage.local.set({ profile: profile.value, pairingToken: pairingToken.value.trim() });
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
