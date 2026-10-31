/** Pure browser-profile/domain grouping for the ephemeral Live Tabs wheel.
 * No browser history is saved. Every root activation requests fresh tab data.
 */
export function tabDomain(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // Keep subdomains distinct (mail.google.com vs calendar.google.com), but
    // normalize the conventional www. prefix.
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return null; }
}

/** Human-readable fallback when no useful page title is available.
 * Browser titles are preferable, but sites can omit them or briefly expose a URL.
 */
export function siteLabel(domain) {
  const host = String(domain || '').toLowerCase().replace(/^www\./, '');
  const known = {
    'chatgpt.com': 'ChatGPT',
    'github.com': 'GitHub',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'figma.com': 'Figma',
    'mail.google.com': 'Gmail',
    'chat.google.com': 'Google Chat',
    'calendar.google.com': 'Google Calendar',
    'drive.google.com': 'Google Drive',
    'docs.google.com': 'Google Docs',
    'meet.google.com': 'Google Meet',
    'monday.com': 'monday.com',
    'www.monday.com': 'monday.com',
    'discovermass.com': 'DiscoverMass',
    'runagaldr.com': 'Runagaldr'
  };
  if (known[host]) return known[host];
  const parts = host.split('.');
  // Use a meaningful subdomain where possible; e.g. issues.example.org -> Issues.
  const word = parts.length > 2 ? parts[0] : parts[0] || host;
  const spaced = word.replace(/[-_]+/g, ' ').trim();
  if (!spaced) return host || 'Website';
  if (/^[a-z]{1,4}$/.test(spaced)) return spaced.toUpperCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function cleanTitle(value) {
  if (typeof value !== 'string') return '';
  const title = value.replace(/\s+/g, ' ').trim();
  if (!title || /^(?:untitled(?: tab)?|new tab|loading(?:\.{3}|…)?|about:blank)$/i.test(title))
    return '';
  if (/^https?:\/\//i.test(title)) return '';
  return title;
}

function titleSuffix(title) {
  // Browser pages often end with a consistent site label:
  // "Pull request #123 · GitHub", "Funny video - YouTube".
  const match = title.match(/\s(?:\||[-–—])\s([^|–—]{2,48})$/);
  return match ? match[1].trim() : '';
}

function trimSiteSuffix(title, domain) {
  const suffix = titleSuffix(title);
  if (!suffix) return title;
  const brand = siteLabel(domain);
  // Only trim if we can establish that the suffix identifies the website.
  // Otherwise, a page's own descriptive heading may be lost.
  const aliases = new Set([brand.toLowerCase(), domain.toLowerCase(),
    domain.replace(/^www\./, '').split('.')[0].toLowerCase()]);
  if (!aliases.has(suffix.toLowerCase())) return title;
  return title.slice(0, title.length - suffix.length).replace(/\s(?:\||[-–—])\s$/, '').trim() || title;
}

function pathFallback(url, domain) {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean);
    const segment = path[path.length - 1] || '';
    // A long opaque ID, "edit", and similarly generic segments are not labels.
    if (!segment || /^(edit|view|home|index|login|dashboard)$/i.test(segment) ||
      /^[a-f0-9-]{20,}$/i.test(segment)) return siteLabel(domain);
    const decoded = decodeURIComponent(segment).replace(/\.html?$/i, '')
      .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!decoded || decoded.length > 64 || !/[a-z]/i.test(decoded))
      return siteLabel(domain);
    return decoded.charAt(0).toUpperCase() + decoded.slice(1);
  } catch {
    return siteLabel(domain);
  }
}

/** Compact text for a single tab's wedge; the original title and URL
 * remain available in the tooltip. Never show a full URL as the wedge label.
 */
export function liveTabLabel(tab, domain = tabDomain(tab?.url)) {
  const title = cleanTitle(tab?.title);
  if (title) return trimSiteSuffix(title, domain || '');
  return pathFallback(tab?.url, domain || '');
}

/** An individual tab can use its own title. A domain group containing several
 * distinct tabs must not be misleadingly named after one arbitrary tab.
 */
export function liveDomainLabel(domain, tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) return siteLabel(domain);
  if (tabs.length === 1) return liveTabLabel(tabs[0], domain);
  const candidates = tabs.map(tab => titleSuffix(cleanTitle(tab.title)))
    .filter(suffix => suffix && !/^https?:\/\//i.test(suffix));
  const counts = new Map();
  for (const candidate of candidates) {
    const key = candidate.toLocaleLowerCase();
    const old = counts.get(key);
    counts.set(key, {label: old?.label || candidate, count: (old?.count || 0) + 1});
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count >= Math.max(2, Math.ceil(tabs.length * 0.6))
    ? best.label : siteLabel(domain);
}

/** Snapshot entries: [{profile: {id,name,browserId}, tabs: [] | null}].
 * null means disconnected / failed request; an empty array means connected
 * with no readable web tabs.
 */
export function groupLiveTabs(results) {
  const profiles = [];
  const unavailable = [];
  for (const result of results) {
    const profile = result.profile;
    if (result.tabs === null) {
      unavailable.push(profile.name + ' (' + profile.browserId + ')');
      continue;
    }
    const domains = new Map();
    const seen = new Set();
    for (const tab of result.tabs || []) {
      if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) continue;
      if (tab.id < 0 || tab.windowId < 0 || seen.has(tab.id)) continue;
      seen.add(tab.id);
      const domain = tabDomain(tab.url);
      if (!domain) continue;
      if (!domains.has(domain)) domains.set(domain, []);
      domains.get(domain).push({
        id: tab.id, windowId: tab.windowId,
        title: typeof tab.title === 'string' ? tab.title : '',
        url: tab.url
      });
    }
    if (!domains.size) continue;
    const grouped = [...domains].map(([domain, tabs]) => ({
      domain,
      tabs: tabs.sort((a, b) => a.title.localeCompare(b.title))
    })).sort((a, b) => b.tabs.length - a.tabs.length ||
      a.domain.localeCompare(b.domain));
    profiles.push({
      profile, domains: grouped,
      tabCount: grouped.reduce((sum, group) => sum + group.tabs.length, 0)
    });
  }
  return {profiles, unavailable};
}
