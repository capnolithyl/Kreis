import test from 'node:test';
import assert from 'node:assert/strict';
import { hsvToHex, hexToHsv, parseHexColor } from '../src/wheelColor.mjs';

test('validates expanded shorthand and complete hex colors', () => {
  assert.equal(parseHexColor('abc'), '#aabbcc');
  assert.equal(parseHexColor(' #aBcDEF '), '#abcdef');
  for (const color of ['', '#zzzzzz', '#1234', '#1234567', 'rgb(0,0,0)']) {
    assert.equal(parseHexColor(color), null);
  }
});

test('round-trips primary colors, greys, and arbitrary hex values', () => {
  for (const color of ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080', '#438ba8', '#6385d7', '#123456']) {
    assert.equal(hsvToHex(hexToHsv(color)), color);
  }
});

test('handles hue rotation and clamps saturation and brightness', () => {
  assert.equal(hsvToHex({ h: 0, s: 100, v: 100 }), '#ff0000');
  assert.equal(hsvToHex({ h: 120, s: 100, v: 100 }), '#00ff00');
  assert.equal(hsvToHex({ h: 240, s: 100, v: 100 }), '#0000ff');
  assert.equal(hsvToHex({ h: -120, s: 100, v: 100 }), '#0000ff');
  assert.equal(hsvToHex({ h: 720, s: 0, v: 300 }), '#ffffff');
  assert.equal(hsvToHex({ h: 0, s: 100, v: -5 }), '#000000');
});
