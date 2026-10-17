import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHierarchy, getChildren, removeGroup, suggestParent } from '../src/groupHierarchy.mjs';
import { editWheelEntry, duplicateWheelEntry } from '../src/wheelContextActions.mjs';
import { dropEntry } from '../src/groupDragDrop.mjs';

const shortcut = (id, groupId) => ({
  id, title: id, type: 'browser', target: 'https://example.org', groupId,
  color: '#123456', icon: 'globe', profile: 'Personal', match: 'exact'
});
const group = id => ({ ...shortcut(id), type: 'group', target: '' });
const existing = (size = 12) => [
  group('legacy'),
  ...Array.from({length:size}, (_, i) => shortcut('s'+i, 'legacy')),
  group('other')
];

test('new 10-slice wheels validate and 11th new slice fails', () => {
  const ten = Array.from({length:10}, (_, i) => shortcut('x'+i));
  assert.equal(validateHierarchy(ten), null);
  assert.match(validateHierarchy([...ten, shortcut('extra')]), /10/);
  assert.equal(suggestParent([group('g'), ...ten]), undefined); // exactly 11 root entries, no migration
});

test('legacy 11- and 12-slice groups are preserved during harmless edits', () => {
  for (const count of [11, 12]) {
    const previous = existing(count);
    assert.equal(validateHierarchy(previous, 10, previous), null);
    assert.match(validateHierarchy(previous), /10/);
    const renamed = editWheelEntry(previous, {...previous[1], title: 'Updated'});
    assert.equal(renamed.error, null);
    assert.equal(renamed.entries[1].title, 'Updated');
    const reordered = dropEntry(previous, 's1', 's0', 'before', {limit:10});
    assert.equal(reordered.error, null);
    assert.deepEqual(getChildren(reordered.entries, 'legacy').slice(0,2).map(x => x.id), ['s1','s0']);
    assert.equal(getChildren(reordered.entries,'legacy').length, count);
  }
});

test('legacy groups can shrink, but may not grow or accept duplicates', () => {
  const previous = existing(12);
  const duplicate = duplicateWheelEntry(previous, 's0', 'new', 10);
  assert.match(duplicate.error, /10/);
  assert.equal(duplicate.entries, previous);

  const add = validateHierarchy([...previous, shortcut('new','legacy')], 10, previous);
  assert.match(add, /10/);

  const moveOut = editWheelEntry(previous, {...previous[1], groupId: 'other'}, 10);
  assert.equal(moveOut.error, null);
  assert.equal(getChildren(moveOut.entries, 'legacy').length, 11);

  const reduced = previous.filter(e => e.id !== 's0' && e.id !== 's1');
  assert.equal(validateHierarchy(reduced, 10, previous), null);
  assert.match(validateHierarchy([...reduced, shortcut('new','legacy')],10,reduced), /10/);
});

test('unrelated edits and deletions still work when a different Kreis is legacy-full', () => {
  const previous = [...existing(12), shortcut('x','other')];
  const result = removeGroup(previous, 'other', 10);
  assert.equal(result.error, null);
  assert.equal(getChildren(result.entries, 'legacy').length, 12);
  assert.equal(getChildren(result.entries).some(e=>e.id==='x'), true);
});

test('delete does not lift group contents into a full destination', () => {
  const previous = [...existing(12), shortcut('child','other')];
  // Move the group itself under the legacy group: deleting it would have to
  // lift its one child, taking legacy from 12 to 13.
  const altered = previous.map(e=>e.id==='other'?{...e,groupId:'legacy'}:e);
  assert.match(removeGroup(altered,'other',10).error, /10/);
});
