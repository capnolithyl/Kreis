/** Defaults for new context-menu shortcuts only. Existing entries are untouched. */
const appearanceByKind = {
  browser: { icon: 'globe', color: '#6385d7' },
  'vivaldi-stack': { icon: 'layers', color: '#6a8ec2' },
  folder: { icon: 'folder', color: '#c1a062' },
  app: { icon: 'rocket', color: '#438ba8' }
};

/** Return a new draft for each Add to Kreis request, never a shared mutable object. */
export function defaultContextAppearance(kind) {
  return { ...(appearanceByKind[kind] || appearanceByKind.browser) };
}
