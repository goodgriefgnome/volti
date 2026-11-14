import { describe, expect, it } from 'vitest';
import { NEW_DETECTOR, step, type DetectorState } from './_detector';
import type { Active, TurnDir } from './gestures';
import { CHANNELS, channelsOf } from './_template';

// A one-row template on a channel: the strength is the channel's value over its edge (0.8).
const channel = (name: string) => CHANNELS.indexOf(name);
const gesture = (id: string, name: string, direction: TurnDir, over: Partial<Active> = {}): Active => ({
  id,
  direction,
  on: 0.5,
  zero: 0.1,
  hold: 500,
  template: { rows: [{ c: channel(name), side: 1, edge: 0.8, far: 0.1, rest: 0, span: 0.8, separation: 0.8 }], limits: [] },
  ...over,
});
const wink = gesture('wink', 'eyeBlinkLeft', 'prev');
const next = gesture('wink', 'eyeBlinkLeft', 'next');

/** A frame whose channel `name` has strength `y`. */
const frame = (name: string, y: number) => channelsOf({ [name]: y * 0.8 });
const FRAME = 67;
/** A frame with the channels of a wink (eyeBlinkLeft) and a mouth (mouthLeft) at their strengths. */
const both = (w: number, m: number) => channelsOf({ eyeBlinkLeft: w * 0.8, mouthLeft: m * 0.8 });
const ON = frame('eyeBlinkLeft', 1);
const OFF = frame('eyeBlinkLeft', 0);

/** Feed frames 67 ms apart from 0 (or at `at`); each frame's result, and the indexes at which a page turned. */
function run(frames: (Float32Array | null)[], active: Active[], at?: number[]) {
  let state: DetectorState = NEW_DETECTOR;
  const results: ReturnType<typeof step>[] = [];
  const turns: { i: number; dir: TurnDir }[] = [];
  frames.forEach((x, i) => {
    const r = step(state, x, active, at ? at[i] : i * FRAME);
    state = r.state;
    results.push(r);
    if (r.turn) turns.push({ i, dir: r.turn });
  });
  return { results, turns, last: results[results.length - 1] };
}
const times = (x: Float32Array | null, n: number) => Array<Float32Array | null>(n).fill(x);

