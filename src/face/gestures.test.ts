import { describe, expect, it } from 'vitest';
import { activeOf, faceSettingsFrom, hasGestures, levelsOf, newGesture, NO_GESTURES, withFit, withLevels, type Gesture } from './gestures';
import { FIT_VERSION, type Fit } from './_fit';

const template = { rows: [{ c: 0, side: 1 as const, edge: 0.8, far: 0.1, rest: 0.02, span: 0.78, clear: 0.9 }], caps: [], missed: [] };
const fitted: Fit = { version: FIT_VERSION, trials: 5, flags: [], template, on: 0.6, release: 0.3, rest: 0.05, peaks: [0.9, 0.95] };
const gesture = (over: Partial<Gesture> = {}): Gesture => ({ ...newGesture('Wink'), id: 'a', fit: fitted, ...over });

describe('newGesture', () => {
  it('is set to next, with no trials and a default hold', () => {
    const g = newGesture('Wink');
    expect(g.direction).toBe('next');
    expect(g.hold).toBe(250);
    expect(g.fit).toEqual({ version: FIT_VERSION, trials: 0, flags: [{ kind: 'tooFew' }] });
    expect(newGesture('Wink').id).not.toBe(g.id);
  });
});

describe('faceSettingsFrom', () => {
  it('is no gestures of nothing stored, or of what is not an object', () => {
    expect(faceSettingsFrom(undefined)).toEqual(NO_GESTURES);
    expect(faceSettingsFrom('x')).toEqual(NO_GESTURES);
    expect(faceSettingsFrom({ gestures: 3 })).toEqual(NO_GESTURES);
  });
  it('is no gestures of the eight built-in gestures\' shape', () => {
    expect(faceSettingsFrom({ winkLeft: { direction: 'next', threshold: 0.5, release: 0.25, hold: 250 } })).toEqual(NO_GESTURES);
  });
  it('keeps a good list as it was', () => {
    const g = gesture({ on: 0.7, release: 0.4, note: 'Set to None: x.', direction: 'none' });
    expect(faceSettingsFrom({ gestures: [g] })).toEqual({ gestures: [g] });
  });
  it('drops a gesture without an id, a name or a fit', () => {
    const { id: _id, ...noId } = gesture();
    const { name: _name, ...noName } = gesture();
    const { fit: _fit, ...noFit } = gesture();
    expect(faceSettingsFrom({ gestures: [noId, noName, noFit, gesture({ id: 'kept' })] }).gestures.map((g) => g.id)).toEqual(['kept']);
  });
  it('clamps a hold and levels to their ranges, and makes an unknown direction none', () => {
    const [g] = faceSettingsFrom({ gestures: [{ ...gesture(), hold: 5000, on: 3, release: -1, direction: 'sideways' }] }).gestures;
    expect(g.hold).toBe(1500);
    expect(g.on).toBe(0.95);
    expect(g.release).toBe(0.05);
    expect(g.direction).toBe('none');
  });
});

describe('levelsOf', () => {
  it('is the fit\'s levels, with the hold', () => {
    expect(levelsOf(gesture())).toEqual({ on: 0.6, release: 0.3, hold: 250 });
  });
  it('is the levels moved by hand, with release never over on', () => {
    expect(levelsOf(gesture({ on: 0.4, release: 0.35 }))).toEqual({ on: 0.4, release: 0.35, hold: 250 });
    expect(levelsOf(gesture({ on: 0.2 }))).toEqual({ on: 0.2, release: 0.2, hold: 250 });
  });
  it('is undefined when it is not fitted', () => {
    expect(levelsOf(newGesture('x'))).toBeUndefined();
  });
});

describe('withLevels', () => {
  it('takes release down with on', () => {
    const g = withLevels(gesture(), { on: 0.2 });
    expect(levelsOf(g)).toEqual({ on: 0.2, release: 0.2, hold: 250 });
  });
  it('stops release at on, and keeps the levels in range', () => {
    expect(levelsOf(withLevels(gesture(), { release: 0.9 }))!.release).toBe(0.6);
    expect(levelsOf(withLevels(gesture(), { on: 0.001 }))!.on).toBe(0.05);
  });
  it('leaves a gesture that is not fitted as it was', () => {
    const g = newGesture('x');
    expect(withLevels(g, { on: 0.5 })).toBe(g);
  });
});

describe('withFit', () => {
  it('takes the new fit and drops the levels by hand and the note', () => {
    const g = withFit(gesture({ on: 0.7, release: 0.4, note: 'why' }), { version: FIT_VERSION, trials: 0, flags: [] });
    expect(g.on).toBeUndefined();
    expect(g.release).toBeUndefined();
    expect(g.note).toBeUndefined();
    expect(g.fit.trials).toBe(0);
  });
});

describe('activeOf', () => {
  it('leaves out gestures set to none, and those not fitted', () => {
    const s = { gestures: [gesture({ id: 'a' }), gesture({ id: 'b', direction: 'none' }), { ...newGesture('c'), id: 'c' }, gesture({ id: 'd', direction: 'prev' })] };
    expect(activeOf(s).map((a) => [a.id, a.direction])).toEqual([['a', 'next'], ['d', 'prev']]);
    expect(hasGestures(s)).toBe(true);
    expect(hasGestures({ gestures: [s.gestures[1], s.gestures[2]] })).toBe(false);
  });
  it('gives the levels and hold of each', () => {
    expect(activeOf({ gestures: [gesture({ hold: 400, on: 0.5 })] })[0]).toMatchObject({ on: 0.5, release: 0.3, hold: 400, template });
  });
});
