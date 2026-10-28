import { describe, expect, it } from 'vitest';
import { bestExact, equivalent, standIns } from './_match';

describe('equivalent', () => {
  it('allows 4 pixels, or 1% of the wider, whichever is more', () => {
    expect(equivalent(100, 104)).toBe(true);
    expect(equivalent(100, 105)).toBe(false);
    expect(equivalent(2000, 2020)).toBe(true);
    expect(equivalent(2000, 2021)).toBe(false);
    expect(equivalent(2020, 2000)).toBe(true);
  });
});

describe('bestExact', () => {
  it('takes the widest equivalent width', () => {
    expect(bestExact([1000, 1008, 1012, 1500], 1005)).toBe(1012);
  });
  it('is undefined when none is equivalent', () => {
    expect(bestExact([500, 1500], 1000)).toBeUndefined();
    expect(bestExact([], 1000)).toBeUndefined();
  });
});

describe('standIns', () => {
  it('is the narrowest held page wider than asked', () => {
    expect(standIns([3000, 1500, 500], [1200], 1000)).toEqual([{ pxWidth: 1500, held: true }]);
  });
  it('is the closest held or saved page when none held is wider', () => {
    expect(standIns([500], [900, 100], 1000)).toEqual([{ pxWidth: 900, held: false }]);
    expect(standIns([950], [900], 1000)).toEqual([{ pxWidth: 950, held: true }]);
  });
  it('prefers a held wider page to a closer saved one', () => {
    expect(standIns([3000], [1100], 1000)).toEqual([{ pxWidth: 3000, held: true }]);
  });
  it('is none when there is nothing, or the exact page is at hand', () => {
    expect(standIns([], [], 1000)).toEqual([]);
    expect(standIns([1002, 3000], [], 1000)).toEqual([]);
    expect(standIns([], [998], 1000)).toEqual([]);
  });
});
