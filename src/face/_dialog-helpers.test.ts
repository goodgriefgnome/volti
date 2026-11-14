import { describe, expect, it } from 'vitest';
import { bandsOf, blameLine, listOrder, statusOf, trialView } from './_dialog-helpers';
import { seeded, storedTrial } from './_test-frames';
import { buildFit } from './_fit';
import { newGesture, type Gesture } from './gestures';
import { framesOf, type Trial } from './_recording';
import { CHANNELS } from './_template';

const random = seeded(21);
const wink = { eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 };
const quiet = { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 };
const idx = (n: string) => CHANNELS.indexOf(n);

const trials = (n: number, bursts: Record<number, number> = {}): Trial[] =>
  Array.from({ length: n }, (_, i) => storedTrial(wink, quiet, random, bursts[i] ? { at: 10, frames: bursts[i] } : undefined));
const made = (ts: Trial[], over: Partial<Gesture> = {}): Gesture => ({ ...newGesture('Wink'), id: 'w', ...over, fit: buildFit(ts) });
const ts = trials(5);
const good = made(ts);

describe('listOrder', () => {
  it('puts fitted gestures first, each group in the order added', () => {
    const a = { ...newGesture('a'), id: 'a' };
    const b = { ...good, id: 'b' };
    const c = { ...newGesture('c'), id: 'c' };
    const d = { ...good, id: 'd' };
    expect(listOrder([a, b, c, d]).map((g) => g.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('statusOf', () => {
  it('says how many more trials a gesture not fitted needs', () => {
    expect(statusOf(newGesture('x'))).toEqual({ text: 'Record 3 more trials', warn: false });
    expect(statusOf(made(trials(2)))).toEqual({ text: 'Record 1 more trial', warn: false });
  });
  it('counts the trials of a fitted gesture', () => {
    expect(statusOf(good)).toEqual({ text: '5 trials', warn: false });
  });
  it("says a gesture can't be told from playing", () => {
    const flat = made(Array.from({ length: 4 }, () => storedTrial({ jawOpen: 0.3 }, { jawOpen: 0.3 }, random)));
    expect(statusOf(flat)).toEqual({ text: "Can't be told from playing", warn: false });
  });
  it('says what turned a gesture off', () => {
    const g = { ...good, direction: 'none' as const, note: 'Set to None: “Mouth left” also fires on it: its strength is 0.97, and its release is 0.42. Both are mouthLeft.' };
    expect(statusOf(g)).toEqual({ text: 'Off: “Mouth left” also fires on it', warn: false });
    expect(statusOf({ ...g, note: 'Set to None: it also fires on “B”: its strength is 0.9, and its release is 0.4. It only needs x.' }).text).toBe('Off: it also fires on “B”');
  });
  it('warns of firing while resting and of being unreliable, the first that applies', () => {
    const g = { ...good, fit: { ...good.fit, flags: [{ kind: 'unreliable' as const }, { kind: 'firesAtRest' as const, frames: 3, ms: 200 }] } };
    expect(statusOf(g)).toEqual({ text: '⚠ Fires while resting · 5 trials', warn: true });
    expect(statusOf({ ...g, fit: { ...g.fit, flags: [{ kind: 'unreliable' }] } })).toEqual({ text: '⚠ Unreliable · 5 trials', warn: true });
  });
});

describe('trialView with strength shown', () => {
  it('traces every frame, with On and Release, the trial\'s peak and its rest strength', () => {
    const v = trialView(ts[1], 1, ts, good, 'strength');
    expect(v.trace).toHaveLength(ts[1].n);
    expect(v.held).toEqual([3500, 7500]);
    expect(v.guards).toEqual([[2500, 3500], [7500, 8500]]);
    expect(v.levels[0]).toBeGreaterThan(v.levels[1]);
    expect(v.numbers[0]).toBeCloseTo(good.fit.peaks![1]);
    expect(v.numbers[1]).toBeLessThan(v.levels[1]);
    expect(v.bad).toEqual([false, false]);
    expect(v.misfires).toEqual([]);
  });
  it('finds the misfires, and warns of a rest strength over Release', () => {
    const bad = trials(5, { 2: 4 });
    const g = made(bad);
    const v = trialView(bad[2], 2, bad, g, 'strength');
    expect(v.misfires).toHaveLength(4);
    expect(v.misfires[0]).toBeCloseTo(670, -1);
    expect(trialView(bad[0], 0, bad, g, 'strength').misfires).toEqual([]);
  });
  it('compares a disabled trial with the fit itself', () => {
    const all = ts.map((t, i) => (i === 4 ? { ...t, disabled: true as const } : t));
    const g = made(all);
    const v = trialView(all[4], 4, all, g, 'strength');
    expect(v.numbers[0]).toBeGreaterThan(0.9);
    expect(trialView(all[3], 3, all, g, 'strength').numbers[0]).toBeCloseTo(g.fit.peaks![3]);
  });
  it('shows a held strength under On in the warning colour (a trial left out, or On moved by hand)', () => {
    const weak = [...trials(5), { ...storedTrial({ eyeBlinkLeft: 0.1, eyeBlinkRight: 0.03 }, quiet, random), disabled: true as const }];
    const g = made(weak);
    const v = trialView(weak[5], 5, weak, g, 'strength');
    expect(v.numbers[0]).toBeLessThan(g.fit.on!);
    expect(v.bad[0]).toBe(true);
  });
});

describe('trialView\'s strength levels', () => {
  it('draws On and the zero point', () => {
    const v = trialView(ts[1], 1, ts, good, 'strength');
    expect(v.levels[0]).toBeCloseTo(good.fit.on!);
    expect(v.levels[1]).toBeLessThan(v.levels[0]);
    expect(v.levels[1]).toBeGreaterThanOrEqual(good.fit.rest!);
  });
  it('warns of a rest strength at or over halfway from the rest level to On', () => {
    const rough = { ...storedTrial(wink, { eyeBlinkLeft: 0.5, eyeBlinkRight: 0.03 }, random), disabled: true as const };
    const all = [...ts, rough];
    const v = trialView(rough, 5, all, made(all), 'strength');
    expect(v.numbers[1]).toBeGreaterThan(good.fit.rest! + 0.5 * (good.fit.on! - good.fit.rest!));
    expect(v.bad[1]).toBe(true);
    expect(trialView(ts[0], 0, ts, good, 'strength').bad[1]).toBe(false);
  });
});

describe('trialView with a channel shown', () => {
  it('shows a moving channel: its edge and rest value, Held, At rest and Past', () => {
    const v = trialView(ts[0], 0, ts, good, idx('eyeBlinkLeft'));
    expect(v.trace).toHaveLength(ts[0].n);
    expect(v.levels[0]).toBeCloseTo(0.69, 1);
    expect(v.levels[1]).toBeCloseTo(0.03, 1);
    expect(v.numbers[0]).toBeCloseTo(0.7, 1);
    expect(v.numbers[1]).toBeLessThan(0.1);
    expect(v.numbers[2]).toBeGreaterThan(0.8);
    expect(v.bad).toEqual([false, false, false]);
  });
  it('warns of a channel held short of its threshold, and a rest reaching it', () => {
    const slack = [...trials(5), storedTrial({ eyeBlinkLeft: 0.3, eyeBlinkRight: 0.03 }, quiet, random)];
    const g = made(slack.slice(0, 5));
    expect(trialView(slack[5], 5, slack, g, idx('eyeBlinkLeft')).bad[0]).toBe(true);
    const high = [...trials(5), storedTrial(wink, { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.03 }, random)];
    expect(trialView(high[5], 5, high, g, idx('eyeBlinkLeft')).bad[1]).toBe(true);
  });
  it('shows a limit\'s channel: its limit and full, and warns of it held past the limit', () => {
    const v = trialView(ts[0], 0, ts, good, idx('eyeBlinkRight'));
    expect(v.levels[0]).toBeCloseTo(0.25, 1);
    expect(v.levels[1]).toBeCloseTo(0.69, 1);
    expect(v.bad[0]).toBe(false);
    const both = [...trials(5), storedTrial({ eyeBlinkLeft: 0.7, eyeBlinkRight: 0.7 }, quiet, random)];
    const w = trialView(both[5], 5, both, good, idx('eyeBlinkRight'));
    expect(w.bad[0]).toBe(true);
    expect(w.numbers[2]).toBeGreaterThan(0.9);
  });
  it('has nothing for a gesture with no template', () => {
    const v = trialView(ts[0], 0, ts, newGesture('x'), 'strength');
    expect(v.numbers).toEqual([]);
    expect(v.trace).toEqual([]);
  });
});

describe('blameLine', () => {
  it('has none for a gesture that does not fire while resting', () => {
    expect(blameLine(good, ts)).toBeUndefined();
  });
  it('names the one trial', () => {
    const bad = trials(10, { 8: 4 });
    const g = made(bad);
    expect(g.fit.flags).toContainEqual({ kind: 'firesAtRest', frames: 4, ms: expect.any(Number) });
    expect(blameLine(g, bad)).toBe('All 4 are in trial 9. Disable it if it went wrong; otherwise force off a channel that rest reaches.');
  });
  it('names two trials', () => {
    const bad = trials(10, { 2: 4, 8: 4 });
    const g = made(bad);
    expect(blameLine(g, bad)).toBe('In trials 3 and 9. Disable them if they went wrong; otherwise force off a channel that rest reaches.');
  });
});

describe('bandsOf', () => {
  it('gives the 10th to the 90th percentile of a channel at rest and held, over the enabled trials', () => {
    const all = ts.map((t, i) => (i === 4 ? { ...t, disabled: true as const } : t));
    const frames = all.filter((t) => !t.disabled).map(framesOf);
    const b = bandsOf(frames, idx('eyeBlinkLeft'));
    expect(b.rest[0]).toBeLessThanOrEqual(b.rest[1]);
    expect(b.rest[1]).toBeLessThan(0.06);
    expect(b.held[0]).toBeGreaterThan(0.65);
    expect(b.held[1]).toBeLessThan(0.75);
    const limit = bandsOf(frames, idx('eyeBlinkRight'));
    expect(limit.held[1]).toBeLessThan(0.3);
  });
  it('is 0 to 0 with no frames', () => {
    expect(bandsOf([], 0)).toEqual({ rest: [0, 0], held: [0, 0] });
  });
});
