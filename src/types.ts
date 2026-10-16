export type TargetType = 'browser' | 'app' | 'group';
export type Profile = 'Work' | 'Personal';
export type MatchMode = 'exact' | 'prefix' | 'site';
export type Entry = {
  id: string;
  title: string;
  type: TargetType;
  target: string;
  profile: Profile;
  match: MatchMode;
  icon: string;
  color: string;
  /** A top-level group ID; absent means show this entry on the main wheel. */
  groupId?: string;
  /** Optional case-insensitive substring for a specific app window/workspace. */
  windowTitle?: string;
};

/** Preset fonts use locally installed Windows fonts; no downloads or network required. */
export const WHEEL_FONTS = [
  'Inter', 'Segoe UI', 'Bahnschrift', 'Arial', 'Verdana',
  'Tahoma', 'Trebuchet MS', 'Georgia', 'Consolas', 'Courier New'
] as const;

export type WheelFont = typeof WHEEL_FONTS[number];
export type WheelAppearance = {
  fontFamily: WheelFont;
  labelSize: number;
  centerSize: number;
};

export const DEFAULT_APPEARANCE: WheelAppearance = {
  fontFamily: 'Inter',
  labelSize: 12,
  centerSize: 16
};

/** Old installations have no appearance settings; migrate without touching saved shortcuts. */
export function normalizeAppearance(value?: Partial<WheelAppearance> | null): WheelAppearance {
  return {
    fontFamily: WHEEL_FONTS.includes(value?.fontFamily as WheelFont)
      ? value!.fontFamily as WheelFont : DEFAULT_APPEARANCE.fontFamily,
    labelSize: Number.isFinite(value?.labelSize) && value!.labelSize! >= 10 && value!.labelSize! <= 18
      ? value!.labelSize! : DEFAULT_APPEARANCE.labelSize,
    centerSize: Number.isFinite(value?.centerSize) && value!.centerSize! >= 13 && value!.centerSize! <= 24
      ? value!.centerSize! : DEFAULT_APPEARANCE.centerSize
  };
}

export function wheelFontStack(font: WheelFont): string {
  // Quoted names prevent multi-word fonts from being treated as multiple families.
  return '"' + font + '", "Segoe UI", system-ui, sans-serif';
}

export type Settings = { shortcut: string; entries: Entry[]; appearance: WheelAppearance };

export const DEFAULT_SETTINGS: Settings = {
  shortcut: 'Control+Space',
  appearance: DEFAULT_APPEARANCE,
  entries: [
    { id: 'chat', title: 'Google Chat', type: 'browser', target: 'https://chat.google.com/u/0/app/home', profile: 'Work', match: 'prefix', icon: 'message', color: '#47a66a' },
    { id: 'frontend', title: 'Frontend', type: 'browser', target: 'https://ihmcfo.diocesanweb.org/', profile: 'Work', match: 'site', icon: 'globe', color: '#448bd4' },
    { id: 'backend', title: 'Backend', type: 'browser', target: 'https://ihmcfo.diocesanweb.org/wp-admin/', profile: 'Work', match: 'prefix', icon: 'panel', color: '#697ce5' },
    { id: 'figma', title: 'Figma', type: 'browser', target: 'https://www.figma.com/design/XkSF8tgLt9sTZluYbOPvl6/Immaculate-Heart-of-Mary-%7C-Cuyahoga--OH?node-id=456-911&m=dev', profile: 'Work', match: 'prefix', icon: 'figma', color: '#bd69c6' },
    { id: 'vscode', title: 'VS Code', type: 'app', target: 'Code.exe', profile: 'Work', match: 'exact', icon: 'code', color: '#438ba8' },
    { id: 'mail', title: 'Gmail', type: 'browser', target: 'https://mail.google.com/', profile: 'Work', match: 'prefix', icon: 'mail', color: '#d98c45' },
    { id: 'monday', title: 'monday.com', type: 'browser', target: 'https://monday.com/', profile: 'Work', match: 'prefix', icon: 'columns', color: '#c75b83' },
    { id: 'calendar', title: 'Calendar', type: 'browser', target: 'https://calendar.google.com/', profile: 'Work', match: 'prefix', icon: 'calendar', color: '#648c9f' }
  ]
};

export function validateEntry(entry: Entry): string | null {
  if (!entry.title.trim()) return 'Please enter a label.';
  if (entry.type === 'group') return null;
  if (!entry.target.trim()) return 'Please enter a URL or executable.';
  if (entry.type === 'browser') {
    try {
      const parsed = new URL(entry.target);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Only HTTP and HTTPS URLs are supported.';
    } catch { return 'Enter a valid URL including https://'; }
  }
  return null;
}
