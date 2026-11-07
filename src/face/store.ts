// The face gestures' settings in the kv store. The only place face/ touches storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { faceSettingsFrom, type FaceSettings } from './gestures';

export async function loadFaceSettings(): Promise<FaceSettings> {
  return faceSettingsFrom(await kv.get(keys.faceGestures));
}

export const saveFaceSettings = (s: FaceSettings) => kv.set(keys.faceGestures, s);
