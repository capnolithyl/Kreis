import type { BrowserProfile } from './types';
import type { BrowserTab } from './bridge';
export type LiveDomain = { domain: string; tabs: BrowserTab[] };
export type LiveProfile = { profile: BrowserProfile; domains: LiveDomain[]; tabCount: number };
export function tabDomain(url: string): string | null;
export function groupLiveTabs(results: Array<{profile: BrowserProfile; tabs: BrowserTab[] | null}>): {
  profiles: LiveProfile[];
  unavailable: string[];
};
