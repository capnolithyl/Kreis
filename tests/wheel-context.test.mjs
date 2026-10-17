import test from 'node:test';
import assert from 'node:assert/strict';
import { editWheelEntry, duplicateWheelEntry, deleteWheelEntry } from '../src/wheelContextActions.mjs';

const group = (id, title, groupId) => ({ id, type: 'group', title, target: '', groupId });
const shortcut = (id, title, groupId) => ({ id, type: 'browser', title, target: 'https://example.com', groupId, icon: 'globe', color: '#112233' });

test('rename or recolor changes only the selected entry, preserving descendants', () => {
  const entries = [group('a', 'Parent'), group('b', 'Nested', 'a'), shortcut('c', 'Link', 'b')];
  const next = editWheelEntry(entries, { ...entries[0], title: 'Renamed', color: '#ddeeff', icon: 'folder' });
  assert.equal(next.error, null);
  assert.equal(next.entries[0].title, 'Renamed');
  assert.equal(next.entries[2].groupId, 'b');
  assert.equal(entries[0].title, 'Parent');
});

test('cannot move a group into itself, a child or another nonexistent group', () => {
  const entries = [group('a', 'Parent'), group('b', 'Nested', 'a'), shortcut('c', 'Link', 'b')];
  for (const destination of ['a', 'b', 'missing']) {
    const result = editWheelEntry(entries, { ...entries[0], groupId: destination });
    assert.ok(result.error);
    assert.equal(result.entries, entries);
  }
});

test('moving a shortcut is allowed only when the destination has capacity', () => {
  const entries = [group('g', 'Full'), shortcut('move', 'Move'), ...Array.from({length: 12}, (_, n) => shortcut('f'+n, 'Item '+n, 'g'))];
  const result = editWheelEntry(entries, { ...entries[1], groupId: 'g' });
  assert.match(result.error, /exceeds 10/);
});

test('duplicate is inserted after source with its own id and inherited placement', () => {
  const entries = [group('g', 'Group'), shortcut('a', 'Link', 'g')];
  const result = duplicateWheelEntry(entries, 'a', 'copy');
  assert.equal(result.error, null);
  assert.deepEqual(result.entries.map(entry => entry.id), ['g','a','copy']);
  assert.equal(result.entries[2].groupId, 'g');
  assert.equal(result.entries[2].title, 'Link copy');
  assert.equal(entries.length, 2);
});

test('duplicate does not exceed wheel limits or duplicate a group', () => {
  const full = Array.from({length: 12}, (_, n) => shortcut('a'+n, 'Link '+n));
  assert.match(duplicateWheelEntry(full, 'a0', 'new').error, /10/);
  assert.match(duplicateWheelEntry([group('g', 'Group')], 'g', 'g2').error, /groups/);
});

test('deleting a nested group lifts its immediate contents and leaves deeper nesting intact', () => {
  const entries = [group('a','A'), group('b','B','a'), group('c','C','b'), shortcut('x','Link','c')];
  const result = deleteWheelEntry(entries, 'b');
  assert.equal(result.error, null);
  assert.deepEqual(result.entries.map(entry => entry.id), ['a','c','x']);
  assert.equal(result.entries[1].groupId, 'a');
  assert.equal(result.entries[2].groupId, 'c');
});

test('deleting a group refuses to overflow its parent', () => {
  const entries = [group('a','Parent'), group('b','Group','a'),
    ...Array.from({length: 11}, (_, n) => shortcut('x'+n,'Sibling'+n,'a')),
    shortcut('nested','Nested','b'), shortcut('nested2','Second nested','b')];
  const result = deleteWheelEntry(entries, 'b');
  assert.match(result.error, /exceeds 10/);
  assert.equal(result.entries, entries);
});
