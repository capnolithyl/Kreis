import test from 'node:test';
import assert from 'node:assert/strict';
import { passedHubDragThreshold } from '../src/hubDrag.mjs';

test('small movements are clicks, not window drags', () => {
  assert.equal(passedHubDragThreshold(100, 100, 100, 100), false);
  assert.equal(passedHubDragThreshold(100, 100, 106, 107), false);
  assert.equal(passedHubDragThreshold(100, 100, 106, 108), true);
  assert.equal(passedHubDragThreshold(100, 100, 110, 100), true);
  assert.equal(passedHubDragThreshold(100, 100, 91, 100), false);
});
