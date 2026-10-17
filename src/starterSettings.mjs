/**
 * Starter layout for new installations only. No account, private workspace,
 * paid app, or third-party installed program is required. Browser shortcuts
 * use the default browser when Kreis's optional Vivaldi bridge isn't paired.
 *
 * Return new objects each time so restores cannot share mutable references.
 */
export function createStarterEntries() {
  return [
    { id: 'starter-google', title: 'Google', type: 'browser', target: 'https://www.google.com/', profile: 'Personal', match: 'prefix', icon: 'search', color: '#438ba8' },
    { id: 'starter-youtube', title: 'YouTube', type: 'browser', target: 'https://www.youtube.com/', profile: 'Personal', match: 'prefix', icon: 'monitor', color: '#c75b83' },
    { id: 'starter-wikipedia', title: 'Wikipedia', type: 'browser', target: 'https://en.wikipedia.org/', profile: 'Personal', match: 'prefix', icon: 'book', color: '#697ce5' },
    { id: 'starter-downloads', title: 'Downloads', type: 'folder', target: 'shell:Downloads', profile: 'Personal', match: 'prefix', icon: 'folder', color: '#c1a062' },
    { id: 'starter-tools', title: 'Tools', type: 'group', target: '', profile: 'Personal', match: 'prefix', icon: 'layers', color: '#6a8ec2' },
    { id: 'starter-github', title: 'GitHub', type: 'browser', target: 'https://github.com/', profile: 'Personal', match: 'prefix', icon: 'github', color: '#6385d7', groupId: 'starter-tools' },
    { id: 'starter-notepad', title: 'Notepad', type: 'app', target: 'notepad.exe', profile: 'Personal', match: 'exact', icon: 'document', color: '#47a66a', groupId: 'starter-tools' }
  ];
}

/**
 * A saved `entries: []` is deliberate, not a fresh installation. Preserve
 * all existing shortcuts, nested groups, and settings without migration.
 */
export function selectInitialSettings(saved, defaults, normalizeAppearance) {
  if (saved && typeof saved === 'object' && Array.isArray(saved.entries)) {
    return {
      settings: { ...defaults, ...saved, appearance: normalizeAppearance(saved.appearance) },
      isFirstRun: false
    };
  }
  return {
    settings: {
      ...defaults, appearance: { ...defaults.appearance },
      entries: defaults.entries.map(entry => ({ ...entry }))
    },
    isFirstRun: true
  };
}
