import { describe, expect, it } from 'vitest';
import { poseOf } from './_pose';

describe('poseOf', () => {
  it('is 0, 0 for the identity', () => {
    const data = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const p = poseOf({ data });
    expect(p.yaw).toBeCloseTo(0);
    expect(p.pitch).toBeCloseTo(0);
  });
  it('reads a turn about the vertical axis as yaw', () => {
    const a = (30 * Math.PI) / 180;
    // Column-major: d[2] is -sin(yaw) for a positive yaw.
    const data = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    expect(poseOf({ data }).yaw).toBeCloseTo(30);
  });
});
