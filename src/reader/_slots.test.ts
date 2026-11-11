import { describe, expect, it } from 'vitest';
import { slotUnder, type FrameSlot } from './_slots';

// Only the boxes are read.
const slot = (x: number, y: number, w = 100, h = 140) => ({ x, y, w, h }) as FrameSlot;
const left = slot(0, 10), right = slot(110, 10);
const slots = [left, right];

describe('slotUnder', () => {
  it('finds the same slot, with the point on it', () => {
    const r = slotUnder(slots, left, [0.5, 0.2])!;
    expect(r.slot).toBe(left);
    expect(r.at).toEqual([0.5, 0.2]);
  });
  it('finds the facing slot, with the point on its frame', () => {
    // 1.2 widths across from the left slot is 20 px into the right one.
    const r = slotUnder(slots, left, [1.2, 0.3])!;
    expect(r.slot).toBe(right);
    expect(r.at[0]).toBeCloseTo(0.1);
    expect(r.at[1]).toBeCloseTo(0.3);
  });
  it('finds nothing in the gap between them', () => {
    expect(slotUnder(slots, left, [1.05, 0.3])).toBeUndefined();
  });
  it('finds nothing off the bottom', () => {
    expect(slotUnder(slots, left, [0.5, 1.5])).toBeUndefined();
  });
});
