import { validateHierarchy, removeGroup } from './groupHierarchy.mjs';

/** All wheel edits use the same hierarchy/capacity checks as Settings and drag/drop. */
export function editWheelEntry(entries, entry, limit = 10) {
  if (!entries.some(current => current.id === entry.id)) {
    return { entries, error: 'This shortcut no longer exists.' };
  }
  const next = entries.map(current => current.id === entry.id ? { ...entry } : current);
  const error = validateHierarchy(next, limit, entries);
  return error ? { entries, error } : { entries: next, error: null };
}

/** Duplicates shortcuts beside their original, never silently duplicates a group tree. */
export function duplicateWheelEntry(entries, id, newId, limit = 10) {
  const index = entries.findIndex(entry => entry.id === id);
  if (index === -1) return { entries, error: 'Shortcut no longer exists.' };
  const source = entries[index];
  if (source.type === 'group') return { entries, error: 'Duplicate individual shortcuts, not entire groups.' };
  if (!newId || entries.some(entry => entry.id === newId)) {
    return { entries, error: 'A unique shortcut ID is required.' };
  }
  const copy = { ...source, id: newId, title: (source.title + ' copy').slice(0, 30) };
  const next = [...entries];
  next.splice(index + 1, 0, copy);
  const error = validateHierarchy(next, limit, entries);
  return error ? { entries, error } : { entries: next, error: null };
}

/** Group deletion lifts children up, consistent with the existing Settings behavior. */
export function deleteWheelEntry(entries, id, limit = 10) {
  return removeGroup(entries, id, limit);
}
