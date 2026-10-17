import type { Entry } from './types';

export type WheelContextResult = { entries: Entry[]; error: string | null };
export function editWheelEntry(entries: Entry[], entry: Entry, limit?: number): WheelContextResult;
export function duplicateWheelEntry(entries: Entry[], id: string, newId: string, limit?: number): WheelContextResult;
export function deleteWheelEntry(entries: Entry[], id: string, limit?: number): WheelContextResult;
