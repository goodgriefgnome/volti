import { describe, expect, it } from 'vitest';
import { attempts, calibrated, restLevel } from './calibration';
import { DEFAULT_FACE_SETTINGS } from './gestures';

/** Samples of a quiet value with bumps of the given heights, each three samples long. */
const bumps = (heights: number[], quiet = 0.1) => heights.flatMap((h) => [quiet, quiet, h, h, quiet]);

describe('restLevel', () => {
  it('is the 95th percentile', () => {
    const samples = Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
    expect(restLevel(samples)).toBeCloseTo(0.95);
    expect(restLevel([])).toBe(0);
  });
});

describe('attempts', () => {
  it('finds three clear bumps, each with its peak', () => {
    expect(attempts(bumps([0.8, 0.9, 0.7]), 0.1)).toEqual([0.8, 0.9, 0.7]);
  });
  it('does not count noise under the line', () => {
    const noise = [0.1, 0.15, 0.12, 0.2, 0.1];
    expect(attempts([...bumps([0.9]), ...noise, ...bumps([0.9])], 0.1)).toHaveLength(2);
  });
});

describe('calibrated', () => {
  const tune = DEFAULT_FACE_SETTINGS.mouthLeft;
  it('puts the threshold 40% of the way from rest to the lowest peak', () => {
    const r = calibrated('mouthLeft', tune, 0.1, [0.9, 0.6, 0.8]);
    expect('tune' in r && r.tune.threshold).toBeCloseTo(0.1 + 0.4 * 0.5);
  });
  it('is unreliable with too few attempts, or too small a gap', () => {
    expect(calibrated('mouthLeft', tune, 0.1, [0.9, 0.9])).toEqual({ unreliable: true });
    expect(calibrated('mouthLeft', tune, 0.1, [0.9, 0.9, 0.2])).toEqual({ unreliable: true });
    // Angles need 8° over rest.
    expect(calibrated('headLeft', DEFAULT_FACE_SETTINGS.headLeft, 2, [9, 12, 12])).toEqual({ unreliable: true });
  });
  it('puts the release halfway from rest to the new on level', () => {
    const r = calibrated('mouthLeft', tune, 0.1, [0.9, 0.6, 0.8]);
    if (!('tune' in r)) throw new Error('unreliable');
    expect(r.tune.threshold).toBeCloseTo(0.3);
    expect(r.tune.release).toBeCloseTo(0.2);
  });
  it('clamps a release under the range\'s minimum up to it', () => {
    const r = calibrated('headLeft', DEFAULT_FACE_SETTINGS.headLeft, 0, [20, 20, 20]);
    if (!('tune' in r)) throw new Error('unreliable');
    expect(r.tune).toMatchObject({ threshold: 8, release: 5 });
  });
});
