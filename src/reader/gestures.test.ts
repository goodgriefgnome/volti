import { describe, expect, it } from 'vitest';
import { gestureFor, gestureForKey } from './gestures';

const tap = (x: number) => ({ x0: x, y0: 400, x1: x, y1: 400, ms: 120 });

describe('gestureFor', () => {
  it('turns forward when tapping the right side and back on the left', () => {
    expect(gestureFor(tap(1200), 1280)).toBe('next');
    expect(gestureFor(tap(80), 1280)).toBe('prev');
  });
  it('shows the toolbar when tapping the middle', () => {
    expect(gestureFor(tap(640), 1280)).toBe('toggleChrome');
  });
  it('turns on a horizontal swipe', () => {
    expect(gestureFor({ x0: 900, y0: 400, x1: 700, y1: 420, ms: 200 }, 1280)).toBe('next');
    expect(gestureFor({ x0: 300, y0: 400, x1: 500, y1: 380, ms: 200 }, 1280)).toBe('prev');
  });
  it('ignores long presses and vertical drags', () => {
    expect(gestureFor({ ...tap(1200), ms: 900 }, 1280)).toBeNull();
    expect(gestureFor({ x0: 600, y0: 200, x1: 640, y1: 600, ms: 200 }, 1280)).toBeNull();
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
