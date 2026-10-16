import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesUrl, findMatchingTab, lookupDiagnostics } from './tab-finder.js';

test('WordPress frontend ignores wp-admin pages', () => {
  const root = 'https://ihmcfo.diocesanweb.org/';
  assert.equal(matchesUrl(root + 'our-parish/', root, 'site'), true);
  assert.equal(matchesUrl(root + 'wp-admin/post.php?post=42', root, 'site'), false);
  assert.equal(matchesUrl(root + 'wp-login.php', root, 'site'), false);
  assert.equal(matchesUrl(root + 'wp-json/', root, 'site'), false);
});

test('WordPress backend matches admin subpages', () => {
  assert.equal(matchesUrl('https://ihmcfo.diocesanweb.org/wp-admin/post.php?post=42',
    'https://ihmcfo.diocesanweb.org/wp-admin/', 'prefix'), true);
  assert.equal(matchesUrl('https://ihmcfo.diocesanweb.org/wp-admin-foo',
    'https://ihmcfo.diocesanweb.org/wp-admin/', 'prefix'), false);
});

test('Google Chat matches the same account after client redirects', () => {
  assert.equal(matchesUrl('https://chat.google.com/u/0/#chat/home',
    'https://chat.google.com/u/0/app/home', 'prefix'), true);
  assert.equal(matchesUrl('https://chat.google.com/u/1/app/home',
    'https://chat.google.com/u/0/app/home', 'prefix'), false);
});

test('Figma keeps its document identity across changed routes and slugs', () => {
  assert.equal(matchesUrl('https://www.figma.com/design/AB123456/Another-name?node-id=9',
    'https://www.figma.com/design/AB123456/Old-name?node-id=1', 'prefix'), true);
  assert.equal(matchesUrl('https://www.figma.com/design/XY9876/Old-name',
    'https://www.figma.com/design/AB123456/Old-name', 'prefix'), false);
});

test('monday account subdomains match homepage shortcut', () => {
  assert.equal(matchesUrl('https://diocesan.monday.com/boards/123', 'https://monday.com/', 'prefix'), true);
  assert.equal(matchesUrl('https://notmonday.com/boards/123', 'https://monday.com/', 'prefix'), false);
});

test('exact requires matching URL path and query but ignores fragment', () => {
  assert.equal(matchesUrl('https://example.com/path/?id=1#section', 'https://example.com/path?id=1', 'exact'), true);
  assert.equal(matchesUrl('https://example.com/path?id=2', 'https://example.com/path?id=1', 'exact'), false);
});

test('returns active, recently used matching tab from all browser windows', () => {
  const tabs = [
    { id: 1, windowId: 1, url: 'https://example.com/foo', lastAccessed: 100 },
    { id: 2, windowId: 2, pendingUrl: 'https://example.com/bar', active: true, lastAccessed: 1 },
    { id: 3, windowId: 3, url: 'https://example.com/', lastAccessed: 300 }
  ];
  assert.equal(findMatchingTab(tabs, 'https://example.com/', 'prefix')?.id, 2);
});

test('reports unmatched same-host tabs without exposing query strings', () => {
  const report = lookupDiagnostics([{ id: 1, windowId: 1, url: 'https://example.com/other?secret=abc' }],
    'https://example.com/target?private=1', 'prefix');
  assert.equal(report.totalTabs, 1);
  assert.equal(report.readableTabs, 1);
  assert.equal(report.hostMatches, 1);
  assert.equal(report.urlMatches, 0);
  assert.deepEqual(report.nearbyPaths, ['/other']);
  assert.equal(JSON.stringify(report).includes('secret'), false);
});
