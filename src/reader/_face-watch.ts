// When the reader watches the front camera for face gestures, and what the face button shows.
// Pure: reader.ts tells it what happened, and starts or stops the camera as the answer changes.

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
