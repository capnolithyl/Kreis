/** Add a settings destination here to include it in the settings sub-Kreis.
 * This list is intentionally separate from user-configured launcher shortcuts.
 */
export const SETTINGS_CATEGORIES = [
  { key: 'hotkey', title: 'Hotkey', icon: 'terminal', color: '#537ed2', description: 'Configure the global keyboard shortcut' },
  { key: 'typography', title: 'Typography', icon: 'settings', color: '#9476cc', description: 'Customize wheel fonts and text sizes' },
  { key: 'shortcuts', title: 'Shortcuts & Groups', icon: 'layers', color: '#4d9b89', description: 'Organize shortcuts, groups, tabs and applications' },
  { key: 'connection', title: 'Connection', icon: 'link', color: '#be855a', description: 'Manage Chromium browsers, profiles and extension pairing' },
  { key: 'integrations', title: 'Integrations', icon: 'folder', color: '#66a1a5', description: 'Add to Kreis from Windows and browser context menus' },
  { key: 'backup', title: 'Backup & Restore', icon: 'save', color: '#8c89bd', description: 'Export and import shortcuts and settings as JSON' }
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number]['key'];

export function settingsCategoryTitle(section: SettingsCategory): string {
  return SETTINGS_CATEGORIES.find(category => category.key === section)?.title ?? 'Settings';
}
