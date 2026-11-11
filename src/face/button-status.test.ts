import { describe, expect, it } from 'vitest';
import { buttonStatus } from './button-status';

describe('what the button shows', () => {
  const on = { available: true, watching: 'on' as const };
  it('is struck through when no gesture is set, whatever else', () => {
    expect(buttonStatus({ available: false, watching: 'off', camera: 'stopped', faceSeen: false })).toBe('unavailable');
  });
  it('is off while not watching', () => {
    expect(buttonStatus({ available: true, watching: 'off', camera: 'stopped', faceSeen: false })).toBe('off');
  });
  it('is starting until the camera runs', () => {
    expect(buttonStatus({ ...on, camera: 'stopped', faceSeen: false })).toBe('starting');
    expect(buttonStatus({ ...on, camera: 'starting', faceSeen: false })).toBe('starting');
  });
  it('is paused when the camera is', () => {
    expect(buttonStatus({ ...on, camera: 'paused', faceSeen: true })).toBe('paused');
  });
  it('is watching with a face, and no face without one', () => {
    expect(buttonStatus({ ...on, camera: 'running', faceSeen: true })).toBe('watching');
    expect(buttonStatus({ ...on, camera: 'running', faceSeen: false })).toBe('noFace');
  });
});
