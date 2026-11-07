import { describe, expect, it } from 'vitest';
import { NEW_DETECTOR, step, type DetectorState } from './_detector';
import { DEFAULT_FACE_SETTINGS, type FaceFrame, type FaceSettings, type TurnDir } from './gestures';

const frame = (scores: Record<string, number> = {}, yaw = 0, pitch = 0): FaceFrame => ({ scores, yaw, pitch });
const rest = frame({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 });
const winkL = frame({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05 });
const blink = frame({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 });

const settings = (set: Partial<Record<keyof FaceSettings, TurnDir | 'none'>>): FaceSettings => {
  const s = structuredClone(DEFAULT_FACE_SETTINGS);
  for (const [g, d] of Object.entries(set)) s[g as keyof FaceSettings].direction = d!;
  return s;
};

/** Feed frames at 50 ms steps from 0; the times (ms) at which a turn was made, and the last result. */
function run(frames: (FaceFrame | null)[], s: FaceSettings) {
  let state: DetectorState = NEW_DETECTOR;
  const turns: { at: number; dir: TurnDir }[] = [];
  let last!: ReturnType<typeof step>;
  frames.forEach((f, i) => {
    last = step(state, f, s, i * 50);
    state = last.state;
    if (last.turn) turns.push({ at: i * 50, dir: last.turn });
  });
  return { turns, last };
}

const times = (f: FaceFrame | null, n: number) => Array<FaceFrame | null>(n).fill(f);

describe('the detector', () => {
  it('turns once when a wink has been held for its hold, in its direction', () => {
    const { turns } = run([...times(rest, 2), ...times(winkL, 12)], settings({ winkLeft: 'prev' }));
    // On from 100 ms; the hold is 250 ms.
    expect(turns).toEqual([{ at: 350, dir: 'prev' }]);
  });
  it('turns again once let go and done again', () => {
    const { turns } = run([...times(winkL, 8), ...times(rest, 2), ...times(winkL, 8)], settings({ winkLeft: 'next' }));
    expect(turns.map((t) => t.at)).toEqual([250, 750]);
  });
  it('does not turn for a wink shorter than its hold', () => {
    const { turns } = run([...times(winkL, 5), ...times(rest, 5)], settings({ winkLeft: 'next' }));
    expect(turns).toEqual([]);
  });
  it('takes a blink for no wink, and shows no progress for it', () => {
    const { turns, last } = run(times(blink, 12), settings({ winkLeft: 'next', winkRight: 'prev' }));
    expect(turns).toEqual([]);
    expect(last.progress.next).toEqual({ near: 0, hold: 0 });
    expect(last.progress.prev).toEqual({ near: 0, hold: 0 });
  });
  it('takes a blink for a long blink when that is set', () => {
    const { turns } = run(times(blink, 20), settings({ longBlink: 'next' }));
    expect(turns).toEqual([{ at: 700, dir: 'next' }]);
  });
  it('never turns, or shows progress, for a gesture set to none', () => {
    const { turns, last } = run(times(winkL, 12), settings({}));
    expect(turns).toEqual([]);
    expect(last.progress.next).toEqual({ near: 0, hold: 0 });
    expect(last.progress.prev).toEqual({ near: 0, hold: 0 });
  });
  it('shows the larger progress of two gestures going the same way', () => {
    const f = frame({ eyeBlinkLeft: 0.25, eyeBlinkRight: 0.05, mouthLeft: 0.4 });
    const { last } = run([f], settings({ winkLeft: 'next', mouthLeft: 'next' }));
    expect(last.progress.next.near).toBeCloseTo(0.8);
    expect(last.progress.prev.near).toBe(0);
  });
  it('shows how long an over-threshold gesture has been held, and nothing after it turned', () => {
    const s = settings({ winkLeft: 'next' });
    const { last } = run(times(winkL, 4), s);
    expect(last.progress.next).toEqual({ near: 1, hold: 150 / 250 });
    const after = run(times(winkL, 6), s).last;
    expect(after.progress.next).toEqual({ near: 0, hold: 0 });
  });
  it('lets every gesture go on a frame without a face', () => {
    const s = settings({ winkLeft: 'next' });
    const { turns } = run([...times(winkL, 4), null, ...times(winkL, 4)], s);
    expect(turns).toEqual([]);
  });
  it('turns only one gesture in a frame, the first in order', () => {
    const f = frame({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05, mouthRight: 0.9 });
    const { turns } = run(times(f, 6), settings({ winkLeft: 'prev', mouthRight: 'next' }));
    expect(turns[0]).toEqual({ at: 250, dir: 'prev' });
  });
  it('turns for the head turned to the person\'s left', () => {
    const { turns } = run(times(frame({}, 30), 8), settings({ headLeft: 'prev' }));
    expect(turns).toEqual([{ at: 250, dir: 'prev' }]);
    expect(run(times(frame({}, -30), 8), settings({ headLeft: 'prev' })).turns).toEqual([]);
  });
});
