/** The saved groupId field is the parent ID for shortcuts AND groups.
 * These pure helpers support any nesting depth without changing saved data.
 */
export function getChildren(entries, groupId = '') {
  return entries.filter(item => (item.groupId || '') === groupId);
}

/** An entry may only live under a group, never inside itself or descendants. */
export function wouldCreateCycle(entries, entryId, newParentId) {
  if (!newParentId) return false;
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const seen = new Set();
  let current = newParentId;
  while (current) {
    if (current === entryId || seen.has(current)) return true;
    seen.add(current);
    const parent = byId.get(current);
    if (!parent || parent.type !== 'group') return true;
    current = parent.groupId || '';
  }
  return false;
}

/** Validate all direct wheel capacities and the full parent graph before saving. */
export function validateHierarchy(entries, limit = 10, previousEntries = null) {
  // Preserve 11/12-slice wheels from older Kreis installs. Existing oversized
  // groups may be renamed, reordered, or reduced, but can never grow larger.
  const previousCounts = new Map();
  for (const entry of previousEntries || []) {
    const parent = entry.groupId || '';
    previousCounts.set(parent, (previousCounts.get(parent) || 0) + 1);
  }
  const ids = new Set();
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id)) return 'Shortcut IDs must be unique.';
    ids.add(entry.id);
    if (entry.type === 'group') groups.set(entry.id, entry);
  }
  const counts = new Map();
  for (const entry of entries) {
    const parentId = entry.groupId || '';
    if (parentId && !groups.has(parentId)) {
      return `The placement for "${entry.title}" no longer exists.`;
    }
    if (entry.type === 'group' && wouldCreateCycle(entries, entry.id, parentId)) {
      return `A group cannot contain itself or one of its parent groups ("${entry.title}").`;
    }
    counts.set(parentId, (counts.get(parentId) || 0) + 1);
  }
  for (const [parentId, count] of counts) {
    if (count > limit && count > (previousCounts.get(parentId) || 0)) {
      return parentId
        ? `The "${groups.get(parentId)?.title || 'unknown'}" group exceeds ${limit} items. Move some entries to another group.`
        : `The main Kreis can hold ${limit} items. Move entries into groups first.`;
    }
  }
  return null;
}

/** Depth-first row rendering for Settings, with cycle-safe handling of older data. */
export function flattenHierarchy(entries) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const roots = entries.filter(entry => {
    const parent = entry.groupId ? byId.get(entry.groupId) : undefined;
    return !parent || parent.type !== 'group' || entry.groupId === entry.id;
  });
  const visited = new Set();
  const arranged = [];
  function visit(entry, depth) {
    if (visited.has(entry.id)) return;
    visited.add(entry.id);
    arranged.push({ entry, depth });
    if (entry.type === 'group') {
      entries.filter(child => child.groupId === entry.id).forEach(child => visit(child, depth + 1));
    }
  }
  roots.forEach(entry => visit(entry, 0));
  // Corrupted legacy cycles cannot make the editor hang or hide shortcuts.
  entries.forEach(entry => visit(entry, 0));
  return arranged;
}

/** Removing a group lifts immediate members to its parent, never deleting them. */
export function removeGroup(entries, id, limit = 10) {
  const removed = entries.find(entry => entry.id === id);
  if (!removed) return { entries, error: 'Entry not found.' };
  const without = entries.filter(entry => entry.id !== id);
  const parentId = removed.groupId || undefined;
  const next = removed.type === 'group'
    ? without.map(entry => entry.groupId === id ? { ...entry, groupId: parentId } : entry)
    : without;
  const error = validateHierarchy(next, limit, entries);
  return error ? { entries, error } : { entries: next, error: null };
}

/** Suggest root if available, otherwise the first group with free space. */
export function suggestParent(entries, limit = 10) {
  if (getChildren(entries).length < limit) return undefined;
  return entries.find(entry => entry.type === 'group' && getChildren(entries, entry.id).length < limit)?.id;
}

/** All reachable group options in outline order, excluding self and descendants. */
export function eligibleParentGroups(entries, entryId = '') {
  return flattenHierarchy(entries)
    .filter(({ entry }) => entry.type === 'group' && (!entryId || !wouldCreateCycle(entries, entryId, entry.id)))
    .map(({ entry, depth }) => ({ id: entry.id, title: entry.title, depth }));
}
