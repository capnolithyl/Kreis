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
