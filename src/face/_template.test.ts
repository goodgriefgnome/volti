import { describe, expect, it } from 'vitest';
import { seeded, trialOf, type Values } from './_test-frames';
import { CHANNELS, candidates, channelsOf, fit, partnerOf, quantile, strength, shortOf, withThreshold, type TrialFrames } from './_template';

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
  it('leaves a channel that moves under 0.1 out of the rows', () => {
    const t = fit(trials({ jawOpen: 0.12 }, { jawOpen: 0.05 }));
    expect(t.rows).toEqual([]);
  });
  it('leaves a channel out when its rest values reach past its held edge', () => {
    // Held 0.5 steady; at rest it is 0.05 half the time and 0.6 the other half.
    const random = seeded(2);
    const mixed = trialOf({ jawOpen: 0.5 }, { jawOpen: 0.05 }, random);
    const high = trialOf({ jawOpen: 0.5 }, { jawOpen: 0.6 }, random);
    const t = fit([{ held: mixed.held, rest: [...mixed.rest, ...high.rest], restT: [] }]);
    expect(t.rows).toEqual([]);
  });
  it('keeps the ten most separated of more than ten moving channels', () => {
    const names = ['jawOpen', 'browInnerUp', 'cheekPuff', 'jawForward', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', '_neutral'];
    const held: Values = {};
    const rest: Values = {};
    names.forEach((n, i) => { held[n] = 0.5 + i * 0.03; rest[n] = 0.02; });
    const t = fit(trials(held, rest));
    expect(t.rows).toHaveLength(10);
    expect(t.rows.map((r) => r.separation)).toEqual([...t.rows.map((r) => r.separation)].sort((a, b) => b - a));
  });
});

