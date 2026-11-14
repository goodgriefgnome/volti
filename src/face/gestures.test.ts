import { describe, expect, it } from 'vitest';
import { activeOf, faceSettingsFrom, hasGestures, levelsOf, newGesture, NO_GESTURES, withFit, withChannels, withLevels, withoutOn, type FaceSettings, type Gesture } from './gestures';
import { FIT_VERSION, type Fit } from './_fit';

const template = { rows: [{ c: 0, side: 1 as const, edge: 0.8, far: 0.1, rest: 0.02, span: 0.78, separation: 0.9 }], limits: [] };
const fitted: Fit = { version: FIT_VERSION, trials: 5, flags: [], template, on: 0.6, rest: 0.05, peaks: [0.9, 0.95] };
const gesture = (over: Partial<Gesture> = {}): Gesture => ({ ...newGesture('Wink'), id: 'a', fit: fitted, ...over });

describe('newGesture', () => {
  it('is set to next, with no trials', () => {
    const g = newGesture('Wink');
    expect(g.direction).toBe('next');
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
    const g = gesture({ on: 0.7, note: 'Set to None: x.', direction: 'none' });
    expect(faceSettingsFrom({ hold: 300, gestures: [g] })).toEqual({ hold: 300, gestures: [g] });
  });
  it('keeps a gesture whose fit is of an earlier version, with only its version and trials', () => {
    const old = { id: 'o', name: 'Old', direction: 'next', hold: 250, fit: { version: FIT_VERSION - 1, trials: 5, flags: [{ kind: 'unreliable' }], template: { rows: [], caps: [] }, on: 0.5, release: 0.3, rest: 0.1, peaks: [1] } };
    const [g] = faceSettingsFrom({ gestures: [old] }).gestures;
    expect([g.id, g.name, g.direction]).toEqual(['o', 'Old', 'next']);
    expect(g.fit).toEqual({ version: FIT_VERSION - 1, trials: 5, flags: [] });
  });
  it('drops a gesture without an id, a name or a fit', () => {
    const { id: _id, ...noId } = gesture();
    const { name: _name, ...noName } = gesture();
    const { fit: _fit, ...noFit } = gesture();
    expect(faceSettingsFrom({ gestures: [noId, noName, noFit, gesture({ id: 'kept' })] }).gestures.map((g) => g.id)).toEqual(['kept']);
  });
  it('keeps a gesture\'s channel changes of known channels, and drops the rest', () => {
    const channels = { forcedOff: ['eyeBlinkLeft', 'nonsense'], forcedOn: ['jawOpen', 3], thresholds: { jawOpen: 0.3, bogus: 0.5, eyeBlinkLeft: 'x' } };
    const [g] = faceSettingsFrom({ gestures: [{ ...gesture(), channels }] }).gestures;
    expect(g.channels).toEqual({ forcedOff: ['eyeBlinkLeft'], forcedOn: ['jawOpen'], thresholds: { jawOpen: 0.3 } });
  });
  it('gives a gesture no channel changes when none are left', () => {
    const [g] = faceSettingsFrom({ gestures: [{ ...gesture(), channels: { forcedOff: ['nonsense'], forcedOn: [], thresholds: {} } }] }).gestures;
    expect(g).not.toHaveProperty('channels');
  });
  it('gives the hold 500 when missing, and clamps it', () => {
    expect(faceSettingsFrom({ gestures: [] }).hold).toBe(500);
    expect(faceSettingsFrom({ hold: 5000, gestures: [] }).hold).toBe(1500);
    expect(faceSettingsFrom({ hold: 5, gestures: [] }).hold).toBe(100);
  });
  it('ignores a gesture\'s own hold and release', () => {
    const [g] = faceSettingsFrom({ gestures: [{ ...gesture(), hold: 900, release: 0.2 }] }).gestures;
    expect(g).not.toHaveProperty('hold');
    expect(g).not.toHaveProperty('release');
  });
  it('clamps On to its range, and makes an unknown direction none', () => {
    const [g] = faceSettingsFrom({ gestures: [{ ...gesture(), on: 3, direction: 'sideways' }] }).gestures;
    expect(g.on).toBe(0.95);
    expect(g.direction).toBe('none');
  });
});

describe('levelsOf', () => {
  it('is the fit\'s On, with Release halfway from the rest level, and the hold given', () => {
    const l = levelsOf(gesture(), 500)!;
    expect(l.on).toBe(0.6);
    expect(l.release).toBeCloseTo(0.05 + 0.5 * (0.6 - 0.05));
    expect(l.hold).toBe(500);
  });
  it('is On by hand, with Release halfway from the rest level to it', () => {
    const l = levelsOf(gesture({ on: 0.4 }), 500)!;
    expect(l.on).toBe(0.4);
    expect(l.release).toBeCloseTo(0.05 + 0.5 * (0.4 - 0.05));
  });
  it('is undefined when it is not fitted', () => {
    expect(levelsOf(newGesture('x'), 500)).toBeUndefined();
  });
});

describe('withLevels', () => {
  it('sets On by hand, and Release follows it', () => {
    const g = withLevels(gesture(), 0.2);
    expect(g.on).toBe(0.2);
    expect(levelsOf(g, 500)!.release).toBeCloseTo(0.05 + 0.5 * 0.15);
  });
  it('keeps On in range', () => {
    expect(withLevels(gesture(), 0.001).on).toBe(0.05);
    expect(withLevels(gesture(), 3).on).toBe(0.95);
  });
});

describe('withChannels', () => {
  it('edits the changes, and keeps none when nothing is left', () => {
    const g = withChannels(gesture(), (c) => ({ ...c, forcedOff: ['eyeBlinkLeft'] }));
    expect(g.channels).toEqual({ forcedOff: ['eyeBlinkLeft'], forcedOn: [], thresholds: {} });
    const back = withChannels(g, (c) => ({ ...c, forcedOff: [] }));
    expect(back).not.toHaveProperty('channels');
  });
});

describe('withoutOn', () => {
  it('puts On back at the fitted one', () => {
    expect(levelsOf(withoutOn(withLevels(gesture(), 0.2)), 500)!.on).toBe(0.6);
  });
});

describe('withFit', () => {
  it('takes the new fit and drops On by hand and the note', () => {
    const g = withFit(gesture({ on: 0.7, note: 'why' }), { version: FIT_VERSION, trials: 0, flags: [] });
    expect(g.on).toBeUndefined();
    expect(g.note).toBeUndefined();
    expect(g.fit.trials).toBe(0);
  });
});

describe('activeOf', () => {
  const settings = (gestures: Gesture[], hold = 500): FaceSettings => ({ hold, gestures });
  it('leaves out gestures set to none, and those not fitted', () => {
    const s = settings([gesture({ id: 'a' }), gesture({ id: 'b', direction: 'none' }), { ...newGesture('c'), id: 'c' }, gesture({ id: 'd', direction: 'prev' })]);
    expect(activeOf(s).map((a) => [a.id, a.direction])).toEqual([['a', 'next'], ['d', 'prev']]);
    expect(hasGestures(s)).toBe(true);
    expect(hasGestures(settings([s.gestures[1], s.gestures[2]]))).toBe(false);
  });
  it('gives every gesture the settings\' hold, and its levels', () => {
    const a = activeOf(settings([gesture({ id: 'a', on: 0.5 }), gesture({ id: 'b' })], 700));
    expect(a.map((x) => x.hold)).toEqual([700, 700]);
    expect(a[0]).toMatchObject({ on: 0.5, template });
    expect(a[0].release).toBeCloseTo(0.05 + 0.5 * 0.45);
  });
});
