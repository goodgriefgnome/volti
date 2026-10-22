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

/** Where you left off in each score. */
export const lastPage = {
  get: async (scoreId: string) => (await kv.get<number>('page:' + scoreId)) ?? 1,
  set: (scoreId: string, page: number) => kv.set('page:' + scoreId, page),
};