describe('limits', () => {
  const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
  it('limit the other eye of a wink, and leave it out of the rows', () => {
    expect(wink.rows.map((r) => name(r.c))).toEqual(['eyeBlinkLeft']);
    expect(wink.limits).toHaveLength(1);
    const k = wink.limits[0];
    expect(name(k.c)).toBe('eyeBlinkRight');
    expect(k.limit).toBeCloseTo(0.25, 1);
    expect(k.full).toBeCloseTo(wink.rows[0].edge);
  });
  it('are not made of a blink, where both sides move alike', () => {
    const t = fit(trials({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }, { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
    expect(t.rows).toHaveLength(2);
    expect(t.limits).toEqual([]);
  });
  it('are not made of a pair moving opposite ways, which keeps both rows', () => {
    const t = fit(trials({ browOuterUpLeft: 0.7, browOuterUpRight: 0.01 }, { browOuterUpLeft: 0.03, browOuterUpRight: 0.4 }));
    expect(t.rows.map((r) => r.side).sort()).toEqual([-1, 1]);
    expect(t.limits).toEqual([]);
  });
  it('are not made of a channel without a counterpart', () => {
    expect(fit(trials({ jawOpen: 0.8 }, { jawOpen: 0.02 })).limits).toEqual([]);
  });
});

describe('strength', () => {
  const t = fit(trials({ mouthRight: 0.8 }, { mouthRight: 0.02 }));
  const edge = t.rows[0].edge;
  const at = t.rows[0].rest;
  it('is 1 on a held frame, 0 on a rest frame, between for one halfway, and 1 past the edge', () => {
    expect(strength(t, frame({ mouthRight: edge }))).toBeCloseTo(1);
    expect(strength(t, frame({ mouthRight: at }))).toBeCloseTo(0);
    expect(strength(t, frame({ mouthRight: (edge + at) / 2 }))).toBeCloseTo(0.5);
    expect(strength(t, frame({ mouthRight: 1 }))).toBe(1);
    expect(shortOf(t.rows[0], 1)).toBe(0);
  });
  it('is 0 for a template with no rows', () => {
    expect(strength({ rows: [], limits: [] }, frame({ mouthRight: 1 }))).toBe(0);
  });
  it('leaves the largest shortfall out of four rows or more, and not of three', () => {
    const four = fit(trials({ jawOpen: 0.6, browInnerUp: 0.6, cheekPuff: 0.6, mouthPucker: 0.6 }, { jawOpen: 0.02, browInnerUp: 0.02, cheekPuff: 0.02, mouthPucker: 0.02 }));
    expect(four.rows).toHaveLength(4);
    const high = (n: string) => four.rows.find((r) => name(r.c) === n)!.edge;
    expect(strength(four, frame({ jawOpen: high('jawOpen'), browInnerUp: high('browInnerUp'), cheekPuff: high('cheekPuff') }))).toBeCloseTo(1);
    const three = fit(trials({ jawOpen: 0.6, browInnerUp: 0.6, cheekPuff: 0.6 }, { jawOpen: 0.02, browInnerUp: 0.02, cheekPuff: 0.02 }));
    expect(strength(three, frame({ jawOpen: three.rows.find((r) => name(r.c) === 'jawOpen')!.edge, browInnerUp: three.rows.find((r) => name(r.c) === 'browInnerUp')!.edge }))).toBeCloseTo(2 / 3);
  });
  it('tells a wink from a blink: near 0 for both eyes closed, 1 for a wink', () => {
    const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
    expect(strength(wink, frame({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }))).toBeLessThan(0.05);
    expect(strength(wink, frame({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }))).toBeGreaterThan(0.9);
  });
});

describe('channel changes', () => {
  const winkRight = { eyeBlinkRight: 0.7, eyeBlinkLeft: 0.25 };
  const quiet = { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 };
  const rows = (t: { rows: { c: number }[] }) => t.rows.map((r) => name(r.c));
  const base = () => trials(winkRight, quiet);

  it('leave a template as it was when there are none', () => {
    expect(fit(base(), { forcedOff: [], forcedOn: [], thresholds: {} })).toEqual(fit(base()));
  });
  it('force off a row: it leaves the rows, and its limit goes too', () => {
    const t = fit(base(), { forcedOff: ['eyeBlinkRight'], forcedOn: [], thresholds: {} });
    expect(rows(t)).toEqual([]);
    expect(t.limits).toEqual([]);
  });
  it('force off a limit\'s channel alone: the row stays and the limit goes', () => {
    const t = fit(base(), { forcedOff: ['eyeBlinkLeft'], forcedOn: [], thresholds: {} });
    expect(rows(t)).toEqual(['eyeBlinkRight']);
    expect(t.limits).toEqual([]);
  });
  it('force on a channel that moves a little but is not clear, beside the ten picked', () => {
    const names = ['jawOpen', 'browInnerUp', 'cheekPuff', 'jawForward', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', '_neutral'];
    const held: Values = {};
    const rest: Values = {};
    names.forEach((n, i) => { held[n] = 0.5 + i * 0.03; rest[n] = 0.02; });
    const ts = trials(held, rest);
    const picked = fit(ts);
    expect(picked.rows).toHaveLength(10);
    const left = names.find((n) => !rows(picked).includes(n))!;
    const t = fit(ts, { forcedOff: [], forcedOn: [left], thresholds: {} });
    expect(t.rows).toHaveLength(11);
    expect(rows(t)).toContain(left);
  });
  it('force on a weak channel as a row, and not one that does not move', () => {
    const ts = trials({ mouthRight: 0.8, jawOpen: 0.07 }, { mouthRight: 0.02, jawOpen: 0.03 });
    expect(rows(fit(ts))).not.toContain('jawOpen');
    const t = fit(ts, { forcedOff: [], forcedOn: ['jawOpen', 'cheekPuff'], thresholds: {} });
    expect(rows(t)).toContain('jawOpen');
    expect(rows(t)).not.toContain('cheekPuff');
    const jaw = t.rows.find((r) => name(r.c) === 'jawOpen')!;
    expect(jaw.span).toBeGreaterThan(0);
  });
  it('move a row\'s threshold: its edge and span change, and its limit\'s full', () => {
    const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, quiet), { forcedOff: [], forcedOn: [], thresholds: { eyeBlinkLeft: 0.5 } });
    const r = wink.rows[0];
    expect(r.edge).toBeCloseTo(0.5);
    expect(r.span).toBeCloseTo(0.5 - r.rest);
    expect(wink.limits[0].full).toBeCloseTo(0.5);
  });
  it('move a limit', () => {
    const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, quiet), { forcedOff: [], forcedOn: [], thresholds: { eyeBlinkRight: 0.4 } });
    expect(wink.limits[0].limit).toBeCloseTo(0.4);
    expect(wink.limits[0].full).toBeGreaterThan(0.6);
  });
  it('keep a threshold 0.02 from rest, and a limit 0.02 short of its full', () => {
    const wink = fit(trials({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, quiet), { forcedOff: [], forcedOn: [], thresholds: { eyeBlinkLeft: 0, eyeBlinkRight: 0.9 } });
    const r = wink.rows[0];
    expect(r.edge - r.rest).toBeCloseTo(0.02);
    expect(wink.limits[0].full - wink.limits[0].limit).toBeCloseTo(0.02);
  });
});

describe('withThreshold', () => {
  const t = fit(trials({ mouthRight: 0.8, jawOpen: 0.6, eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, { mouthRight: 0.02, jawOpen: 0.02, eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 }));
  it('moves only the one channel', () => {
    const c = CHANNELS.indexOf('jawOpen');
    const moved = withThreshold(t, c, 0.3);
    expect(moved.rows.find((r) => r.c === c)!.edge).toBeCloseTo(0.3);
    expect(moved.rows.filter((r) => r.c !== c)).toEqual(t.rows.filter((r) => r.c !== c));
    expect(moved.limits).toEqual(t.limits);
  });
  it('moves a limit, and the full of a moved edge\'s limit', () => {
    const limit = t.limits[0];
    expect(withThreshold(t, limit.c, 0.15).limits[0].limit).toBeCloseTo(0.15);
    const row = partnerOf(limit.c);
    expect(withThreshold(t, row, 0.5).limits[0].full).toBeCloseTo(0.5);
  });
});

describe('candidates', () => {
  const ts = trials({ mouthRight: 0.8, jawOpen: 0.07, browInnerUp: 0.3 }, { mouthRight: 0.02, jawOpen: 0.03, browInnerUp: 0.02 });
  const t = fit(ts);
  const found = candidates(ts, t);
  it('leave out the template\'s channels and its limits', () => {
    const used = [...t.rows.map((r) => r.c), ...t.limits.map((k) => k.c)];
    expect(found.some((x) => used.includes(x.c))).toBe(false);
    expect(found).toHaveLength(CHANNELS.length - used.length);
  });
  it('are by separation from the highest, with those that do not move last', () => {
    const movers = found.filter((x) => x.moves);
    expect(movers.map((x) => x.separation)).toEqual([...movers.map((x) => x.separation)].sort((a, b) => b - a));
    const firstStill = found.findIndex((x) => !x.moves);
    expect(found.slice(firstStill).every((x) => !x.moves)).toBe(true);
    expect(name(found.find((x) => !x.moves)!.c)).toBeDefined();
  });
});
