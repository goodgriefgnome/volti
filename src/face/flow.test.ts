// The path from a recording to a turned page without a camera: trials recorded through the
// recorder, fitted, and the gesture that gives run through the detector.

import { describe, expect, it } from 'vitest';
import { frameOf, seeded, type Values } from './_test-frames';
import { NEW_DETECTOR, step, type DetectorState } from './_detector';
import { activeOf, newGesture, type TurnDir } from './gestures';
import { buildFit } from './_fit';
import { recorder, type Trial } from './_recording';

const random = seeded(3);
const held: Values = { mouthRight: 0.8, jawOpen: 0.01 };
const rest: Values = { mouthRight: 0.02, jawOpen: 0.1 };

/** A trial through the recorder: held from 3 s to 8 s, frames every 67 ms to 10 s. */
function record(): Trial {
  const r = recorder();
  for (let t = 0; t <= 10000; t += 67) r.push(t, frameOf(t > 3000 && t < 8000 ? held : rest, random), 0, 0);
  return r.finish(3000, 8000)!;
}

describe('recording to turning', () => {
  const trials = [record(), record(), record()];
  const gesture = { ...newGesture('Mouth right'), direction: 'prev' as const, fit: buildFit(trials) };
  const active = activeOf({ gestures: [gesture] });

  /** Frames of `values` at 67 ms from 0: the times at which a page turned. */
  const turns = (values: Values, n: number) => {
    let state: DetectorState = NEW_DETECTOR;
    const out: { at: number; dir: TurnDir }[] = [];
    for (let i = 0; i < n; i++) {
      const r = step(state, frameOf(values, random), active, i * 67);
      state = r.state;
      if (r.turn) out.push({ at: i * 67, dir: r.turn });
    }
    return out;
  };

  it('fits the three trials, and the gesture can turn', () => {
    expect(gesture.fit.flags).toEqual([]);
    expect(gesture.fit.template).toBeDefined();
    expect(active).toHaveLength(1);
  });
  it('turns once, after its hold, when the gesture is held', () => {
    const t = turns(held, 30);
    expect(t).toHaveLength(1);
    expect(t[0].dir).toBe('prev');
    expect(t[0].at).toBeGreaterThanOrEqual(250);
    expect(t[0].at).toBeLessThan(250 + 67);
  });
  it('does not turn at rest', () => {
    expect(turns(rest, 100)).toEqual([]);
  });
});
