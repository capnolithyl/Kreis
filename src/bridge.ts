import { invoke } from '@tauri-apps/api/core';
import type { Entry } from './types';

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

export const getProfiles = () => invoke<string[]>('connected_profiles');
export const getPairingKey = () => invoke<string>('pairing_key');
export const toggleWheel = () => invoke<void>('toggle_at_cursor');
export const hideWheel = () => invoke<void>('hide_wheel');
