// The face gestures' settings and trials in the kv store. The only place face/ touches storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { faceSettingsFrom, withFit, type FaceSettings } from './gestures';
import { build, FIT_VERSION } from './_model';
import type { Trial } from './_recording';
import { settled } from './_settling';

export const saveFaceSettings = (s: FaceSettings) => kv.set(keys.faceGestures, s);

/** A gesture's trials; none stored is none. */
export async function loadTrials(id: string): Promise<Trial[]> {
  return (await kv.get<Trial[]>(keys.faceTrials(id))) ?? [];
}

/** A gesture's trials; an empty list deletes the key. */
export function saveTrials(id: string, trials: Trial[]): Promise<void> {
  return trials.length ? kv.set(keys.faceTrials(id), trials) : deleteTrials(id);
}

export const deleteTrials = (id: string) => kv.del(keys.faceTrials(id));

/** Every gesture fitted again from its stored trials, levels by hand dropped, and conflicts settled. */
export async function refit(s: FaceSettings): Promise<FaceSettings> {
  const trialsOf = new Map<string, Trial[]>();
  const fitted: FaceSettings = { gestures: [] };
  for (const g of s.gestures) {
    const trials = await loadTrials(g.id);
    trialsOf.set(g.id, trials);
    fitted.gestures.push(withFit(g, build(trials)));
  }
  return settled(fitted, trialsOf);
}

/** The stored settings; gestures fitted by an earlier version of the fitting are fitted again, and saved. */
export async function loadFaceSettings(): Promise<FaceSettings> {
  const s = faceSettingsFrom(await kv.get(keys.faceGestures));
  if (s.gestures.every((g) => g.fit.version === FIT_VERSION)) return s;
  const again = await refit(s);
  await saveFaceSettings(again);
  return again;
}
