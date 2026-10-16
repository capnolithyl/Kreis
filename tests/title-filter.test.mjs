import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByTitle } from '../src/titleFilter.mjs';

const tabs = [
  { id: 1, windowId: 9, title: 'IHM | ChatGPT planning' },
  { id: 2, windowId: 4, title: 'Runagaldr | ChatGPT review' },
  { id: 3, windowId: 5, title: 'ChatGPT: debugging IHM blocks' },
  { id: 4, windowId: 6, title: 'General ChatGPT' }
];

test('filter title substring regardless of casing and position in the title', () => {
  assert.deepEqual(filterByTitle(tabs, 'ihm').map(tab => tab.id), [1, 3]);
  assert.deepEqual(filterByTitle(tabs, 'IHM').map(tab => tab.id), [1, 3]);
  assert.deepEqual(filterByTitle(tabs, '  IhM  ').map(tab => tab.id), [1, 3]);
});

test('empty optional title filter retains the existing all-tabs behavior', () => {
  assert.strictEqual(filterByTitle(tabs, ''), tabs);
  assert.strictEqual(filterByTitle(tabs), tabs);
  assert.strictEqual(filterByTitle(tabs, '   '), tabs);
});

test('no matching title returns an empty set instead of an unrelated tab', () => {
  assert.deepEqual(filterByTitle(tabs, 'DiscoverMass'), []);
});

test('matching keeps tab IDs, window IDs and titles intact', () => {
  assert.deepEqual(filterByTitle(tabs, 'Runagaldr'), [tabs[1]]);
});
