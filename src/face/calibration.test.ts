import { describe, expect, it } from 'vitest';
import { attempts, calibrated, restLevel } from './calibration';
import { DEFAULT_FACE_SETTINGS } from './gestures';

/** Samples of a quiet value with bumps of the given heights, each three samples long. */
const bumps = (heights: number[], quiet = 0.1) => heights.flatMap((h) => [quiet, quiet, h, h, quiet]).map((value) => ({ value }));

describe('restLevel', () => {
  it('is the 95th percentile', () => {
    const samples = Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
    expect(restLevel(samples)).toBeCloseTo(0.95);
    expect(restLevel([])).toBe(0);
  });
});

describe('attempts', () => {
  it('finds three clear bumps, each with its peak', () => {
    expect(attempts(bumps([0.8, 0.9, 0.7]), 0.1).map((a) => a.peak)).toEqual([0.8, 0.9, 0.7]);
  });
  it('does not count noise under the line', () => {
    const noise = [0.1, 0.15, 0.12, 0.2, 0.1].map((value) => ({ value }));
    expect(attempts([...bumps([0.9]), ...noise, ...bumps([0.9])], 0.1)).toHaveLength(2);
  });
  it('keeps the other eye at the peak', () => {
    const s = [{ value: 0.1, other: 0.05 }, { value: 0.6, other: 0.1 }, { value: 0.9, other: 0.2 }, { value: 0.1, other: 0.05 }];
    expect(attempts(s, 0.1)).toEqual([{ peak: 0.9, other: 0.2 }]);
  });
});

describe('calibrated', () => {
  const tune = DEFAULT_FACE_SETTINGS.mouthLeft;
  it('puts the threshold 40% of the way from rest to the lowest peak', () => {
    const r = calibrated('mouthLeft', tune, 0.1, [{ peak: 0.9 }, { peak: 0.6 }, { peak: 0.8 }]);
    expect('tune' in r && r.tune.threshold).toBeCloseTo(0.1 + 0.4 * 0.5);
  });
  it('is unreliable with too few attempts, or too small a gap', () => {
    expect(calibrated('mouthLeft', tune, 0.1, [{ peak: 0.9 }, { peak: 0.9 }])).toEqual({ unreliable: true });
    expect(calibrated('mouthLeft', tune, 0.1, [{ peak: 0.9 }, { peak: 0.9 }, { peak: 0.2 }])).toEqual({ unreliable: true });
    // Angles need 8° over rest.
    expect(calibrated('headLeft', DEFAULT_FACE_SETTINGS.headLeft, 2, [{ peak: 9 }, { peak: 12 }, { peak: 12 }])).toEqual({ unreliable: true });
  });
  it('sets a wink\'s other-eye level halfway between the other eye at the peaks and the threshold', () => {
    const r = calibrated('winkLeft', DEFAULT_FACE_SETTINGS.winkLeft, 0.1, [
      { peak: 0.9, other: 0.1 }, { peak: 0.9, other: 0.3 }, { peak: 0.9, other: 0.2 },
    ]);
    if (!('tune' in r)) throw new Error('unreliable');
    expect(r.tune.threshold).toBeCloseTo(0.42);
    expect(r.tune.otherBelow).toBeCloseTo((0.3 + 0.42) / 2);
  });
});
