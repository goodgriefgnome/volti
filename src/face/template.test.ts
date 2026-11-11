import { describe, expect, it } from 'vitest';
import { seeded, trialOf, type Values } from './_test-frames';
import { CHANNELS, channelsOf, fit, partnerOf, quantile, score, shortOf, type TrialFrames } from './template';

const name = (c: number) => CHANNELS[c];
const trials = (held: Values, rest: Values, n = 5): TrialFrames[] => {
  const random = seeded(1);
  return Array.from({ length: n }, () => trialOf(held, rest, random));
};
const frame = (values: Values) => channelsOf(values);

describe('channels', () => {
  it('are 52, with a counterpart for the pairs only', () => {
    expect(CHANNELS).toHaveLength(52);
    expect(name(partnerOf(CHANNELS.indexOf('eyeBlinkLeft')))).toBe('eyeBlinkRight');
    expect(name(partnerOf(CHANNELS.indexOf('mouthRight')))).toBe('mouthLeft');
    expect(partnerOf(CHANNELS.indexOf('jawOpen'))).toBe(-1);
    expect(partnerOf(CHANNELS.indexOf('_neutral'))).toBe(-1);
  });
  it('are read from scores by name, a missing one 0', () => {
    const x = channelsOf({ jawOpen: 0.5, notAChannel: 1 });
    expect(x[CHANNELS.indexOf('jawOpen')]).toBe(0.5);
    expect(x.reduce((a, b) => a + b)).toBeCloseTo(0.5);
  });
});

