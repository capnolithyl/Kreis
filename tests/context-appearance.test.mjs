import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultContextAppearance } from '../src/contextAppearance.mjs';

test('Add to Kreis keeps the established defaults for each context target', () => {
  assert.deepEqual(defaultContextAppearance('browser'), { icon: 'globe', color: '#6385d7' });
  assert.deepEqual(defaultContextAppearance('vivaldi-stack'), { icon: 'layers', color: '#6a8ec2' });
  assert.deepEqual(defaultContextAppearance('folder'), { icon: 'folder', color: '#c1a062' });
  assert.deepEqual(defaultContextAppearance('app'), { icon: 'rocket', color: '#438ba8' });
});

test('each Add to Kreis request receives an independent appearance draft', () => {
  const first = defaultContextAppearance('browser');
  first.icon = 'github';
  first.color = '#123456';
  assert.deepEqual(defaultContextAppearance('browser'), { icon: 'globe', color: '#6385d7' });
  assert.notStrictEqual(first, defaultContextAppearance('browser'));
});
