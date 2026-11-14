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
  release: 0.25,
  hold: 250,
  template: { rows: [{ c: channel(name), side: 1, edge: 0.8, far: 0.1, rest: 0, span: 0.8, separation: 0.8 }], limits: [] },
  ...over,
});
const wink = gesture('wink', 'eyeBlinkLeft', 'prev');
const mouth = gesture('mouth', 'mouthLeft', 'next');

/** A frame whose channel `name` scores `y`. */
const frame = (name: string, y: number) => channelsOf({ [name]: y * 0.8 });
const rest = frame('eyeBlinkLeft', 0);
const held = frame('eyeBlinkLeft', 1);

/** Feed frames at 50 ms steps from 0; the times (ms) at which a turn was made, and the last result. */
function run(frames: (Float32Array | null)[], active: Active[]) {
  let state: DetectorState = NEW_DETECTOR;
  const turns: { at: number; dir: TurnDir }[] = [];
  let last!: ReturnType<typeof step>;
  frames.forEach((x, i) => {
    last = step(state, x, active, i * 50);
    state = last.state;
    if (last.turn) turns.push({ at: i * 50, dir: last.turn });
  });
  return { turns, last };
}

const times = (x: Float32Array | null, n: number) => Array<Float32Array | null>(n).fill(x);

describe('the detector', () => {
  it('turns once when a gesture has been held for its hold, in its direction', () => {
    const { turns } = run([...times(rest, 2), ...times(held, 12)], [wink]);
    // On from 100 ms; the hold is 250 ms.
    expect(turns).toEqual([{ at: 350, dir: 'prev' }]);
  });
  it('comes on at its on level, and not under it', () => {
    expect(run(times(frame('eyeBlinkLeft', 0.5), 8), [wink]).turns).toHaveLength(1);
    expect(run(times(frame('eyeBlinkLeft', 0.49), 8), [wink]).turns).toEqual([]);
  });
  it('turns again once let go and done again', () => {
    const { turns } = run([...times(held, 8), ...times(rest, 2), ...times(held, 8)], [{ ...wink, direction: 'next' }]);
    expect(turns.map((t) => t.at)).toEqual([250, 750]);
  });
  it('does not turn for a gesture shorter than its hold', () => {
    expect(run([...times(held, 5), ...times(rest, 5)], [wink]).turns).toEqual([]);
  });
  it('shows no progress for a frame of rest', () => {
    const { turns, last } = run(times(rest, 12), [wink, mouth]);
    expect(turns).toEqual([]);
    expect(last.progress.next).toEqual({ near: 0, hold: 0 });
    expect(last.progress.prev).toEqual({ near: 0, hold: 0 });
  });
  it('shows the nearer of two gestures going the same way', () => {
    const f = channelsOf({ eyeBlinkLeft: 0.8 * 0.4, mouthLeft: 0.8 * 0.3 });
    const { last } = run([f], [gesture('a', 'eyeBlinkLeft', 'next'), gesture('b', 'mouthLeft', 'next')]);
    expect(last.progress.next.near).toBeCloseTo(0.6);
    expect(last.progress.prev.near).toBe(0);
  });
  it('shows how long an over-on gesture has been held, and nothing after it turned', () => {
    const next = { ...wink, direction: 'next' as const };
    expect(run(times(held, 4), [next]).last.progress.next).toEqual({ near: 1, hold: 150 / 250 });
    expect(run(times(held, 6), [next]).last.progress.next).toEqual({ near: 0, hold: 0 });
  });
  it('lets every gesture go on a frame without a face', () => {
    expect(run([...times(held, 4), null, ...times(held, 4)], [wink]).turns).toEqual([]);
  });
  it('turns only one gesture in a frame, the first in order', () => {
    const f = channelsOf({ eyeBlinkLeft: 0.8, mouthLeft: 0.8 });
    expect(run(times(f, 6), [wink, mouth]).turns[0]).toEqual({ at: 250, dir: 'prev' });
  });
  const dip = frame('eyeBlinkLeft', 0.35); // between release and on
  it('keeps a gesture on through a dip between release and on', () => {
    expect(run([...times(held, 2), ...times(dip, 2), ...times(held, 6)], [wink]).turns).toEqual(run(times(held, 8), [wink]).turns);
  });
  it('restarts the hold on a dip under release', () => {
    expect(run([...times(held, 4), rest, ...times(held, 8)], [wink]).turns).toEqual([{ at: 250 + 250, dir: 'prev' }]);
  });
  it('lets go only under release once turned', () => {
    expect(run([...times(held, 8), ...times(dip, 2), ...times(held, 8)], [wink]).turns).toHaveLength(1);
    expect(run([...times(held, 8), ...times(rest, 2), ...times(held, 8)], [wink]).turns).toHaveLength(2);
  });
  it('shows near from release to on, then full with the hold growing', () => {
    expect(run([frame('eyeBlinkLeft', 0.25)], [wink]).last.progress.prev.near).toBeCloseTo(0);
    expect(run([frame('eyeBlinkLeft', 0.375)], [wink]).last.progress.prev.near).toBeCloseTo(0.5);
    expect(run(times(held, 3), [wink]).last.progress.prev).toEqual({ near: 1, hold: 100 / 250 });
  });
  it('is 1 or 0 when release equals the on level', () => {
    const g = { ...mouth, release: 0.5 };
    expect(run([frame('mouthLeft', 0.4)], [g]).last.progress.next.near).toBe(0);
    expect(run([frame('mouthLeft', 0.6)], [g]).last.progress.next.near).toBe(1);
  });
  it('shows nothing for no gestures that can turn', () => {
    const { turns, last } = run(times(held, 12), []);
    expect(turns).toEqual([]);
    expect(last.progress.next).toEqual({ near: 0, hold: 0 });
  });
});
