export type TargetType = 'browser' | 'app';
export type Profile = 'Work' | 'Personal';
export type MatchMode = 'exact' | 'prefix' | 'site';
export type Entry = {
  id: string;
  title: string;
  type: TargetType;
  target: string;
  profile: Profile;
  match: MatchMode;
  icon: string;
  color: string;
};
export type Settings = { shortcut: string; entries: Entry[] };

export const DEFAULT_SETTINGS: Settings = {
  shortcut: 'Control+Space',
  entries: [
    { id: 'chat', title: 'Google Chat', type: 'browser', target: 'https://chat.google.com/u/0/app/home', profile: 'Work', match: 'prefix', icon: 'message', color: '#47a66a' },
    { id: 'frontend', title: 'Frontend', type: 'browser', target: 'https://ihmcfo.diocesanweb.org/', profile: 'Work', match: 'site', icon: 'globe', color: '#448bd4' },
    { id: 'backend', title: 'Backend', type: 'browser', target: 'https://ihmcfo.diocesanweb.org/wp-admin/', profile: 'Work', match: 'prefix', icon: 'panel', color: '#697ce5' },
    { id: 'figma', title: 'Figma', type: 'browser', target: 'https://www.figma.com/design/XkSF8tgLt9sTZluYbOPvl6/Immaculate-Heart-of-Mary-%7C-Cuyahoga--OH?node-id=456-911&m=dev', profile: 'Work', match: 'prefix', icon: 'figma', color: '#bd69c6' },
    { id: 'vscode', title: 'VS Code', type: 'app', target: 'Code.exe', profile: 'Work', match: 'exact', icon: 'code', color: '#438ba8' },
    { id: 'mail', title: 'Gmail', type: 'browser', target: 'https://mail.google.com/', profile: 'Work', match: 'prefix', icon: 'mail', color: '#d98c45' },
    { id: 'monday', title: 'monday.com', type: 'browser', target: 'https://monday.com/', profile: 'Work', match: 'prefix', icon: 'columns', color: '#c75b83' },
    { id: 'calendar', title: 'Calendar', type: 'browser', target: 'https://calendar.google.com/', profile: 'Work', match: 'prefix', icon: 'calendar', color: '#648c9f' }
  ]
};

export function validateEntry(entry: Entry): string | null {
  if (!entry.title.trim()) return 'Please enter a label.';
  if (!entry.target.trim()) return 'Please enter a URL or executable.';
  if (entry.type === 'browser') {
    try {
      const parsed = new URL(entry.target);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Only HTTP and HTTPS URLs are supported.';
    } catch { return 'Enter a valid URL including https://'; }
  }
  return null;
}
