export type ContextKind = 'browser' | 'folder' | 'app';
export function defaultContextAppearance(kind: ContextKind): { icon: string; color: string };
