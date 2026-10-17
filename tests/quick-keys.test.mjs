import test from 'node:test';
import assert from 'node:assert/strict';
import { quickKeyForIndex, sliceIndexForKey, isHubQuickKey } from '../src/quickKeys.mjs';

test('assigns 1–9 and 0 to first ten displayed slices', () => {
  const keys = Array.from({length: 10}, (_, i) => quickKeyForIndex(i));
  assert.deepEqual(keys, ['1','2','3','4','5','6','7','8','9','0']);
  assert.equal(quickKeyForIndex(10), null);
  assert.equal(quickKeyForIndex(-1), null);
});

test('digits select the corresponding visible slice on every wheel size', () => {
  for (let size = 1; size <= 12; size++) {
    for (let index = 0; index < Math.min(10,size); index++) {
      assert.equal(sliceIndexForKey(quickKeyForIndex(index), size), index);
    }
    if (size < 10) assert.equal(sliceIndexForKey('0',size), null);
  }
});

test('unknown keys and keys without corresponding slices do nothing', () => {
  for (const key of ['F1','10','Numpad1','-','a',' ','ArrowDown','']) {
    assert.equal(sliceIndexForKey(key,12), null);
  }
  assert.equal(sliceIndexForKey('5',3), null);
  assert.equal(sliceIndexForKey('1',0), null);
  assert.equal(sliceIndexForKey('1',NaN), null);
});

test('backtick selects the hub for either the physical key or character', () => {
  assert.equal(isHubQuickKey('`', 'Unidentified'), true);
  assert.equal(isHubQuickKey('Dead', 'Backquote'), true);
  assert.equal(isHubQuickKey('`', 'Backquote'), true);
  assert.equal(isHubQuickKey('0', 'Digit0'), false);
  assert.equal(isHubQuickKey('1', 'Digit1'), false);
  assert.equal(isHubQuickKey('Backspace', 'Backspace'), false);
});
