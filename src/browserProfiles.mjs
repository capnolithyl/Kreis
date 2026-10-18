// Browser identity and profile identity are deliberately separate. Profile IDs
// are stable across renames and are used as the WebSocket routing key.
export const BROWSER_OPTIONS = [
  { id: 'vivaldi', name: 'Vivaldi' },
  { id: 'chrome', name: 'Google Chrome' },
  { id: 'edge', name: 'Microsoft Edge' },
  { id: 'brave', name: 'Brave' },
  { id: 'opera', name: 'Opera' }
];
const browserIds = new Set(BROWSER_OPTIONS.map(browser => browser.id));

export function defaultBrowserProfiles() {
  return [
    { id: 'Work', name: 'Work', browserId: 'vivaldi' },
    { id: 'Personal', name: 'Personal', browserId: 'vivaldi' }
  ];
}

export function validProfileId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,72}$/.test(id);
}

export function normalizeBrowserSettings(settings) {
  const hasProfiles = Array.isArray(settings.browserProfiles);
  const configured = hasProfiles ? settings.browserProfiles : defaultBrowserProfiles();
  const profiles = [];
  const seen = new Set();
  for (const p of configured) {
    if (!p || !validProfileId(p.id) || !browserIds.has(p.browserId) ||
      typeof p.name !== 'string' || !p.name.trim() || p.name.length > 48 || seen.has(p.id)) continue;
    profiles.push({ id: p.id, name: p.name.trim(), browserId: p.browserId });
    seen.add(p.id);
  }
  // An explicit empty list is intentional; never recreate deleted profiles.
  const entries = settings.entries.map(entry => {
    if (entry.type !== 'browser' && entry.type !== 'vivaldi-stack') return entry;
    const profileId = entry.profileId !== undefined ? entry.profileId : entry.profile || 'Work';
    const profile = profiles.find(p => p.id === profileId);
    return {
      ...entry,
      profileId,
      browserId: profile?.browserId || entry.browserId || 'vivaldi'
    };
  });
  return { ...settings, browserProfiles: profiles, entries };
}

export function profileForEntry(entry, profiles) {
  const id = entry.profileId !== undefined ? entry.profileId : entry.profile;
  return profiles.find(profile => profile.id === id) || null;
}

export function assignProfile(entry, profile) {
  return {
    ...entry,
    profileId: profile?.id || '',
    browserId: profile?.browserId || entry.browserId || 'vivaldi',
    // Keep the original legacy field for old stored shortcuts, but all routing
    // now uses the stable profileId above.
    profile: profile?.id === 'Personal' ? 'Personal' : 'Work'
  };
}

export function addBrowserProfile(profiles, name, browserId, id) {
  const clean = String(name || '').trim();
  if (!clean || clean.length > 48) return { error: 'Enter a profile name (up to 48 characters).' };
  if (!browserIds.has(browserId)) return { error: 'Choose a supported Chromium browser.' };
  if (!validProfileId(id) || profiles.some(profile => profile.id === id)) return { error: 'Invalid or repeated profile ID.' };
  if (profiles.some(profile => profile.browserId === browserId && profile.name.toLowerCase() === clean.toLowerCase())) {
    return { error: 'A profile with that name already exists for this browser.' };
  }
  return { profiles: [...profiles, { id, name: clean, browserId }] };
}

export function renameBrowserProfile(profiles, profileId, name) {
  const existing = profiles.find(p => p.id === profileId);
  if (!existing) return { error: 'Profile no longer exists.' };
  const clean = String(name || '').trim();
  if (!clean || clean.length > 48) return { error: 'Enter a profile name (up to 48 characters).' };
  if (profiles.some(p => p.id !== profileId && p.browserId === existing.browserId &&
    p.name.toLowerCase() === clean.toLowerCase())) return { error: 'This browser already has a profile with that name.' };
  return { profiles: profiles.map(p => p.id === profileId ? { ...p, name: clean } : p) };
}

export function deleteBrowserProfile(settings, id, replacementId = '') {
  if (!settings.browserProfiles.some(p => p.id === id)) return { error: 'Profile no longer exists.' };
  if (replacementId && replacementId === id) return { error: 'Choose a different destination profile.' };
  const replacement = replacementId ? settings.browserProfiles.find(p => p.id === replacementId) : null;
  if (replacementId && !replacement) return { error: 'Replacement profile no longer exists.' };
  return {
    settings: {
      ...settings,
      browserProfiles: settings.browserProfiles.filter(p => p.id !== id),
      entries: settings.entries.map(entry =>
        (entry.type === 'browser' || entry.type === 'vivaldi-stack') && (entry.profileId !== undefined ? entry.profileId : entry.profile) === id
          ? assignProfile(entry, replacement)
          : entry)
    }
  };
}
