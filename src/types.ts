import { createStarterEntries } from './starterSettings.mjs';
import { defaultBrowserProfiles } from './browserProfiles.mjs';

export type TargetType = 'browser' | 'vivaldi-stack' | 'app' | 'folder' | 'group';
/** Legacy bridge label retained for older saved shortcuts and v0.3 companions. */
export type Profile = string;
export type BrowserId = 'vivaldi' | 'chrome' | 'edge' | 'brave' | 'opera';
export type BrowserProfile = { id: string; name: string; browserId: BrowserId };
export type MatchMode = 'exact' | 'prefix' | 'site';
export type Entry = {
  id: string;
  title: string;
  type: TargetType;
  target: string;
  profile: Profile;
  /** Stable routed identity. Empty string means deliberately unassigned. */
  profileId?: string;
  browserId?: BrowserId;
  match: MatchMode;
  recreateStack?: boolean;
  stackStartUrl?: string;
  icon: string;
  color: string;
  /** A top-level group ID; absent means show this entry on the main wheel. */
  groupId?: string;
  /** Optional case-insensitive substring for a Windows app title or browser tab title. */
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

export type Settings = { shortcut: string; entries: Entry[]; appearance: WheelAppearance; browserProfiles: BrowserProfile[] };

export const DEFAULT_SETTINGS: Settings = {
  shortcut: 'Control+Space',
  appearance: DEFAULT_APPEARANCE,
  entries: createStarterEntries(),
  browserProfiles: defaultBrowserProfiles()
};

export function validateEntry(entry: Entry): string | null {
  if (!entry.title.trim()) return 'Please enter a label.';
  if (entry.type === 'group') return null;
  if (!entry.target.trim()) return 'Please enter a URL, executable, or folder path.';
  if (entry.type === 'vivaldi-stack') {
    if (entry.target.trim().length > 60) return 'Use a stack name no longer than 60 characters.';
    if (entry.stackStartUrl?.trim()) {
      try { const parsed = new URL(entry.stackStartUrl);
        if (!['http:','https:'].includes(parsed.protocol)) return 'Starting URL must use HTTP(S).';
      } catch { return 'Enter a valid starting URL including https://'; }
    }
  }
  if (entry.type === 'browser') {
    try {
      const parsed = new URL(entry.target);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Only HTTP and HTTPS URLs are supported.';
    } catch { return 'Enter a valid URL including https://'; }
  }
  return null;
}
