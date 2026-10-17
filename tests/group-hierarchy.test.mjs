import test from 'node:test';
import assert from 'node:assert/strict';
import { getChildren, wouldCreateCycle, validateHierarchy, flattenHierarchy, removeGroup, suggestParent, eligibleParentGroups } from '../src/groupHierarchy.mjs';

const entry = (id, type = 'group', groupId) => ({ id, title: id, type, groupId });
const sample = [
  entry('Work'), entry('IHM', 'group', 'Work'), entry('Frontend', 'browser', 'IHM'),
  entry('Backend', 'browser', 'IHM'), entry('Baltimore', 'group', 'Work'),
  entry('Personal'), entry('Runagaldr', 'group', 'Personal'),
  entry('Kreis', 'group', 'Personal'), entry('Code', 'app', 'Kreis')
];

test('deeply nested groups and app/tab children are visible and ordered', () => {
  assert.equal(validateHierarchy(sample), null);
  assert.deepEqual(getChildren(sample, 'Work').map(e => e.id), ['IHM', 'Baltimore']);
  assert.deepEqual(flattenHierarchy(sample).map(row => [row.entry.id, row.depth]), [
    ['Work', 0], ['IHM', 1], ['Frontend', 2], ['Backend', 2],
    ['Baltimore', 1], ['Personal', 0], ['Runagaldr', 1], ['Kreis', 1], ['Code', 2]
  ]);
});

test('moving a parent under itself or descendants is blocked, siblings allowed', () => {
  assert.equal(wouldCreateCycle(sample, 'Work', 'Work'), true);
  assert.equal(wouldCreateCycle(sample, 'Work', 'IHM'), true);
  assert.equal(wouldCreateCycle(sample, 'Work', 'Baltimore'), true);
  assert.equal(wouldCreateCycle(sample, 'IHM', 'Baltimore'), false);
  assert.equal(wouldCreateCycle(sample, 'Runagaldr', 'IHM'), false);
  assert.equal(validateHierarchy(sample.map(e => e.id === 'Work' ? { ...e, groupId: 'IHM' } : e))?.includes('cannot'), true);
});

test('placement dropdown filters descendants while displaying tree depth', () => {
  assert.deepEqual(eligibleParentGroups(sample, 'Work').map(g => g.id), ['Personal','Runagaldr','Kreis']);
  assert.deepEqual(eligibleParentGroups(sample, 'IHM').map(g => g.id), ['Work','Baltimore','Personal','Runagaldr','Kreis']);
});

test('deleting intermediate group preserves children and grandchildren', () => {
  const { entries, error } = removeGroup(sample, 'IHM');
  assert.equal(error, null);
  assert.deepEqual(getChildren(entries, 'Work').map(e => e.id), ['Frontend', 'Backend', 'Baltimore']);
  assert.equal(entries.find(e => e.id === 'Frontend').groupId, 'Work');
  const next = removeGroup(sample, 'Work');
  assert.equal(next.error, null);
  assert.equal(next.entries.find(e => e.id === 'IHM').groupId, undefined);
  assert.equal(next.entries.find(e => e.id === 'Frontend').groupId, 'IHM');
});

test('deleting group refuses overflow and loses no entries', () => {
  const crowded = [entry('Work'), entry('IHM','group','Work'), ...Array.from({length:11},(_,i)=>entry('S'+i, 'browser','Work')), entry('extra','browser','IHM'), entry('extra2','browser','IHM')];
  const result = removeGroup(crowded, 'IHM');
  assert.match(result.error, /exceeds 10/);
  assert.equal(result.entries.length, crowded.length);
});

test('enforces per-level 10 maximum, detects missing parents and duplicates', () => {
  const many = [entry('Work'), ...Array.from({length:13},(_,i)=>entry('sub'+i,'group','Work'))];
  assert.match(validateHierarchy(many), /exceeds 12/);
  assert.match(validateHierarchy([entry('Orphan','browser','missing')]), /no longer exists/);
  assert.match(validateHierarchy([entry('A'),entry('A')]), /unique/);
});

test('suggests group when root is full, including for subgroups', () => {
  const allRoot = Array.from({length:10},(_,i)=>entry('G'+i));
  assert.equal(suggestParent(allRoot), 'G0');
  assert.equal(suggestParent([entry('Work')]), undefined);
});

test('cycles in legacy data cannot hang Settings listing', () => {
  const bad = [entry('A','group','B'),entry('B','group','A'),entry('C','browser','A')];
  assert.equal(flattenHierarchy(bad).length, 3);
  assert.match(validateHierarchy(bad), /cannot contain/);
});
