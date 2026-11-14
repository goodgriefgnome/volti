// The face gestures' settings and trials in the kv store. The only place face/ touches storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { faceSettingsFrom, withFit, type FaceSettings } from './gestures';
import { buildFit, FIT_VERSION } from './_fit';
import type { Trial } from './_recording';
import { settled } from './_settling';

/** The page recordings play over: a page of a score in the library (from 0), or empty staves. */
export type RecordingPage = { scoreId: string; page: number } | { empty: true };

/** The page picked last; none until one is picked. */
export const loadRecordingPage = () => kv.get<RecordingPage>(keys.faceRecordingPage);
export const saveRecordingPage = (p: RecordingPage) => kv.set(keys.faceRecordingPage, p);

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

/** Disable or enable one of a gesture's trials (`index` in stored order); gives its trials as saved. */
export async function setTrialDisabled(id: string, index: number, disabled: boolean): Promise<Trial[]> {
  const trials = await loadTrials(id);
  const t = trials[index];
  if (!t) return trials;
  const { disabled: _was, ...rest } = t;
  trials[index] = disabled ? { ...rest, disabled: true } : rest;
  await saveTrials(id, trials);
  return trials;
}

/** Delete a gesture's disabled trials for good; gives the trials left. */
export async function deleteDisabledTrials(id: string): Promise<Trial[]> {
  const trials = (await loadTrials(id)).filter((t) => !t.disabled);
  await saveTrials(id, trials);
  return trials;
}

/** Every gesture fitted again from its enabled trials, On by hand dropped, and conflicts settled. */
export async function refit(s: FaceSettings): Promise<FaceSettings> {
  const trialsOf = new Map<string, Trial[]>();
  const fitted: FaceSettings = { ...s, gestures: [] };
  for (const g of s.gestures) {
    const trials = await loadTrials(g.id);
    trialsOf.set(g.id, trials);
    fitted.gestures.push(withFit(g, buildFit(trials, g.channels)));
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
