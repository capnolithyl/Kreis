import type { Entry, Settings, WheelAppearance } from './types';
export function createStarterEntries(): Entry[];
export function selectInitialSettings(
  saved: Settings | null | undefined,
  defaults: Settings,
  normalizeAppearance: (appearance?: Partial<WheelAppearance> | null) => WheelAppearance
): { settings: Settings; isFirstRun: boolean };
