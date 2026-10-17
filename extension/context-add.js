/** Pure, testable browser context-menu payload normalization. */
export function contextMenuPayload(info, tab) {
  const url = info?.menuItemId === 'kreis-add-link' ? info.linkUrl
    : info?.menuItemId === 'kreis-add-page' ? info.pageUrl : null;
  if (typeof url !== 'string' || url.length > 4096) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  let title = tab?.title || parsed.hostname;
  if (info.menuItemId === 'kreis-add-link') {
    const part = parsed.pathname.split('/').filter(Boolean).at(-1);
    let tail = '';
    if (part) {
      try { tail = decodeURIComponent(part); } catch { tail = part; }
    }
    title = parsed.hostname + (tail ? ' · ' + tail : '');
  }
  return { url: parsed.href, title: title.slice(0, 100), at: Date.now() };
}
