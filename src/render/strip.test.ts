import { describe, expect, it } from 'vitest';
import { A4 } from '../scores/model';
import type { Frame } from '../scores/frames';
import { _fitted, landingIndex, layStrip, screenStarts, stripDistance, stripPageWidths, stripScreen } from './strip';

const P = A4, L = 1 / A4;
// The spec's example: P1 P2 P3 P4 P5 L6 P7 L8 P9 P10.
const example = [P, P, P, P, P, L, P, L, P, P];
const GAP = 6;

describe('_fitted', () => {
  it('keeps a portrait frame at full size where it already fits in half (1280 × 800)', () => {
    expect(_fitted(P, 1280, 800, GAP, 0.9, 10)).toEqual({ w: 565, h: 800 });
  });
  it('shrinks a portrait frame to fill half exactly (1024 × 768)', () => {
    const f = _fitted(P, 1024, 768, GAP, 0.9, 10);
    expect(f.w).toBe(509);
    expect(f.h).toBe(Math.floor(509 * A4));
  });
  it('keeps a landscape frame at full size', () => {
    expect(_fitted(L, 1280, 800, GAP, 0.9, 10)).toEqual({ w: 1131, h: 800 });
  });
  it('never shrinks at 100%', () => {
    expect(_fitted(P, 1024, 768, GAP, 1, 10).w).toBe(543);
  });
  it('fits a third at 60%', () => {
    expect(_fitted(P, 1280, 800, GAP, 0.6, 10).w).toBe(422);
  });
  it('takes no smaller a share than the item has frames', () => {
    const N = 1.75;
    expect(_fitted(N, 1280, 800, GAP, 0.9, 10).w).toBeLessThanOrEqual(Math.floor((1280 - 12) / 3));
    expect(_fitted(N, 1280, 800, GAP, 0.9, 2).h).toBe(800);
    expect(_fitted(N, 1280, 800, GAP, 0.9, 1).h).toBe(800);
  });
  it('shrinks across the height on a portrait stage', () => {
    const f = _fitted(L, 800, 1280, GAP, 0.9, 10);
    expect(f.h).toBeLessThanOrEqual(637);
    expect(f.w).toBe(800);
  });
});

describe('layStrip', () => {
  it('puts frames GAP apart without overlap, centred across', () => {
    const s = layStrip(example, 1280, 800, 1, 0.9);
    s.frames.slice(1).forEach((f, i) => expect(f.at).toBe(s.frames[i].at + s.frames[i].len + GAP));
    expect(s.frames[0].off).toBe(0);
    expect(s.frames[5].size).toBe(800);
  });
  it('keeps a two-frame item of narrow pages at full height, centred, and five at a third', () => {
    const N = 1.75;
    const two = layStrip([N, N], 1280, 800, 1, 0.9);
    expect(two.frames.map((f) => f.size)).toEqual([800, 800]);
    expect(two.centred).not.toBeNull();
    expect(layStrip(Array(5).fill(N), 1280, 800, 1, 0.9).frames[0].len).toBeLessThanOrEqual(Math.floor((1280 - 12) / 3));
  });
  it('runs down a portrait stage', () => {
    expect(layStrip(example, 800, 1280, 1, 0.9).along).toBe('y');
    expect(layStrip(example, 1280, 800, 1, 0.9).along).toBe('x');
  });
  it('centres two portrait frames on 1280 × 800, and not ten', () => {
    expect(layStrip([P, P], 1280, 800, 1, 0.9).centred).toBe(Math.floor((1280 - (565 * 2 + GAP)) / 2));
    expect(layStrip(example, 1280, 800, 1, 0.9).centred).toBeNull();
  });
});

describe('stripScreen', () => {
  const s = layStrip(example, 1280, 800, 1, 0.9);
  it('shows two whole and a part from the first frame, the part running past the stage', () => {
    const sc = stripScreen(s, 0);
    expect(sc.whole).toEqual([0, 1]);
    expect(sc.part).toBe(2);
    expect(sc.boxes).toHaveLength(3);
    expect(sc.boxes[0].x).toBe(0);
    expect(sc.boxes[2].x + sc.boxes[2].w).toBeGreaterThan(1280);
  });
  it('shows a whole frame and a part of the landscape one from P5', () => {
    const sc = stripScreen(s, 4);
    expect(sc.whole).toEqual([4]);
    expect(sc.part).toBe(5);
  });
  it('shows the landscape frame whole, with part of the next, from L6', () => {
    const sc = stripScreen(s, 5);
    expect(sc.whole).toEqual([5]);
    expect(sc.part).toBe(6);
  });
  it('shows the last two whole with no part from P9, and room past them when there is some', () => {
    const sc = stripScreen(s, 8);
    expect(sc.whole).toEqual([8, 9]);
    expect(sc.part).toBeUndefined();
    expect(sc.empty).not.toBeNull();
    expect(sc.empty!.at).toBe(565 * 2 + GAP * 2);
  });
});

describe('screenStarts', () => {
  const s = layStrip(example, 1280, 800, 1, 0.9);
  it('advances by screens', () => {
    expect(screenStarts(s, 'screen')).toEqual([0, 2, 4, 5, 6, 7, 8]);
  });
  it('advances by pages', () => {
    expect(screenStarts(s, 'page')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('has exact fits and no part on 1024 × 768', () => {
    const ten = layStrip(Array(10).fill(P), 1024, 768, 1, 0.9);
    expect(screenStarts(ten, 'screen')).toEqual([0, 2, 4, 6, 8]);
  });
  it('is one screen for one frame, and for two that fit centred', () => {
    expect(screenStarts(layStrip([P], 1280, 800, 1, 0.9), 'screen')).toEqual([0]);
    expect(screenStarts(layStrip([P, P], 1280, 800, 1, 0.9), 'page')).toEqual([0]);
  });
  it('fits three at 60%, and leaves the last screen empty', () => {
    const ten = layStrip(Array(10).fill(P), 1280, 800, 1, 0.6);
    expect(screenStarts(ten, 'screen')).toEqual([0, 3, 6, 9]);
    expect(stripScreen(ten, 9).empty).not.toBeNull();
  });
});

describe('landingIndex', () => {
  it('finds the screen starting at a frame, else the last one before it', () => {
    const starts = [0, 2, 4, 5];
    expect(landingIndex(starts, 2)).toBe(1);
    expect(landingIndex(starts, 3)).toBe(1);
    expect(landingIndex(starts, 5)).toBe(3);
    expect(landingIndex(starts, 9)).toBe(3);
    expect(landingIndex(starts, 0)).toBe(0);
  });
});

describe('stripDistance', () => {
  it('is the first two frames and two gaps, from 0 to 2', () => {
    const s = layStrip(example, 1280, 800, 1, 0.9);
    expect(stripDistance(s, 0, 2)).toBe(565 * 2 + GAP * 2);
    expect(stripDistance(s, 2, 0)).toBe(-(565 * 2 + GAP * 2));
  });
});

describe('stripPageWidths', () => {
  it('gives each page the width of each frame it is cut from', () => {
    const frame = (aspect: number, page: number): Frame => ({ aspect, fill: 0, items: [{ cut: { id: `c${page}`, page, y0: 0, y1: 1 }, h: aspect } as unknown as Frame['items'][number]] });
    const widths = stripPageWidths([frame(P, 0), frame(L, 1)], 1280, 800, 1, 0.9);
    expect([...widths.get(0)!]).toEqual([565]);
    expect([...widths.get(1)!]).toEqual([1131]);
  });
});
