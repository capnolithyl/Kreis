import type { Settings } from './types';
export const SETTINGS_FILE_FORMAT: string;
export const SETTINGS_FILE_VERSION: number;
export const MAX_SETTINGS_FILE_BYTES: number;
export function serializeSettings(settings: Settings, date?: string): string;
export type SettingsImportPreview = {
  settings: Settings;
  fields: string[];
  warnings: string[];
  summary: {
    shortcuts: number;
    groups: number;
    browserProfiles: number;
    hotkey: string;
    entriesChanged: boolean;
    profilesChanged: boolean;
    hotkeyChanged: boolean;
    appearanceChanged: boolean;
  };
};
export function parseSettingsImport(contents: string,current: Settings): SettingsImportPreview;
