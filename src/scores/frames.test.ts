import { describe, expect, it } from 'vitest';
import { pack, roomBefore } from './frames';
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

describe('roomBefore', () => {
  it('is the room left on the frame before, when that is more than a fifth of a frame', () => {
    const frames = pack(sarabande().score.cuts, aspects);
    expect(roomBefore(frames, 3, aspects)).toBeCloseTo(A4 / 3);
    expect(roomBefore(frames, 1, aspects)).toBeNull();
    expect(roomBefore(frames, 0, aspects)).toBeNull();
  });
});
