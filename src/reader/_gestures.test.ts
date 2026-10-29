import { describe, expect, it } from 'vitest';
import { gestureForKey, isTap, turnFor, TURN_BAND_PX } from './_gestures';

const tap = (x: number) => ({ x0: x, y0: 400, x1: x, y1: 400, ms: 120 });

describe('turnFor', () => {
  it('turns in the outer 40% at each side while the toolbar is hidden, and not in the middle', () => {
    expect(turnFor(0, 1280, false)).toBe('prev');
    expect(turnFor(511, 1280, false)).toBe('prev');
    expect(turnFor(512, 1280, false)).toBeNull();
    expect(turnFor(640, 1280, false)).toBeNull();
    expect(turnFor(768, 1280, false)).toBeNull();
    expect(turnFor(769, 1280, false)).toBe('next');
    expect(turnFor(1280, 1280, false)).toBe('next');
  });
  it('turns only in the band at each side while the toolbar shows', () => {
    expect(turnFor(10, 1280, true)).toBe('prev');
    expect(turnFor(TURN_BAND_PX, 1280, true)).toBe('prev');
    expect(turnFor(1280 - TURN_BAND_PX, 1280, true)).toBe('next');
    expect(turnFor(1275, 1280, true)).toBe('next');
    expect(turnFor(TURN_BAND_PX + 1, 1280, true)).toBeNull();
    expect(turnFor(640, 1280, true)).toBeNull();
  });
});

describe('isTap', () => {
  it('takes a short press that stays put', () => {
    expect(isTap(tap(640))).toBe(true);
    expect(isTap({ ...tap(640), x1: 650 })).toBe(true);
  });
  it('leaves out long presses and drags', () => {
    expect(isTap({ ...tap(640), ms: 900 })).toBe(false);
    expect(isTap({ ...tap(640), x1: 700 })).toBe(false);
    expect(isTap({ ...tap(640), y1: 440 })).toBe(false);
  });
});

describe('gestureForKey', () => {
  it('maps common pedal keys', () => {
    expect(gestureForKey('PageDown')).toBe('next');
    expect(gestureForKey('ArrowRight')).toBe('next');
    expect(gestureForKey('PageUp')).toBe('prev');
    expect(gestureForKey('a')).toBeNull();
  });
});
