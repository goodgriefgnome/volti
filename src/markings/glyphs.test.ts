import { describe, expect, it } from 'vitest';
import { _pathData } from '../fonts/_shape';
import { _parsePath, _pathBounds } from './glyphs';

describe('_parsePath', () => {
  it('reads what _pathData writes', () => {
    const d = _pathData(
      [
        { command: 'moveTo', args: [0, 0] },
        { command: 'lineTo', args: [500, 0] },
        { command: 'bezierCurveTo', args: [500, 250, 250, 500, 0, 500] },
        { command: 'quadraticCurveTo', args: [-100, 250, 0, 0] },
        { command: 'closePath', args: [] },
      ],
      1000,
    );
    expect(_parsePath(d)).toEqual([
      ['M', 0, 0],
      ['L', 0.5, 0],
      ['C', 0.5, -0.25, 0.25, -0.5, 0, -0.5],
      ['C', -0.0667, -0.3333, -0.0667, -0.1667, 0, 0],
      ['Z'],
    ]);
  });
});

describe('_pathBounds', () => {
  it('goes to the extremes of curves, not their control points', () => {
    const b = _pathBounds(_parsePath('M 0 0 C 0 1 1 1 1 0'))!;
    expect(b[0]).toBeCloseTo(0);
    expect(b[1]).toBeCloseTo(0);
    expect(b[2]).toBeCloseTo(1);
    expect(b[3]).toBeCloseTo(0.75);
  });
  it('is undefined for no path', () => {
    expect(_pathBounds(_parsePath(''))).toBeUndefined();
  });
});
