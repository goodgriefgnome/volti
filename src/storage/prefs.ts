// Settings that apply across the app (such as pages per screen), with their defaults, loaded and
// saved as one record.

import { keys } from './keys';
import { kv } from './kv';

export type PagesPerScreen = 1 | 2 | 'auto';

export interface Prefs {
  pagesPerScreen: PagesPerScreen;
}

const DEFAULTS: Prefs = { pagesPerScreen: 'auto' };

export async function loadPrefs(): Promise<Prefs> {
  return { ...DEFAULTS, ...((await kv.get<Partial<Prefs>>(keys.prefs)) ?? {}) };
}

export function savePrefs(p: Prefs): Promise<void> {
  return kv.set(keys.prefs, p);
}
