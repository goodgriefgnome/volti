// When the reader watches the front camera for face gestures, and what the face button shows.
// Pure: reader.ts tells it what happened, and starts or stops the camera as the answer changes.

import type { FaceButtonState } from '../face/face-button';
import type { CameraStatus } from '../face/watcher';

export type Watching = 'off' | 'on';

export type WatchEvent =
  | { kind: 'tap'; available: boolean }
  | { kind: 'toolbarShown' } | { kind: 'readerClosed' } | { kind: 'pageHidden' }
  | { kind: 'settingsOpened' } | { kind: 'cameraFailed' } | { kind: 'gesturesChanged'; available: boolean };

/** Whether watching is on after `e`: it starts only from a tap, and every other event but a still usable set of gestures stops it. */
export function nextWatching(w: Watching, e: WatchEvent): Watching {
  switch (e.kind) {
    case 'tap': return w === 'on' ? 'off' : e.available ? 'on' : 'off';
    case 'gesturesChanged': return e.available ? w : 'off';
    default: return 'off';
  }
}

/** What the button shows. */
export function buttonState(o: { available: boolean; watching: Watching; camera: CameraStatus; faceSeen: boolean }): FaceButtonState {
  if (!o.available) return 'unavailable';
  if (o.watching === 'off') return 'off';
  if (o.camera === 'paused') return 'paused';
  if (o.camera !== 'running') return 'starting';
  return o.faceSeen ? 'watching' : 'noFace';
}
