import { describe, expect, it } from 'vitest';
import { DEFAULT_FACE_SETTINGS, faceSettingsFrom, hasGestures, measure, type FaceFrame } from './gestures';

const frame = (scores: Record<string, number> = {}, yaw = 0, pitch = 0): FaceFrame => ({ scores, yaw, pitch });

describe('measure', () => {
  it('takes the winking eye, and the lower eye for the long blink', () => {
    const f = frame({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.2 });
    expect(measure('winkLeft', f)).toBe(0.8);
    expect(measure('winkRight', f)).toBe(0.2);
    expect(measure('longBlink', f)).toBe(0.2);
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
    expect(s.winkLeft).toEqual({ direction: 'none', threshold: 0.5, hold: 250, otherBelow: 0.3 });
    expect(s.longBlink.hold).toBe(700);
    expect(s.headLeft.threshold).toBe(20);
    expect(s.nodDown.threshold).toBe(15);
  });
  it('clamp values to their ranges and make an unknown direction none', () => {
    const s = faceSettingsFrom({
      winkLeft: { direction: 'next', threshold: 2, hold: 5, otherBelow: 0 },
      headLeft: { direction: 'sideways', threshold: 90, hold: 99999 },
      mouthLeft: { direction: 'prev', threshold: 'x' },
    });
    expect(s.winkLeft).toEqual({ direction: 'next', threshold: 0.95, hold: 100, otherBelow: 0.05 });
    expect(s.headLeft).toEqual({ direction: 'none', threshold: 45, hold: 1500 });
    expect(s.mouthLeft.threshold).toBe(0.5);
    expect(hasGestures(s)).toBe(true);
  });
});
