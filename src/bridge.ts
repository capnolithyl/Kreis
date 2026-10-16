import { invoke } from '@tauri-apps/api/core';
import type { Entry, Profile } from './types';

export type BrowserTab = { id: number; windowId: number; title: string };
export type AppWindow = { id: string; title: string };
/** Enumeration uses visible titled top-level windows only. */
export const listAppWindows = (executable: string) =>
  invoke<AppWindow[]>('list_application_windows', { executable });
export const openFolder = (path: string) =>
  invoke<'existing-window' | 'new-tab' | 'new-window'>('open_folder', { path });
export const focusAppWindow = (executable: string, windowId: string) =>
  invoke<void>('focus_application_window', { executable, windowId });

export type OpenResult = { openedIn: 'browser-extension' | 'default-browser' | 'desktop-app'; details?: string };

export async function launch(entry: Entry): Promise<OpenResult> {
  if (entry.type === 'app') {
    await invoke('focus_application', { executable: entry.target });
    return { openedIn: 'desktop-app' };
  }
  const connected = await invoke<boolean>('activate_browser', {
    url: entry.target, profile: entry.profile, matchMode: entry.match
  });
  return connected
    ? { openedIn: 'browser-extension' }
    : { openedIn: 'default-browser', details: `The ${entry.profile} Vivaldi extension is not connected. Opened with your system default browser.` };
}

/** Null indicates an old or disconnected extension. The caller can use the legacy action. */
export const getMatchingTabs = (entry: Entry) => invoke<BrowserTab[] | null>('query_browser_tabs', {
  url: entry.target, profile: entry.profile, matchMode: entry.match
});
export const focusBrowserTab = (profile: Profile, tabId: number) =>
  invoke<void>('focus_browser_tab', { profile, tabId });
export const openNewBrowserTab = (entry: Entry) =>
  invoke<void>('open_browser_tab', { url: entry.target, profile: entry.profile });

export const getProfiles = () => invoke<string[]>('connected_profiles');
export const getPairingKey = () => invoke<string>('pairing_key');
export const toggleWheel = () => invoke<void>('toggle_at_cursor');
export const hideWheel = () => invoke<void>('hide_wheel');
