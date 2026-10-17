import type { Entry } from './types';
export type DropMode = 'before' | 'after' | 'inside' | 'combine' | 'root';
export type DropOptions = {
  groupId?: string; groupTitle?: string; parentGroupId?: string; limit?: number;
};
export function dropEntry(entries: Entry[], sourceId: string, targetId: string | null,
  mode: DropMode, options?: DropOptions): {
    entries: Entry[]; changed: boolean; error: string | null; newGroupId?: string;
  };
export function wheelDropIntent(x: number, y: number, types: string[],
  allowParent?: boolean): { targetIndex: number | null; mode: DropMode } | null;
