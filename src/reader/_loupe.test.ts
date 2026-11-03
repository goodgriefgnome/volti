import { describe, expect, it } from 'vitest';
import { LOUPE_GAP_PX, LOUPE_PX, loupeCentre, loupeTarget, magnification } from './_loupe';

describe('magnification', () => {
  it('shows the ink 48 px tall, but never smaller than on screen', () => {
    expect(magnification(16)).toBe(3);
    expect(magnification(60)).toBe(1);
  });
});

describe('loupeTarget', () => {
  it('is half the ink height in from the left, at the middle', () => {
    expect(loupeTarget({ x0: 100, y0: 200, x1: 140, y1: 216 })).toEqual({ x: 108, y: 208 });
  });
  it('is the middle across for ink narrower than tall', () => {
    expect(loupeTarget({ x0: 100, y0: 200, x1: 110, y1: 216 })).toEqual({ x: 105, y: 208 });
  });
});

describe('loupeCentre', () => {
  it('is above the finger, its bottom edge LOUPE_GAP_PX over it', () => {
    expect(loupeCentre({ x: 500, y: 600 }, 80, 1000)).toEqual({ x: 500, y: 600 - LOUPE_GAP_PX - LOUPE_PX / 2 });
  });
  it('is beside the finger, at its height, to the left, when above would be under the bar', () => {
    const c = loupeCentre({ x: 500, y: 150 }, 80, 1000);
    expect(c.y).toBe(150);
    expect(c.x).toBeLessThan(500);
  });
  it('is to the right of the finger when there is no room on the left', () => {
    const c = loupeCentre({ x: 100, y: 150 }, 80, 1000);
    expect(c.y).toBe(150);
    expect(c.x).toBeGreaterThan(100);
  });
  it('stays on the screen', () => {
    expect(loupeCentre({ x: 5, y: 600 }, 80, 1000).x).toBe(LOUPE_PX / 2);
    expect(loupeCentre({ x: 995, y: 600 }, 80, 1000).x).toBe(1000 - LOUPE_PX / 2);
  });
});
