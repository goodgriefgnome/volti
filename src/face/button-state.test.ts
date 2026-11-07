import { describe, expect, it } from 'vitest';
import { buttonState } from './button-state';

describe('what the button shows', () => {
  const on = { available: true, watching: 'on' as const };
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
