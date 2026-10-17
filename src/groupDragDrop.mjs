import { getChildren, validateHierarchy, wouldCreateCycle } from './groupHierarchy.mjs';

/**
 * Pure tree edit for Settings drag-and-drop. Never mutates the saved array.
 * "before"/"after" reorder, "inside" files into an existing group,
 * "combine" creates a named group, and "root" moves to Main Kreis.
 */
export function dropEntry(entries, sourceId, targetId, mode, options = {}) {
  const fail = error => ({ entries, changed: false, error, newGroupId: undefined });
  const source = entries.find(entry => entry.id === sourceId);
  if (!source) return fail('The dragged shortcut no longer exists.');
  if (sourceId === targetId) return fail('Drop onto a different item.');
  const target = targetId ? entries.find(entry => entry.id === targetId) : undefined;
  if (mode !== 'root' && !target) return fail('The target shortcut no longer exists.');

  let parentId = '';
  if (mode === 'root') {
    parentId = '';
  } else if (mode === 'inside') {
    if (target.type !== 'group') return fail('Only groups can contain shortcuts.');
    parentId = target.id;
  } else {
    parentId = target.groupId || '';
  }

  if (mode !== 'combine' && !['before', 'after', 'inside', 'root'].includes(mode)) {
    return fail('Unknown drop action.');
  }
  if (source.type === 'group' && wouldCreateCycle(entries, sourceId, parentId)) {
    return fail('A group cannot be moved into itself or one of its descendants.');
  }
  // Combining a parent group with its own child would make a cycle.
  if (mode === 'combine' && source.type === 'group'
    && wouldCreateCycle(entries, sourceId, parentId)) {
    return fail('A parent group cannot be combined with an item inside itself.');
  }

  const originalSiblings = getChildren(entries, parentId);
  const sourceOriginalParent = source.groupId || '';
  let next = entries.filter(entry => entry.id !== sourceId);
  let order = [];
  let newGroupId;

  if (mode === 'combine') {
    if (target.type === 'group') return fail('Drop onto a group to move inside it.');
    const name = (options.groupTitle || '').trim();
    newGroupId = options.groupId;
    if (!name) return fail('Give the new group a name.');
    if (!newGroupId || entries.some(entry => entry.id === newGroupId)) {
      return fail('Cannot create a group with this identifier.');
    }

    // Target and source retain their original shortcut metadata.
    next = next.map(entry => entry.id === target.id
      ? { ...entry, groupId: newGroupId } : entry);
    const moved = { ...source, groupId: newGroupId };
    const group = {
      ...target, id: newGroupId, title: name, type: 'group', target: '',
      icon: 'folder', windowTitle: undefined, groupId: parentId || undefined
    };
    next.push(moved, group);
    order = originalSiblings
      .filter(entry => entry.id !== sourceId)
      .map(entry => entry.id === target.id ? newGroupId : entry.id);
  } else {
    next.push({ ...source, groupId: parentId || undefined });
    order = originalSiblings.filter(entry => entry.id !== sourceId).map(entry => entry.id);
    if (mode === 'inside' || mode === 'root') {
      order.push(sourceId);
    } else {
      const index = order.indexOf(target.id);
      if (index < 0) return fail('The drop target has moved. Try again.');
      order.splice(index + (mode === 'after' ? 1 : 0), 0, sourceId);
    }
  }

  const error = validateHierarchy(next, options.limit || 12);
  if (error) return fail(error);

  const byId = new Map(next.map(entry => [entry.id, entry]));
  const byParent = new Map();
  for (const entry of next) {
    const key = entry.groupId || '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(entry.id);
  }
  byParent.set(parentId, order);
  if (mode === 'combine') byParent.set(newGroupId, [target.id, source.id]);

  // Rebuild in depth-first order, keeping unchanged siblings' relative order.
  // Both the launcher and the Settings outline use this order.
  const result = [];
  const visited = new Set();
  function visit(parent) {
    for (const id of byParent.get(parent) || []) {
      if (visited.has(id)) continue;
      const entry = byId.get(id);
      if (!entry) continue;
      visited.add(id);
      result.push(entry);
      if (entry.type === 'group') visit(id);
    }
  }
  visit('');
  if (result.length !== next.length) return fail('Unable to arrange the hierarchy safely.');

  const changed = result.length !== entries.length || result.some((entry, i) =>
    entry.id !== entries[i].id || (entry.groupId || '') !== (entries[i].groupId || '')
  );
  return { entries: changed ? result : entries, changed, error: null, newGroupId };
}

export function dropModeForPointer(pointerY, top, height, targetType) {
  if (height <= 0) return 'after';
  const relative = Math.max(0, Math.min(1, (pointerY - top) / height));
  if (relative < 0.25) return 'before';
  if (relative > 0.75) return 'after';
  return targetType === 'group' ? 'inside' : 'combine';
}
