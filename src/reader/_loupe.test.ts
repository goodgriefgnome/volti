import { describe, expect, it } from 'vitest';
import { LOUPE_GAP_PX, LOUPE_PX, loupeCentre, loupeTarget, magnification, sharpIsFull, sharpSide } from './_loupe';

describe('magnification', () => {
  it('shows the staff 64 px tall, but never smaller than on screen', () => {
    expect(magnification(20)).toBe(3.2);
    expect(magnification(80)).toBe(1);
  });
});

describe('loupeTarget', () => {
  it('is the middle of the ink box both ways', () => {
    expect(loupeTarget({ x0: 100, y0: 200, x1: 140, y1: 216 })).toEqual({ x: 120, y: 208 });
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

describe('sharpSide', () => {
  it('reaches 256 px beyond what the loupe shows, while that fits in 2048 device pixels', () => {
    expect(sharpSide(LOUPE_PX, 1, 1)).toBeCloseTo(LOUPE_PX + 512);
  });
  it('is at most 2048 device pixels across', () => {
    expect(sharpSide(LOUPE_PX / 8, 8, 3) * 8 * 3).toBeCloseTo(2048);
  });
});

describe('sharpIsFull', () => {
  it('is false while the region can keep the loupe 64 px from its edge', () => {
    expect(sharpIsFull(3, 2)).toBe(false);
    expect(sharpIsFull(4, 3)).toBe(false);
  });
  it('is true above about 16 / dpr - 1 magnification: 7x at 2 device pixels per CSS pixel, 4.3x at 3', () => {
    expect(sharpIsFull(6.9, 2)).toBe(false);
    expect(sharpIsFull(7.1, 2)).toBe(true);
    expect(sharpIsFull(4.2, 3)).toBe(false);
    expect(sharpIsFull(4.4, 3)).toBe(true);
  });
});
