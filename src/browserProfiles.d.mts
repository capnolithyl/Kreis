import type { Entry, Settings, BrowserProfile, BrowserId } from './types';
export const BROWSER_OPTIONS: { id: BrowserId; name: string }[];
export function defaultBrowserProfiles(): BrowserProfile[];
export function validProfileId(id: unknown): boolean;
export function normalizeBrowserSettings(settings: Settings): Settings;
export function profileForEntry(entry: Entry, profiles: BrowserProfile[]): BrowserProfile | null;
export function assignProfile(entry: Entry, profile: BrowserProfile | null): Entry;
export function addBrowserProfile(profiles: BrowserProfile[], name: string, browserId: BrowserId, id: string):
  { error: string; profiles?: never } | { profiles: BrowserProfile[]; error?: never };
export function renameBrowserProfile(profiles: BrowserProfile[], profileId: string, name: string):
  { error: string; profiles?: never } | { profiles: BrowserProfile[]; error?: never };
export function deleteBrowserProfile(settings: Settings, id: string, replacementId?: string):
  { error: string; settings?: never } | { settings: Settings; error?: never };
