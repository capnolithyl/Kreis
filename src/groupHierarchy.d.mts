import type { Entry } from './types';
export function getChildren(entries: Entry[], groupId?: string): Entry[];
export function wouldCreateCycle(entries: Entry[], entryId: string, newParentId?: string): boolean;
export function validateHierarchy(entries: Entry[], limit?: number): string | null;
export function flattenHierarchy(entries: Entry[]): { entry: Entry; depth: number }[];
export function removeGroup(entries: Entry[], id: string, limit?: number): { entries: Entry[]; error: string | null };
export function suggestParent(entries: Entry[], limit?: number): string | undefined;
export function eligibleParentGroups(entries: Entry[], entryId?: string): { id: string; title: string; depth: number }[];
