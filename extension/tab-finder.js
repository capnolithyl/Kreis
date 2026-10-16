// Pure URL matching logic. Keeping this separate makes it possible to test without Vivaldi.
export function parseWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export function tabUrls(tab) {
  return [tab.url, tab.pendingUrl].filter(value => typeof value === 'string' && value.length > 0);
}

function hostname(host) {
  return host.replace(/^www\./i, '').toLowerCase();
}

function hostMatches(actual, expected) {
  const current = hostname(actual);
  const target = hostname(expected);
  // monday.com always redirects into the organization's subdomain.
  return current === target || (target === 'monday.com' && current.endsWith('.monday.com'));
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

function sameFigmaDocument(a, b) {
  if (hostname(b.hostname) !== 'figma.com') return false;
  const pattern = /^\/(?:design|file|proto)\/([a-zA-Z0-9]+)(?:\/|$)/;
  const currentId = a.pathname.match(pattern)?.[1];
  const expectedId = b.pathname.match(pattern)?.[1];
  return Boolean(currentId && expectedId && currentId === expectedId);
}

function sameGoogleChatAccount(a, b) {
  if (hostname(b.hostname) !== 'chat.google.com') return false;
  const pattern = /^\/u\/(\d+)(?:\/|$)/;
  const current = a.pathname.match(pattern)?.[1];
  const expected = b.pathname.match(pattern)?.[1];
  return current !== undefined && current === expected;
}

export function matchesUrl(current, target, mode = 'prefix') {
  const a = parseWebUrl(current);
  const b = parseWebUrl(target);
  if (!a || !b || !hostMatches(a.hostname, b.hostname)) return false;

  if (mode === 'site') {
    return !/^\/(?:wp-admin(?:\/|$)|wp-login\.php(?:\/|$)|wp-json(?:\/|$))/i.test(a.pathname);
  }
  if (mode === 'exact') {
    return normalizePath(a.pathname) === normalizePath(b.pathname) && a.search === b.search;
  }
  if (mode !== 'prefix') return false;

  if (sameFigmaDocument(a, b) || sameGoogleChatAccount(a, b)) return true;

  const currentPath = normalizePath(a.pathname);
  const expectedPath = normalizePath(b.pathname);
  return expectedPath === '/' || currentPath === expectedPath || currentPath.startsWith(expectedPath + '/');
}

export function matchesTab(tab, target, mode) {
  return tabUrls(tab).some(current => matchesUrl(current, target, mode));
}

export function findMatchingTabs(tabs, target, mode) {
  const matching = tabs.filter(tab => Number.isInteger(tab.id) && Number.isInteger(tab.windowId) &&
    matchesTab(tab, target, mode));
  // Prefer the already-active tab, then the most recently used matching tab.
  matching.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) ||
    (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return matching;
}

export function findMatchingTab(tabs, target, mode) {
  return findMatchingTabs(tabs, target, mode)[0] || null;
}

export function lookupDiagnostics(tabs, target, mode) {
  const b = parseWebUrl(target);
  const readable = tabs.filter(tab => tabUrls(tab).some(url => parseWebUrl(url)));
  const sameHost = b ? readable.filter(tab => tabUrls(tab).some(url => {
    const parsed = parseWebUrl(url);
    return parsed && hostMatches(parsed.hostname, b.hostname);
  })) : [];
  const matching = readable.filter(tab => matchesTab(tab, target, mode));
  const hosts = [...new Set(readable.flatMap(tab => tabUrls(tab).map(url => parseWebUrl(url)?.hostname).filter(Boolean)))];
  const nearbyPaths = [...new Set(sameHost.flatMap(tab => tabUrls(tab).map(url => parseWebUrl(url)?.pathname).filter(Boolean)))];
  return {
    targetHost: b?.hostname || 'invalid URL',
    targetPath: b?.pathname || '',
    mode,
    totalTabs: tabs.length,
    readableTabs: readable.length,
    hostMatches: sameHost.length,
    urlMatches: matching.length,
    nearbyPaths: nearbyPaths.slice(0, 6),
    visibleHosts: hosts.slice(0, 12)
  };
}
