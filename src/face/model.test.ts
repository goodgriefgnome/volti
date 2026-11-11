import { describe, expect, it } from 'vitest';
import { seeded, storedTrial, type Values } from './_test-frames';
import { build, conflictOf, flagText, settle, type Contender } from './model';
import { framesOf, type Trial } from './recording';

const random = seeded(7);
const trials = (held: Values, rest: Values, n = 5): Trial[] => Array.from({ length: n }, () => storedTrial(held, rest, random));

const wink = { eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 };
const quiet = { eyeBlinkLeft: 0.03, eyeBlinkRight: 0.03 };

describe('build', () => {
  it('gives too few and no template for two trials', () => {
    const f = build(trials(wink, quiet, 2));
    expect(f.flags).toEqual([{ kind: 'tooFew' }]);
    expect(f.template).toBeUndefined();
    expect(f.trials).toBe(2);
  });
  it('gives no channels, no template and the clearest channels where nothing moves', () => {
    const f = build(trials({ jawOpen: 0.3 }, { jawOpen: 0.3 }));
    expect(f.flags).toEqual([{ kind: 'noChannels' }]);
    expect(f.template).toBeUndefined();
    expect(f.missed).toBeDefined();
  });
  it('fits five clean trials of a wink, with its levels 0.65 of the way and then halfway', () => {
    const f = build(trials(wink, quiet));
    expect(f.flags).toEqual([]);
    expect(f.template!.rows).toHaveLength(1);
    const lowest = Math.min(...f.peaks!);
    expect(f.peaks).toHaveLength(5);
    expect(f.on!).toBeCloseTo(f.rest! + 0.65 * (lowest - f.rest!));
    expect(f.on!).toBeGreaterThan(f.rest!);
    expect(f.on!).toBeLessThan(lowest);
    expect(f.release!).toBeCloseTo(f.rest! + 0.5 * (f.on! - f.rest!));
  });
  it('flags a gesture one rep of which does not do it as unreliable', () => {
    const rs = trials(wink, quiet, 11);
    rs.push(storedTrial(quiet, quiet, random));
    const f = build(rs);
    expect(f.template).toBeDefined();
    expect(f.flags).toContainEqual({ kind: 'unreliable' });
  });
  it('flags a gesture done for five frames in a row at rest, with how long', () => {
    const rs = trials(wink, quiet, 4);
    rs.push(storedTrial(wink, quiet, random, { at: 10, frames: 5 }));
    const f = build(rs);
    const hit = f.flags.find((x) => x.kind === 'firesAtRest');
    expect(hit).toMatchObject({ frames: 5 });
    expect((hit as { ms: number }).ms).toBeGreaterThan(320);
    expect((hit as { ms: number }).ms).toBeLessThan(340);
  });
});

describe('flagText', () => {
  it('puts the flags in the words of the spec', () => {
    expect(flagText({ kind: 'tooFew' })).toBe('Record at least three trials.');
    expect(flagText({ kind: 'noChannels' })).toBe(`Can't be told from playing: no channel's held values are clear of its values at rest.`);
    expect(flagText({ kind: 'unreliable' })).toBe('Unreliable: a rep left out of the fit scores little over rest.');
    expect(flagText({ kind: 'firesAtRest', frames: 4, ms: 130 })).toBe('Fires while resting: 4 frames, 130 ms at the longest.');
  });
});

/** A gesture as the conflict check sees it, fitted from five trials. */
function contender(id: string, name: string, held: Values, rest: Values): Contender {
  const ts = trials(held, rest);
  const f = build(ts);
  return { id, name, template: f.template!, release: f.release!, held: ts.map((t) => framesOf(t).held) };
}

const mouth = { mouthLeft: 0.8 };
const mouthBrows = { mouthLeft: 0.8, browInnerUp: 0.7, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 };
const none = { mouthLeft: 0, browInnerUp: 0, browOuterUpLeft: 0, browOuterUpRight: 0 };

describe('conflictOf', () => {
  it('finds mouth left and mouth left with the brows up in conflict, and names the channel', () => {
    const a = contender('a', 'Mouth left', mouth, none);
    const b = contender('b', 'Mouth left, brows up', mouthBrows, none);
    expect(conflictOf(a, b)).toMatch(/mouthLeft/);
    expect(conflictOf(b, a)).toMatch(/mouthLeft/);
    expect(conflictOf(b, a)).toContain('“Mouth left” also fires on it: it scores');
  });
  it('finds a wink of each eye in no conflict', () => {
    const l = contender('l', 'Wink left', { eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, quiet);
    const r = contender('r', 'Wink right', { eyeBlinkLeft: 0.25, eyeBlinkRight: 0.7 }, quiet);
    expect(conflictOf(l, r)).toBeUndefined();
    expect(conflictOf(r, l)).toBeUndefined();
  });
  it('finds a wink and a long blink in no conflict', () => {
    // A light wink: the blink template scores a strong one over its release, as the spec's arithmetic has it.
    const w = contender('w', 'Wink', { eyeBlinkLeft: 0.35, eyeBlinkRight: 0.05 }, quiet);
    const b = contender('b', 'Long blink', { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }, quiet);
    expect(conflictOf(w, b)).toBeUndefined();
    expect(conflictOf(b, w)).toBeUndefined();
  });
});

describe('settle', () => {
  const a = contender('a', 'Mouth left', mouth, none);
  const b = contender('b', 'Mouth left, brows up', mouthBrows, none);
  it('gives the later of two that conflict', () => {
    expect([...settle([a, b]).keys()]).toEqual(['b']);
  });
  it('gives the changed one, though it is the earlier', () => {
    expect([...settle([a, b], 'a').keys()]).toEqual(['a']);
  });
  it('gives nothing of gestures that do not conflict', () => {
    const l = contender('l', 'Wink left', { eyeBlinkLeft: 0.7, eyeBlinkRight: 0.25 }, quiet);
    const r = contender('r', 'Wink right', { eyeBlinkLeft: 0.25, eyeBlinkRight: 0.7 }, quiet);
    expect(settle([l, r]).size).toBe(0);
  });
});
