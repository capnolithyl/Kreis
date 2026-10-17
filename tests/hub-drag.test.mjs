import test from 'node:test';
import assert from 'node:assert/strict';
import { passedHubDragThreshold, clampWindowToMonitors } from '../src/hubDrag.mjs';

const monitor = (x, y, width, height) => ({
  position: { x, y }, size: { width, height }
});

test('a click or small pointer jitter must not drag the hub', () => {
  assert.equal(passedHubDragThreshold(100, 100, 100, 100), false);
  assert.equal(passedHubDragThreshold(100, 100, 106, 107), false);
  assert.equal(passedHubDragThreshold(100, 100, 106, 108), true);
  assert.equal(passedHubDragThreshold(100, 100, 110, 100), true);
  assert.equal(passedHubDragThreshold(100, 100, 91, 100), false);
});

test('window position is unchanged when it fits its monitor', () => {
  const p = { x: 300, y: 200 };
  assert.deepEqual(clampWindowToMonitors(p, { width: 600, height: 600 },
    [monitor(0, 0, 1920, 1080)]), p);
});

test('dragged window clamps to all four edges within its monitor', () => {
  const m = [monitor(0, 0, 1920, 1080)];
  const size = { width: 600, height: 600 };
  assert.deepEqual(clampWindowToMonitors({ x: -200, y: -100 }, size, m), { x: 0, y: 0 });
  assert.deepEqual(clampWindowToMonitors({ x: 1800, y: 950 }, size, m), { x: 1320, y: 480 });
});

test('dragged window stays with second monitor even if its coordinates are negative', () => {
  const m = [monitor(0, 0, 1920, 1080), monitor(-1600, 100, 1600, 900)];
  const size = { width: 600, height: 600 };
  assert.deepEqual(clampWindowToMonitors({ x: -1550, y: 950 }, size, m), { x: -1550, y: 400 });
});

test('small display clamps as much as possible and no monitors is a no-op', () => {
  const size = { width: 600, height: 600 };
  assert.deepEqual(clampWindowToMonitors({ x: 300, y: 300 }, size,
    [monitor(200, -200, 450, 400)]), { x: 200, y: -200 });
  const p = { x: 123, y: 456 };
  assert.equal(clampWindowToMonitors(p, size, []), p);
});

test('uses the nearest visible monitor when dropped into a gap in the virtual desktop', () => {
  const m = [monitor(0, 0, 1000, 1000), monitor(1500, 0, 1000, 1000)];
  assert.deepEqual(clampWindowToMonitors({ x: 1120, y: 300 },
    { width: 600, height: 600 }, m), { x: 1500, y: 300 });
});
