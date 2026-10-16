import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesUrl, findMatchingTab, findMatchingTabs, lookupDiagnostics } from './tab-finder.js';

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

test('groups different ChatGPT conversation URLs while keeping unrelated websites out', () => {
  const root = 'https://chatgpt.com/';
  const tabs = [
    { id: 11, windowId: 1, title: 'IHM', url: 'https://chatgpt.com/g/g-p-123/ihm' },
    { id: 12, windowId: 2, title: 'Runagaldr', url: 'https://chatgpt.com/c/abc123' },
    { id: 13, windowId: 3, title: 'General', pendingUrl: 'https://chatgpt.com/' },
    { id: 14, windowId: 3, title: 'Docs', url: 'https://docs.google.com/' }
  ];
  assert.deepEqual(findMatchingTabs(tabs, root, 'prefix').map(tab => tab.id), [11, 12, 13]);
  assert.equal(findMatchingTabs(tabs, 'https://chatgpt.com/c/abc123', 'exact').length, 1);
});

test('retains separate tabs even when titles or URLs are identical', () => {
  const tabs = [
    { id: 8, windowId: 4, title: 'ChatGPT', url: 'https://chatgpt.com/', active: false },
    { id: 9, windowId: 5, title: 'ChatGPT', url: 'https://chatgpt.com/', active: true }
  ];
  assert.deepEqual(findMatchingTabs(tabs, 'https://chatgpt.com/', 'prefix').map(tab => tab.id), [9, 8]);
});

test('nested wheel can paginate all matching tabs rather than truncating at 8', () => {
  const tabs = Array.from({ length: 19 }, (_, i) => ({
    id: i + 1, windowId: i % 3, title: 'Conversation ' + i,
    url: 'https://chatgpt.com/c/' + i, lastAccessed: i
  }));
  const matches = findMatchingTabs(tabs, 'https://chatgpt.com/', 'prefix');
  assert.equal(matches.length, 19);
  const pages = Array.from({ length: Math.ceil(matches.length / 7) }, (_, page) =>
    matches.slice(page * 7, (page + 1) * 7));
  assert.deepEqual(pages.map(page => page.length), [7, 7, 5]);
  assert.equal(new Set(pages.flat().map(tab => tab.id)).size, 19);
});

test('WordPress backend group does not include public pages', () => {
  const tabs = [
    { id: 1, windowId: 2, url: 'https://ihmcfo.diocesanweb.org/wp-admin/post.php' },
    { id: 2, windowId: 2, url: 'https://ihmcfo.diocesanweb.org/about-us/' },
    { id: 3, windowId: 1, url: 'https://othersite.example/wp-admin/' }
  ];
  const matches = findMatchingTabs(tabs, 'https://ihmcfo.diocesanweb.org/wp-admin/', 'prefix');
  assert.deepEqual(matches.map(tab => tab.id), [1]);
});
