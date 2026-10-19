import { invoke } from '@tauri-apps/api/core';
import type { Entry, BrowserProfile } from './types';

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
    url: entry.target, profile: entry.profileId ?? entry.profile, matchMode: entry.match
  });
  return connected
    ? { openedIn: 'browser-extension' }
    : { openedIn: 'default-browser', details: `The legacy ${entry.profile} Vivaldi extension is disconnected. Opened with your system default browser.` };
}

/** Null indicates an old or disconnected extension. The caller can use the legacy action. */
export const getMatchingTabs = (entry: Entry) => invoke<BrowserTab[] | null>('query_browser_tabs', {
  url: entry.target, profile: entry.profileId ?? entry.profile,
  matchMode: entry.type === 'vivaldi-stack' ? 'stack' : entry.match,
  recreateStack: entry.type === 'vivaldi-stack' && entry.recreateStack === true,
  startUrl: entry.type === 'vivaldi-stack' ? entry.stackStartUrl || '' : ''
});
export const focusBrowserTab = (profileId: string, tabId: number) =>
  invoke<void>('focus_browser_tab', { profile: profileId, tabId });
export const openNewBrowserTab = (entry: Entry) =>
  invoke<void>('open_browser_tab', { url: entry.target, profile: entry.profileId ?? entry.profile });

/** IDs of connected configured browser profiles, not display names. */
export const getProfiles = () => invoke<string[]>('connected_profiles');
export const setBrowserProfiles = (profiles: BrowserProfile[]) =>
  invoke<void>('set_browser_profiles', { profiles });
export const getPairingKey = () => invoke<string>('pairing_key');
/** Rust follows the OS pointer in physical pixels while the mouse is down. */
export const startHubDrag = () => invoke<void>('start_hub_drag');
export const toggleWheel = () => invoke<void>('toggle_at_cursor');
export const hideWheel = () => invoke<void>('hide_wheel');
/** Suspend hide-on-blur while the Windows JSON import file picker is open. */
export const setSettingsPickerActive = (active: boolean) =>
  invoke<void>('set_file_picker_active', { active });

export type ContextAdd = {
  kind: 'browser' | 'folder' | 'app' | 'vivaldi-stack';
  target: string;
  title: string;
  profile?: string | null;
};

/** An Explorer context command may launch Kreis when it is not running yet. */
export const takeStartupContext = () => invoke<ContextAdd | null>('take_startup_context');
export const windowsContextMenuEnabled = () => invoke<boolean>('windows_context_menu_enabled');
export const setWindowsContextMenu = (enabled: boolean) => invoke<void>('set_windows_context_menu', { enabled });
