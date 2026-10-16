/** Add a settings destination here to include it in the settings sub-Kreis.
 * This list is intentionally separate from user-configured launcher shortcuts.
 */
export const SETTINGS_CATEGORIES = [
  { key: 'hotkey', title: 'Hotkey', icon: 'terminal', color: '#537ed2', description: 'Configure the global keyboard shortcut' },
  { key: 'typography', title: 'Typography', icon: 'settings', color: '#9476cc', description: 'Customize wheel fonts and text sizes' },
  { key: 'shortcuts', title: 'Shortcuts & Groups', icon: 'layers', color: '#4d9b89', description: 'Organize project groups, tabs and applications' },
  { key: 'connection', title: 'Connection', icon: 'link', color: '#be855a', description: 'Manage Vivaldi browser connections' }
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number]['key'];

export function settingsCategoryTitle(section: SettingsCategory): string {
  return SETTINGS_CATEGORIES.find(category => category.key === section)?.title ?? 'Settings';
}
