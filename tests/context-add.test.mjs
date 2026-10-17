import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextMenuPayload } from '../extension/context-add.js';

test('right-clicked link captures its URL, not the page URL', () => {
  const item = contextMenuPayload({ menuItemId: 'kreis-add-link', linkUrl: 'https://example.com/docs/hello%20world', pageUrl: 'https://elsewhere.test/' },
    { title: 'Current page' });
  assert.equal(item.url, 'https://example.com/docs/hello%20world');
  assert.equal(item.title, 'example.com · hello world');
});
test('right-clicked page captures title and URL', () => {
  const item = contextMenuPayload({ menuItemId: 'kreis-add-page', pageUrl: 'https://example.com/page' }, { title: 'My page' });
  assert.equal(item.title, 'My page');
  assert.equal(item.url, 'https://example.com/page');
});
test('rejects unsafe URL schemes and malformed values', () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/Users/', 'chrome://settings', 'not-a-url']) {
    assert.equal(contextMenuPayload({ menuItemId: 'kreis-add-link', linkUrl: url }), null);
  }
});
test('ignores unrelated context events and handles bad percent escapes', () => {
  assert.equal(contextMenuPayload({ menuItemId: 'other-menu', linkUrl: 'https://example.com/' }), null);
  assert.equal(contextMenuPayload({ menuItemId: 'kreis-add-link', linkUrl: 'https://example.com/%ZZ' }).title, 'example.com · %ZZ');
});
