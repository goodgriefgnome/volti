// What the face button shows, from whether watching is on and what the camera and its watcher
// say. Pure; the reader and the settings dialog both use it.

import type { CameraStatus } from './watcher';

export type FaceButtonStatus = 'unavailable' | 'off' | 'starting' | 'watching' | 'noFace' | 'paused';

/** What the button shows. */
export function buttonStatus(o: { available: boolean; watching: 'off' | 'on'; camera: CameraStatus; faceSeen: boolean }): FaceButtonStatus {
  if (!o.available) return 'unavailable';
  if (o.watching === 'off') return 'off';
  if (o.camera === 'paused') return 'paused';
  if (o.camera !== 'running') return 'starting';
  return o.faceSeen ? 'watching' : 'noFace';
}
