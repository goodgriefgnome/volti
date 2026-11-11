import { describe, expect, it } from 'vitest';
import { planTrial, recorder, framesOf, STRIDE, type Trial } from './recording';
import { CHANNELS } from './template';

/** A trial with a frame at each of `times`, its first channel the frame's time in seconds (to tell them apart). */
function trialAt(times: number[], tUp: number, tDown: number): Trial {
  const data = new Float32Array(times.length * STRIDE);
  times.forEach((t, i) => {
    data[i * STRIDE] = t;
    data[i * STRIDE + 1] = t / 1000;
  });
  return { tUp, tDown, n: times.length, data };
}

describe('planTrial', () => {
  it('makes the shortest trial at 0', () => {
    expect(planTrial(() => 0)).toEqual({ ups: [2000, 3000, 4000], downs: [5000, 6000, 7000], end: 9000 });
  });
  it('makes the longest trial at 1', () => {
    expect(planTrial(() => 1)).toEqual({ ups: [4000, 5000, 6000], downs: [9000, 10000, 11000], end: 13000 });
  });
  it('puts the third rising tone a hold before the third falling one', () => {
    const p = planTrial(() => 0.5);
    expect(p.downs[2] - p.ups[2]).toBe(4000);
  });
});

describe('framesOf', () => {
  const t = trialAt([0, 2499, 2500, 3000, 3499, 3500, 5000, 7499, 7500, 8000, 8499, 8500, 10000], 3000, 8000);
  const at = (xs: Float32Array[]) => xs.map((x) => Math.round(x[0] * 1000));
  it('leaves out frames under 500 ms from either tone, and keeps those at 500 and over', () => {
    const f = framesOf(t);
    expect(at(f.held)).toEqual([3500, 5000, 7499, 7500]);
    expect(f.rest.length).toBe(f.restT.length);
    expect(f.restT).toEqual([0, 2499, 2500, 8500, 10000]);
  });
  it('takes the 52 channels of a frame', () => {
    expect(framesOf(t).held[0]).toHaveLength(CHANNELS.length);
  });
});

describe('recorder', () => {
  const x = (v: number) => Float32Array.from({ length: CHANNELS.length }, () => v);
  it('gives the frames pushed, in order, with their yaw and pitch', () => {
    const r = recorder();
    for (let i = 0; i < 100; i++) r.push(i * 100, x(i / 100), 3, -4);
    const trial = r.finish(3000, 7000)!;
    expect(trial.n).toBe(100);
    expect(trial.tUp).toBe(3000);
    expect(trial.tDown).toBe(7000);
    expect(trial.data).toHaveLength(100 * STRIDE);
    expect(trial.data[STRIDE]).toBe(100);
    expect(trial.data[STRIDE + 1]).toBeCloseTo(0.01);
    expect(trial.data[STRIDE + 53]).toBe(3);
    expect(trial.data[STRIDE + 54]).toBe(-4);
  });
  it('gives nothing with too few held frames, or too few rest frames', () => {
    const few = recorder();
    for (let i = 0; i < 100; i++) few.push(i * 100, x(0), 0, 0);
    expect(few.finish(3000, 4000)).toBeUndefined(); // held from 3500 to 3500: none
    const noRest = recorder();
    for (let i = 0; i < 100; i++) noRest.push(i * 100, x(0), 0, 0);
    expect(noRest.finish(0, 20000)).toBeUndefined();
  });
});
