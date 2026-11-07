import { describe, expect, it } from 'vitest';
import { DEFAULT_FACE_SETTINGS, faceSettingsFrom, hasGestures, measure, withLevels, type FaceFrame } from './gestures';

const frame = (scores: Record<string, number> = {}, yaw = 0, pitch = 0): FaceFrame => ({ scores, yaw, pitch });

describe('measure', () => {
  it('takes a wink as the winking eye over the other, and the lower eye for the long blink', () => {
    const f = frame({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 });
    expect(measure('winkLeft', f)).toBeCloseTo(0.8);
    expect(measure('winkRight', f)).toBe(0);
    expect(measure('longBlink', f)).toBe(0.1);
  });
  it('gives a blink no wink signal', () => {
    expect(measure('winkLeft', frame({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }))).toBe(0);
  });
  it('takes the head turned to the person\'s left as a positive yaw', () => {
    expect(measure('headLeft', frame({}, 25))).toBe(25);
    expect(measure('headRight', frame({}, 25))).toBe(-25);
    expect(measure('headRight', frame({}, -25))).toBe(25);
    expect(measure('nodDown', frame({}, 0, 18))).toBe(18);
  });
});

describe('face settings', () => {
  it('are the defaults when nothing is stored, with every gesture set to none', () => {
    const s = faceSettingsFrom(undefined);
    expect(s).toEqual(DEFAULT_FACE_SETTINGS);
    expect(hasGestures(s)).toBe(false);
    expect(s.winkLeft).toEqual({ direction: 'none', threshold: 0.5, release: 0.25, hold: 250 });
    expect(s.longBlink.hold).toBe(700);
    expect(s.headLeft.threshold).toBe(20);
    expect(s.nodDown.threshold).toBe(15);
  });
  it('clamp values to their ranges and make an unknown direction none', () => {
    const s = faceSettingsFrom({
      winkLeft: { direction: 'next', threshold: 2, hold: 5, release: 0 },
      headLeft: { direction: 'sideways', threshold: 90, hold: 99999 },
      mouthLeft: { direction: 'prev', threshold: 'x' },
    });
    expect(s.winkLeft).toEqual({ direction: 'next', threshold: 0.95, release: 0.05, hold: 100 });
    expect(s.headLeft).toEqual({ direction: 'none', threshold: 45, release: 22.5, hold: 1500 });
    expect(s.mouthLeft.threshold).toBe(0.5);
    expect(hasGestures(s)).toBe(true);
  });
  it('give a missing release half the stored threshold, and stop one over the threshold at it', () => {
    expect(faceSettingsFrom({ mouthLeft: { threshold: 0.6 } }).mouthLeft.release).toBeCloseTo(0.3);
    expect(faceSettingsFrom({ mouthLeft: { threshold: 0.4, release: 0.8 } }).mouthLeft.release).toBe(0.4);
  });
  it('drop a stored otherBelow', () => {
    expect(faceSettingsFrom({ winkLeft: { otherBelow: 0.2 } }).winkLeft).not.toHaveProperty('otherBelow');
  });
});

describe('withLevels', () => {
  const t = DEFAULT_FACE_SETTINGS.mouthLeft;
  it('takes release down with a threshold moved under it', () => {
    expect(withLevels('mouthLeft', t, { threshold: 0.1 })).toMatchObject({ threshold: 0.1, release: 0.1 });
  });
  it('stops a release moved over the threshold at it', () => {
    expect(withLevels('mouthLeft', t, { release: 0.9 })).toMatchObject({ threshold: 0.5, release: 0.5 });
  });
  it('clamps both to the range', () => {
    expect(withLevels('mouthLeft', t, { threshold: 5, release: 0 })).toMatchObject({ threshold: 0.95, release: 0.05 });
    expect(withLevels('headLeft', DEFAULT_FACE_SETTINGS.headLeft, { threshold: 1, release: 1 })).toMatchObject({ threshold: 5, release: 5 });
  });
});
