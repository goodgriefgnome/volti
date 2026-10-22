import { kv } from './idb';

export type PagesPerScreen = 1 | 2 | 'auto';

export interface Prefs {
  pagesPerScreen: PagesPerScreen;
}

const DEFAULTS: Prefs = { pagesPerScreen: 'auto' };

export async function loadPrefs(): Promise<Prefs> {
  return { ...DEFAULTS, ...((await kv.get<Partial<Prefs>>('prefs')) ?? {}) };
}

export function savePrefs(p: Prefs): Promise<void> {
  return kv.set('prefs', p);
}
