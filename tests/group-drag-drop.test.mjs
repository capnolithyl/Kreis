import test from 'node:test';
import assert from 'node:assert/strict';
import { dropEntry, wheelDropIntent } from '../src/groupDragDrop.mjs';
import { getChildren, validateHierarchy } from '../src/groupHierarchy.mjs';

const item = (id, parent, type = 'browser') => ({
  id, title: id, groupId: parent, type,
  target: type === 'browser' ? 'https://example.com/' : '',
  icon: type === 'group' ? 'folder' : 'globe',
  color: '#123456', profile: 'Work', match: 'prefix'
});
const setup = () => [
  item('Work', undefined, 'group'), item('IHM', 'Work', 'group'),
  item('Frontend', 'IHM'), item('Backend', 'IHM'),
  item('Baltimore', 'Work', 'group'), item('Wiki', 'Baltimore'),
  item('Personal', undefined, 'group'), item('Runagaldr', 'Personal', 'group'),
  item('Review', 'Runagaldr'), item('Kreis', 'Personal', 'group')
];
const childIds = (entries, parent = '') => getChildren(entries, parent).map(entry => entry.id);

test('drag left/right of wedges changes sibling order without changing metadata', () => {
  const original = setup();
  const swapped = dropEntry(original, 'Backend', 'Frontend', 'before');
  assert.equal(swapped.error, null);
  assert.deepEqual(childIds(swapped.entries, 'IHM'), ['Backend', 'Frontend']);
  assert.equal(swapped.entries.find(entry => entry.id === 'Frontend').target, 'https://example.com/');
  const after = dropEntry(swapped.entries, 'Work', 'Personal', 'after');
  assert.deepEqual(childIds(after.entries), ['Personal', 'Work']);
  assert.deepEqual(childIds(original), ['Work', 'Personal']);
});

test('reorder a shortcut into another project without losing its children', () => {
  const result = dropEntry(setup(), 'IHM', 'Runagaldr', 'after');
  assert.equal(result.error, null);
  assert.deepEqual(childIds(result.entries, 'Personal'), ['Runagaldr', 'IHM', 'Kreis']);
  assert.deepEqual(childIds(result.entries, 'IHM'), ['Frontend', 'Backend']);
  assert.deepEqual(childIds(result.entries, 'Work'), ['Baltimore']);
});

test('drag onto a group files shortcut inside, keeping nested descendants', () => {
  const result = dropEntry(setup(), 'Backend', 'Runagaldr', 'inside');
  assert.equal(result.error, null);
  assert.deepEqual(childIds(result.entries, 'Runagaldr'), ['Review', 'Backend']);
  assert.deepEqual(childIds(result.entries, 'IHM'), ['Frontend']);
});

test('drop shortcut onto shortcut makes a named group at the target wedge position', () => {
  const original = setup();
  const result = dropEntry(original, 'Backend', 'Frontend', 'combine', {
    groupId: 'new-group', groupTitle: 'IHM Development'
  });
  assert.equal(result.error, null);
  assert.deepEqual(childIds(result.entries, 'IHM'), ['new-group']);
  assert.deepEqual(childIds(result.entries, 'new-group'), ['Frontend', 'Backend']);
  assert.equal(result.entries.find(entry => entry.id === 'new-group').color, '#123456');
  assert.deepEqual(childIds(original, 'IHM'), ['Frontend', 'Backend']);
});

test('group creation works across different parents without deleting shortcuts', () => {
  const result = dropEntry(setup(), 'Review', 'Frontend', 'combine', {
    groupId: 'mixed', groupTitle: 'Mixed'
  });
  assert.equal(result.error, null);
  assert.deepEqual(childIds(result.entries, 'IHM'), ['mixed', 'Backend']);
  assert.deepEqual(childIds(result.entries, 'mixed'), ['Frontend', 'Review']);
  assert.deepEqual(childIds(result.entries, 'Runagaldr'), []);
  assert.equal(result.entries.length, setup().length + 1);
});

test('drop on center of nested wheel moves to its parent, not always main', () => {
  const result = dropEntry(setup(), 'Frontend', null, 'root', { parentGroupId: 'Work' });
  assert.equal(result.error, null);
  assert.deepEqual(childIds(result.entries, 'Work'), ['IHM', 'Baltimore', 'Frontend']);
  assert.deepEqual(childIds(result.entries, 'IHM'), ['Backend']);
});

test('cycle attempts and full destination wheels fail without mutating anything', () => {
  const original = setup();
  const cycle = dropEntry(original, 'Work', 'IHM', 'inside');
  assert.match(cycle.error, /cannot be moved/);
  assert.equal(cycle.entries, original);
  const crowded = [item('A', undefined, 'group'), item('B', undefined, 'group'),
    ...Array.from({length:12}, (_, index) => item('s' + index, 'A')),
    item('extra', 'B')];
  const full = dropEntry(crowded, 'extra', 'A', 'inside');
  assert.match(full.error, /exceeds 10/);
  assert.equal(full.entries, crowded);
  assert.match(validateHierarchy(crowded), /exceeds 10/);
  assert.equal(validateHierarchy(crowded, 10, crowded), null);
});

test('unchanged drag does not rewrite saved data', () => {
  const original = setup();
  const result = dropEntry(original, 'Frontend', 'Backend', 'before');
  assert.equal(result.changed, false);
  assert.equal(result.entries, original);
});

test('radial targeting distinguishes wedge center, edges, outside and parent', () => {
  // Four segments centered at 12, 3, 6, and 9 o'clock.
  const kinds = ['browser','group','browser','browser'];
  assert.deepEqual(wheelDropIntent(300, 125, kinds), { targetIndex: 0, mode: 'combine' });
  assert.deepEqual(wheelDropIntent(475, 300, kinds), { targetIndex: 1, mode: 'inside' });
  assert.deepEqual(wheelDropIntent(300, 300, kinds, true), { targetIndex: null, mode: 'root' });
  assert.equal(wheelDropIntent(300, 300, kinds, false), null);
  assert.equal(wheelDropIntent(580, 300, kinds), null);
  assert.equal(wheelDropIntent(300, 30, kinds), null);
  assert.equal(wheelDropIntent(300, 210, kinds), null);
  assert.equal(wheelDropIntent(425, 175, kinds).mode, 'before');
});

test('combining a group with its own descendant is rejected', () => {
  const original = setup();
  const result = dropEntry(original, 'Work', 'Frontend', 'combine', {
    groupId: 'nonsense', groupTitle: 'Broken'
  });
  assert.match(result.error, /cannot be combined/);
  assert.equal(result.entries, original);
});
