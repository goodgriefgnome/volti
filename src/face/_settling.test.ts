import { describe, expect, it } from 'vitest';
import { seeded, storedTrial, type Values } from './_test-frames';
import { newGesture, type FaceSettings, type Gesture } from './gestures';
import { build } from './_model';
import type { Trial } from './_recording';
import { settled } from './_settling';

const random = seeded(11);
const trials = (held: Values, rest: Values): Trial[] => Array.from({ length: 5 }, () => storedTrial(held, rest, random));
const none = { mouthLeft: 0, browInnerUp: 0, browOuterUpLeft: 0, browOuterUpRight: 0 };

function made(id: string, name: string, held: Values, direction: Gesture['direction'] = 'next'): { g: Gesture; trials: Trial[] } {
  const ts = trials(held, none);
  return { g: { ...newGesture(name), id, direction, fit: build(ts) }, trials: ts };
}

describe('settled', () => {
  const a = made('a', 'Mouth left', { mouthLeft: 0.8 });
  const b = made('b', 'Mouth left, brows up', { mouthLeft: 0.8, browInnerUp: 0.7, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 });
  const trialsOf = new Map([['a', a.trials], ['b', b.trials]]);
  it('sets the later of two that conflict to none, with why', () => {
    const s = settled({ gestures: [a.g, b.g] }, trialsOf);
    expect(s.gestures.map((g) => g.direction)).toEqual(['next', 'none']);
    expect(s.gestures[1].note).toMatch(/^Set to None: .*mouthLeft.*\.$/);
    expect(s.gestures[0].note).toBeUndefined();
  });
  it('sets the changed one to none, though it is the earlier', () => {
    const s = settled({ gestures: [a.g, b.g] }, trialsOf, 'a');
    expect(s.gestures.map((g) => g.direction)).toEqual(['none', 'next']);
  });
  it('leaves gestures set to none, and those not fitted, alone', () => {
    const s: FaceSettings = { gestures: [a.g, { ...b.g, direction: 'none' }, newGesture('c')] };
    expect(settled(s, trialsOf)).toBe(s);
  });
});
