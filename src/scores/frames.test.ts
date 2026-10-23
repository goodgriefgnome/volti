import { describe, expect, it } from 'vitest';
import { cutLetter, isLandscape, pack, placeLabel, places, roomBefore, sameShape } from './frames';
import { A4, aspects, cut, sarabande } from './testing';

describe('pack', () => {
  it('puts each whole page on its own frame', () => {
    expect(pack(sarabande().score.cuts, aspects).map((f) => f.items.map((p) => p.index))).toEqual([[0], [1], [2, 3], [4]]);
  });
  it('places a cut below the ones before it on its frame', () => {
    const [, , f] = pack(sarabande().score.cuts, aspects);
    expect(f.items[1].top).toBeCloseTo(A4 / 3);
    expect(f.fill).toBeCloseTo((2 * A4) / 3);
  });
  it('uses a pad only when the cut starts a frame', () => {
    const cuts = [cut(0, 0, 0.5), cut(1, 0, 0.3, { pad: 0.2 }), cut(2, 0, 0.8, { pad: 0.2 })];
    const frames = pack(cuts, aspects);
    expect(frames).toHaveLength(2);
    expect(frames[0].items[1].top).toBeCloseTo(0.5 * A4);
    expect(frames[1].items[0].top).toBeCloseTo(0.2);
  });
  it('never lets a pad push the cut off its frame', () => {
    const [f] = pack([cut(0, 0, 1, { pad: 0.3 })], aspects);
    expect(f.items[0].top).toBe(0);
  });
});

describe('pack, with pages of different shapes', () => {
  const LETTER = 11 / 8.5, WIDE = 210 / 297;
  it('gives each frame the shape of its first cut\'s page', () => {
    const frames = pack([cut(0), cut(1)], [A4, WIDE]);
    expect(frames.map((f) => f.aspect)).toEqual([A4, WIDE]);
    expect(frames.map(isLandscape)).toEqual([false, true]);
  });
  it('starts a new frame for a page of another shape, even when there is room', () => {
    const frames = pack([cut(0, 0, 0.3), cut(1, 0, 0.3)], [A4, WIDE]);
    expect(frames.map((f) => f.items.length)).toEqual([1, 1]);
  });
  it('lets A4 and US Letter share a frame, but not a page and the same page turned', () => {
    expect(sameShape(A4, LETTER)).toBe(true);
    expect(sameShape(A4, WIDE)).toBe(false);
    const frames = pack([cut(0, 0, 0.5), cut(1, 0, 0.5)], [A4, LETTER]);
    expect(frames).toHaveLength(1);
  });
  it('gives a taller page a frame of its own shape rather than clipping it', () => {
    const frames = pack([cut(0), cut(1)], [LETTER, A4]);
    expect(frames.map((f) => f.aspect)).toEqual([LETTER, A4]);
    expect(frames[1].items[0].h).toBeCloseTo(frames[1].aspect);
  });
  it('counts a square frame as portrait', () => {
    expect(isLandscape({ aspect: 1 })).toBe(false);
  });
});

describe('roomBefore', () => {
  it('is the room left on the frame before, when that is more than a fifth of a frame', () => {
    const frames = pack(sarabande().score.cuts, aspects);
    expect(roomBefore(frames, 3)).toBeCloseTo(A4 / 3);
    expect(roomBefore(frames, 1)).toBeNull();
    expect(roomBefore(frames, 0)).toBeNull();
  });
});

describe('places', () => {
  it('numbers the frames as pages and letters the cuts on each', () => {
    const cuts = [cut(0), cut(1, 0, 0.5), cut(1, 0.5, 1)];
    expect(places(cuts, aspects).map(placeLabel)).toEqual(['1', '2a', '2b']);
  });
  it('runs on past z', () => {
    expect([0, 25, 26, 27, 52].map(cutLetter)).toEqual(['a', 'z', 'aa', 'ab', 'ba']);
  });
});
