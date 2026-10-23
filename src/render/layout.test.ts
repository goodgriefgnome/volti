import { describe, expect, it } from 'vitest';
import { A4 } from '../scores/model';
import { framesOnScreen, placeFrames, sideBySide } from './layout';

const LETTER = 11 / 8.5, WIDE = 1 / A4;

describe('framesOnScreen', () => {
  it('shows one frame of the screen\'s own orientation, two of the other', () => {
    expect(framesOnScreen(A4, 800, 1280)).toBe(1);
    expect(framesOnScreen(A4, 1280, 800)).toBe(2);
    expect(framesOnScreen(WIDE, 1280, 800)).toBe(1);
    expect(framesOnScreen(WIDE, 800, 1280)).toBe(2);
  });
  it('sets portrait frames side by side, landscape ones one above the other', () => {
    expect(sideBySide(A4)).toBe(true);
    expect(sideBySide(WIDE)).toBe(false);
  });
});

describe('placeFrames', () => {
  it('fills the height with one portrait frame on a portrait screen when it is narrow enough', () => {
    const [a] = placeFrames([A4], 1000, 1280, 6, true);
    expect(a.h).toBeLessThanOrEqual(1280);
    expect(a.w).toBe(Math.floor(1280 / A4));
    expect(a.x).toBe(Math.floor((1000 - a.w) / 2));
  });
  it('sets two portrait frames side by side, centred together, within the width', () => {
    const [a, b] = placeFrames([A4, A4], 1280, 800, 6, true);
    expect(a.h).toBe(800);
    expect(b.x).toBe(a.x + a.w + 6);
    expect(a.x).toBe(1280 - (b.x + b.w));
  });
  it('stacks two landscape frames, each fitted to half the height', () => {
    const [a, b] = placeFrames([WIDE, WIDE], 800, 1280, 6, false);
    expect(a.h + 6 + b.h).toBeLessThanOrEqual(1280);
    expect(b.y).toBe(a.y + a.h + 6);
    expect(a.w).toBeLessThanOrEqual(800);
  });
  it('fits frames of different shapes each to its half', () => {
    const [a, b] = placeFrames([A4, LETTER], 1280, 800, 6, true);
    expect(a.h).toBe(800);
    expect(b.w).toBeLessThanOrEqual((1280 - 6) / 2);
    expect(b.h).toBeLessThanOrEqual(800);
  });
  it('shrinks a landscape frame into the half that a portrait frame opened', () => {
    const [, b] = placeFrames([A4, WIDE], 1280, 800, 6, true);
    expect(b.w).toBe(Math.floor((1280 - 6) / 2));
    expect(b.h).toBeLessThan(800);
  });
});