describe('the detector, by direction', () => {
  it('turns at the first frame at or past the hold, once, and not again while held', () => {
    const { turns } = run(times(ON, 40), [next]);
    // 67 ms a frame from the second: 536 ms is the ninth frame.
    expect(turns).toEqual([{ i: 8, dir: 'next' }]);
  });
  it('is late by three frames for one under On in the middle of a hold', () => {
    const frames = [...times(ON, 4), OFF, ...times(ON, 12)];
    expect(run(frames, [next]).turns).toEqual([{ i: 8 + 3, dir: 'next' }]);
  });
  it('never turns for a gesture on less than two thirds of the time', () => {
    const pattern = [ON, ON, ON, OFF, OFF];
    const frames = Array.from({ length: 300 }, (_, i) => pattern[i % 5]);
    expect(run(frames, [next]).turns).toEqual([]);
  });
  it('turns, later, for a gesture on nine frames in ten', () => {
    const frames = [...times(ON, 4), OFF, ...times(ON, 5), ...times(ON, 20)];
    const { turns } = run(frames, [next]);
    expect(turns).toHaveLength(1);
    expect(turns[0].i * FRAME).toBeGreaterThan(500);
  });
  it('is armed again only after the hold let go, not before', () => {
    const held = times(ON, 9); // turns on the last
    const early = run([...held, ...times(OFF, 7), ...times(ON, 30)], [next]);
    expect(early.turns).toHaveLength(1); // 7 frames let go is under the hold: still spent
    const late = run([...held, ...times(OFF, 8), ...times(ON, 12)], [next]);
    expect(late.turns.map((t) => t.i)).toEqual([8, 8 + 8 + 8]);
  });
  it('is late by three frames for a flicker above On while letting go', () => {
    const base = run([...times(ON, 9), ...times(OFF, 30)], [next]);
    const baseGone = base.results.findIndex((r, i) => i > 8 && r.progress.next.hold === 0);
    expect(baseGone).toBe(8 + 8);
    const flick = run([...times(ON, 9), ...times(OFF, 4), ON, ...times(OFF, 30)], [next]);
    const gone = flick.results.findIndex((r, i) => i > 12 && r.progress.next.hold === 0);
    expect(gone).toBe(baseGone + 3);
    // And then a new hold turns again.
    expect(run([...times(ON, 9), ...times(OFF, 30), ...times(ON, 12)], [next]).turns).toHaveLength(2);
  });
  it('adds up two gestures of one direction: either on counts, and they turn once', () => {
    const a = gesture('a', 'eyeBlinkLeft', 'next');
    const b = gesture('b', 'mouthLeft', 'next');
    const frames = Array.from({ length: 40 }, (_, i) => (i % 2 ? both(0, 1) : both(1, 0)));
    expect(run(frames, [a, b]).turns).toEqual([{ i: 8, dir: 'next' }]);
  });
  it('spends the other direction when one turns', () => {
    // Next held from the start, Back from the fifth frame: Next turns, and Back never does while held.
    const frames = Array.from({ length: 40 }, (_, i) => both(1, i >= 4 ? 1 : 0));
    const back = gesture('mouth', 'mouthLeft', 'prev');
    const { turns } = run(frames, [gesture('wink', 'eyeBlinkLeft', 'next'), back]);
    expect(turns).toEqual([{ i: 8, dir: 'next' }]);
    // Let go for the hold, and hold Back alone: it turns.
    const more = run([...frames, ...times(both(0, 0), 8), ...Array.from({ length: 12 }, () => both(0, 1))], [gesture('wink', 'eyeBlinkLeft', 'next'), back]);
    expect(more.turns.map((t) => t.dir)).toEqual(['next', 'prev']);
  });
  it('turns Next, and spends Back, when both are full on one frame', () => {
    const back = gesture('mouth', 'mouthLeft', 'prev');
    const { turns } = run(times(both(1, 1), 40), [gesture('wink', 'eyeBlinkLeft', 'next'), back]);
    expect(turns).toEqual([{ i: 8, dir: 'next' }]);
  });
  it('lets both go on a frame without a face: armed at 0, then a hold turns after the hold', () => {
    const { turns, results } = run([...times(ON, 5), null, ...times(ON, 20)], [next]);
    expect(results[5].progress.next).toEqual({ near: 0, hold: 0 });
    expect(turns).toEqual([{ i: 5 + 8, dir: 'next' }]);
  });
  it('counts a gap of 2 s between frames as 200 ms', () => {
    const { last } = run([ON, ON], [next], [0, 2000]);
    expect(last.progress.next.hold).toBeCloseTo(200 / 500);
  });
  it('has no turn or progress for no gestures', () => {
    const { turns, last } = run(times(ON, 12), []);
    expect(turns).toEqual([]);
    expect(last.progress.next).toEqual({ near: 0, hold: 0 });
  });
  it('shows near from the zero point to On: 0, a half, 1', () => {
    const near = (y: number) => run([frame('eyeBlinkLeft', y)], [wink]).last.progress.prev.near;
    expect(near(0.1)).toBeCloseTo(0);
    expect(near(0.3)).toBeCloseTo(0.5);
    expect(near(0.5)).toBe(1);
    expect(near(0.9)).toBe(1);
  });
  it('is 1 or 0 when On is at or under the zero point', () => {
    const g = { ...wink, zero: 0.5 };
    expect(run([frame('eyeBlinkLeft', 0.4)], [g]).last.progress.prev.near).toBe(0);
    expect(run([frame('eyeBlinkLeft', 0.6)], [g]).last.progress.prev.near).toBe(1);
  });
  it('shows the nearer of two gestures of one direction', () => {
    const a = gesture('a', 'eyeBlinkLeft', 'next');
    const b = gesture('b', 'mouthLeft', 'next');
    expect(run([both(0.3, 0.1)], [a, b]).last.progress.next.near).toBeCloseTo(0.5);
  });
  it('shows the fill over the hold, and keeps it 1 while spent and held', () => {
    expect(run(times(ON, 4), [next]).last.progress.next.hold).toBeCloseTo((3 * FRAME) / 500);
    expect(run(times(ON, 30), [next]).last.progress.next).toEqual({ near: 1, hold: 1 });
  });
  it('shows the fill with the faint arc short of full', () => {
    const slight = frame('eyeBlinkLeft', 0.3);
    const f = run([...times(ON, 5), slight], [next]).last.progress.next;
    expect(f.near).toBeLessThan(1);
    expect(f.hold).toBeGreaterThan(0);
  });
});
