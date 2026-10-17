import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesUrl, findMatchingTabs, lookupDiagnostics } from '../extension/tab-finder.js';

const conversationId = '6ad2db81-71e8-83ea-b84f-bf55afd3c6ed';
const otherId = 'aaaa1111-2222-3333-4444-555555555555';
const projectUrl = `https://chatgpt.com/g/g-p-68f5011f28cc819186f2e9e68094879f-coding/c/${conversationId}`;
const canonicalUrl = `https://chatgpt.com/c/${conversationId}`;

test('same ChatGPT conversation matches project and canonical URLs in both directions', () => {
  assert.equal(matchesUrl(canonicalUrl, projectUrl, 'exact'), true);
  assert.equal(matchesUrl(projectUrl, canonicalUrl, 'exact'), true);
  assert.equal(matchesUrl(projectUrl, canonicalUrl, 'prefix'), true);
  assert.equal(matchesUrl(canonicalUrl, projectUrl, 'prefix'), true);
  assert.equal(matchesUrl(projectUrl + '/', canonicalUrl, 'exact'), true);
});

test('ChatGPT conversation matching ignores changing view-only query strings', () => {
  assert.equal(matchesUrl(canonicalUrl + '?model=some-model', projectUrl, 'exact'), true);
  assert.equal(matchesUrl(projectUrl, canonicalUrl + '?temporary=1', 'exact'), true);
});

test('never match a different ChatGPT conversation or its landing pages', () => {
  assert.equal(matchesUrl(`https://chatgpt.com/c/${otherId}`, projectUrl, 'exact'), false);
  assert.equal(matchesUrl(`https://chatgpt.com/g/g-p-xyz/c/${otherId}`, projectUrl, 'prefix'), false);
  assert.equal(matchesUrl('https://chatgpt.com/', projectUrl, 'exact'), false);
  assert.equal(matchesUrl('https://chatgpt.com/g/g-p-68f5011f28cc819186f2e9e68094879f-coding', projectUrl, 'exact'), false);
  assert.equal(matchesUrl('https://chatgpt.com/c/not-a-conversation-id', projectUrl, 'exact'), false);
  assert.equal(matchesUrl(`https://other.example/c/${conversationId}`, projectUrl, 'exact'), false);
});

test('unchanged exact matching for ordinary sites (including GitHub)', () => {
  assert.equal(matchesUrl('https://github.com/capnolithyl/Kreis/pulls', 'https://github.com/capnolithyl/Kreis/pulls', 'exact'), true);
  assert.equal(matchesUrl('https://github.com/capnolithyl/Kreis/pulls?q=is%3Aopen', 'https://github.com/capnolithyl/Kreis/pulls', 'exact'), false);
});

test('a canonical open ChatGPT tab is found when shortcut used the project route', () => {
  const tabs = [
    { id: 7, windowId: 1, url: canonicalUrl, active: false },
    { id: 8, windowId: 1, url: `https://chatgpt.com/c/${otherId}`, active: true },
    { id: 9, windowId: 2, url: 'https://github.com/capnolithyl/Kreis/pulls' }
  ];
  assert.deepEqual(findMatchingTabs(tabs, projectUrl, 'exact').map(tab => tab.id), [7]);
  assert.equal(lookupDiagnostics(tabs, projectUrl, 'exact').urlMatches, 1);
});
