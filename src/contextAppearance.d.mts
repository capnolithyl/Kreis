export type ContextKind = 'browser' | 'folder' | 'app' | 'vivaldi-stack';
export function defaultContextAppearance(kind: ContextKind): { icon: string; color: string };
