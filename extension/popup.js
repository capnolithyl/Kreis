const profile = document.querySelector('#profile');
const pairingToken = document.querySelector('#pairingToken');
const status = document.querySelector('#status');
const save = document.querySelector('#save');

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'get-status' }).catch(() => null);
  status.textContent = response?.status || 'Disconnected';
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