describe('quantile', () => {
  it('gives the median and the ends of a short list', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([3, 1, 2], 0)).toBe(1);
    expect(quantile([3, 1, 2], 1)).toBe(3);
  });
  it('interpolates between two values', () => {
    expect(quantile([0, 1], 0.25)).toBeCloseTo(0.25);
    expect(quantile([2, 4, 6, 8], 0.5)).toBe(5);
  });
  it('is NaN of none', () => {
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe('fit', () => {
  it('makes a row of a channel held at 0.8 and at 0.02 at rest, and none of one that does not move', () => {
    const t = fit(trials({ mouthRight: 0.8, jawOpen: 0.3 }, { mouthRight: 0.02, jawOpen: 0.3 }));
    expect(t.rows.map((r) => name(r.c))).toEqual(['mouthRight']);
    const r = t.rows[0];
    expect(r.side).toBe(1);
    expect(r.edge).toBeCloseTo(0.8, 1);
    expect(r.rest).toBeCloseTo(0.02, 1);
  });
  it('makes a row with side -1 of a channel that goes down', () => {
    const t = fit(trials({ jawOpen: 0.01 }, { jawOpen: 0.25 }));
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].side).toBe(-1);
  });
  it('leaves a channel that moves under 0.1 out of the rows, in missed', () => {
    const t = fit(trials({ jawOpen: 0.12 }, { jawOpen: 0.05 }));
    expect(t.rows).toEqual([]);
    expect(t.missed.map((r) => name(r.c))).toContain('jawOpen');
  });
  it('leaves a channel out when its rest values reach past its held edge', () => {
    // Held 0.5 steady; at rest it is 0.05 half the time and 0.6 the other half.
    const random = seeded(2);
    const mixed = trialOf({ jawOpen: 0.5 }, { jawOpen: 0.05 }, random);
    const high = trialOf({ jawOpen: 0.5 }, { jawOpen: 0.6 }, random);
    const t = fit([{ held: mixed.held, rest: [...mixed.rest, ...high.rest], restT: [] }]);
    expect(t.rows).toEqual([]);
  });
  it('keeps the ten clearest of more than ten moving channels', () => {
    const names = ['jawOpen', 'browInnerUp', 'cheekPuff', 'jawForward', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', '_neutral'];
    const held: Values = {};
    const rest: Values = {};
    names.forEach((n, i) => { held[n] = 0.5 + i * 0.03; rest[n] = 0.02; });
    const t = fit(trials(held, rest));
    expect(t.rows).toHaveLength(10);
    expect(t.rows.map((r) => r.clear)).toEqual([...t.rows.map((r) => r.clear)].sort((a, b) => b - a));
  });
});

describe('caps', () => {
  const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
  it('cap the other eye of a wink, and leave it out of the rows', () => {
    expect(wink.rows.map((r) => name(r.c))).toEqual(['eyeBlinkLeft']);
    expect(wink.caps).toHaveLength(1);
    const k = wink.caps[0];
    expect(name(k.c)).toBe('eyeBlinkRight');
    expect(k.cap).toBeCloseTo(0.25, 1);
    expect(k.full).toBeCloseTo(wink.rows[0].edge);
  });
  it('are not made of a blink, where both sides move alike', () => {
    const t = fit(trials({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }, { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
    expect(t.rows).toHaveLength(2);
    expect(t.caps).toEqual([]);
  });
  it('are not made of a pair moving opposite ways, which keeps both rows', () => {
    const t = fit(trials({ browOuterUpLeft: 0.7, browOuterUpRight: 0.01 }, { browOuterUpLeft: 0.03, browOuterUpRight: 0.4 }));
    expect(t.rows.map((r) => r.side).sort()).toEqual([-1, 1]);
    expect(t.caps).toEqual([]);
  });
  it('are not made of a channel without a counterpart', () => {
    expect(fit(trials({ jawOpen: 0.8 }, { jawOpen: 0.02 })).caps).toEqual([]);
  });
});

describe('score', () => {
  const t = fit(trials({ mouthRight: 0.8 }, { mouthRight: 0.02 }));
  const edge = t.rows[0].edge;
  const at = t.rows[0].rest;
  it('is 1 on a held frame, 0 on a rest frame, between for one halfway, and 1 past the edge', () => {
    expect(score(t, frame({ mouthRight: edge }))).toBeCloseTo(1);
    expect(score(t, frame({ mouthRight: at }))).toBeCloseTo(0);
    expect(score(t, frame({ mouthRight: (edge + at) / 2 }))).toBeCloseTo(0.5);
    expect(score(t, frame({ mouthRight: 1 }))).toBe(1);
    expect(shortOf(t.rows[0], 1)).toBe(0);
  });
  it('is 0 for a template with no rows', () => {
    expect(score({ rows: [], caps: [], missed: [] }, frame({ mouthRight: 1 }))).toBe(0);
  });
  it('leaves the largest shortfall out of four rows or more, and not of three', () => {
    const four = fit(trials({ jawOpen: 0.6, browInnerUp: 0.6, cheekPuff: 0.6, mouthPucker: 0.6 }, { jawOpen: 0.02, browInnerUp: 0.02, cheekPuff: 0.02, mouthPucker: 0.02 }));
    expect(four.rows).toHaveLength(4);
    const high = (n: string) => four.rows.find((r) => name(r.c) === n)!.edge;
    expect(score(four, frame({ jawOpen: high('jawOpen'), browInnerUp: high('browInnerUp'), cheekPuff: high('cheekPuff') }))).toBeCloseTo(1);
    const three = fit(trials({ jawOpen: 0.6, browInnerUp: 0.6, cheekPuff: 0.6 }, { jawOpen: 0.02, browInnerUp: 0.02, cheekPuff: 0.02 }));
    expect(score(three, frame({ jawOpen: three.rows.find((r) => name(r.c) === 'jawOpen')!.edge, browInnerUp: three.rows.find((r) => name(r.c) === 'browInnerUp')!.edge }))).toBeCloseTo(2 / 3);
  });
  it('tells a wink from a blink: near 0 for both eyes closed, 1 for a wink', () => {
    const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
    expect(score(wink, frame({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }))).toBeLessThan(0.05);
    expect(score(wink, frame({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }))).toBeGreaterThan(0.9);
  });
});
