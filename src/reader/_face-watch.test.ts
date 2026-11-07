import { describe, expect, it } from 'vitest';
import { buttonState, nextWatching, type WatchEvent, type Watching } from './_face-watch';

const stops: WatchEvent[] = [
  { kind: 'toolbarShown' }, { kind: 'readerClosed' }, { kind: 'pageHidden' }, { kind: 'settingsOpened' },
  { kind: 'cameraFailed' }, { kind: 'gesturesChanged', available: false },
];

describe('when watching is on', () => {
  it('starts from a tap when a gesture is set, and a tap stops it', () => {
    expect(nextWatching('off', { kind: 'tap', available: true })).toBe('on');
    expect(nextWatching('on', { kind: 'tap', available: true })).toBe('off');
  });
  it('stays off for a tap when no gesture is set', () => {
    expect(nextWatching('off', { kind: 'tap', available: false })).toBe('off');
  });
  it('is stopped by each of the other events, and stays off', () => {
    for (const w of ['on', 'off'] as Watching[]) for (const e of stops) expect(nextWatching(w, e), `${w} ${e.kind}`).toBe('off');
  });
  it('is not stopped by gestures that change but are still set, and does not start by them', () => {
    expect(nextWatching('on', { kind: 'gesturesChanged', available: true })).toBe('on');
    expect(nextWatching('off', { kind: 'gesturesChanged', available: true })).toBe('off');
  });
});

describe('what the button shows', () => {
  const on = { available: true, watching: 'on' as Watching };
  it('is struck through when no gesture is set, whatever else', () => {
    expect(buttonState({ available: false, watching: 'off', camera: 'stopped', faceSeen: false })).toBe('unavailable');
  });
  it('is off while not watching', () => {
    expect(buttonState({ available: true, watching: 'off', camera: 'stopped', faceSeen: false })).toBe('off');
  });
  it('is starting until the camera runs', () => {
    expect(buttonState({ ...on, camera: 'stopped', faceSeen: false })).toBe('starting');
    expect(buttonState({ ...on, camera: 'starting', faceSeen: false })).toBe('starting');
  });
  it('is paused when the camera is', () => {
    expect(buttonState({ ...on, camera: 'paused', faceSeen: true })).toBe('paused');
  });
  it('is watching with a face, and no face without one', () => {
    expect(buttonState({ ...on, camera: 'running', faceSeen: true })).toBe('watching');
    expect(buttonState({ ...on, camera: 'running', faceSeen: false })).toBe('noFace');
  });
});
