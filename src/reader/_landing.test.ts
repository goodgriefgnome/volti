import { describe, expect, it } from 'vitest';
import { A4, cut } from '../scores/testing';
import { pack } from '../scores/frames';
import { afterEdit, lastScreenStart, relistTarget, sameLayout } from './_landing';
import type { Item } from './_open-scores';

const aspects = [A4, A4, A4, A4];
const framesOf = (cuts: ReturnType<typeof cut>[]) => pack(cuts, aspects);
const playedOf = (frames: ReturnType<typeof framesOf>) => frames.flatMap((f) => f.items.map((p) => p.cut));

describe('sameLayout', () => {
  const a = [cut(0), cut(1)];
  it('is true for the same cuts, and when only a pass differs', () => {
    expect(sameLayout(a, [...a])).toBe(true);
    expect(sameLayout(a, [a[0], { ...a[1], pass: 2 }])).toBe(true);
  });
  it('is false when a y1, page or pad differs, when ids differ, and when lengths differ', () => {
    expect(sameLayout(a, [a[0], { ...a[1], y1: 0.5 }])).toBe(false);
    expect(sameLayout(a, [a[0], { ...a[1], page: 2 }])).toBe(false);
    expect(sameLayout(a, [a[0], { ...a[1], pad: 0.2 }])).toBe(false);
    expect(sameLayout(a, [a[0], { ...a[1], id: 'other' }])).toBe(false);
    expect(sameLayout(a, [a[0]])).toBe(false);
  });
});

describe('afterEdit', () => {
  const cuts = [cut(0), cut(1), cut(2), cut(3)];
  const frames = framesOf(cuts);
  const before = playedOf(frames);
  it('repaints only the ink for an edit that moved nothing, with no focus or a focus on the screen', () => {
    expect(afterEdit(before, frames, 1, 1)).toEqual({ kind: 'redraw' });
    expect(afterEdit(before, frames, 1, 1, cuts[1].id)).toEqual({ kind: 'redraw' });
  });
  it('shows the screen at a focus after it, placed fresh', () => {
    expect(afterEdit(before, frames, 0, 2, cuts[3].id)).toEqual({ kind: 'show', frame: 3, place: 'fresh' });
  });
  it('shows the same screen, kept, when the layout moved', () => {
    const after = framesOf([cuts[0], cuts[2], cuts[3]]);
    expect(afterEdit(before, after, 1, 1)).toEqual({ kind: 'show', frame: 1, place: 'keep' });
  });
  it('brings a frame past the new end back to the last', () => {
    const after = framesOf([cuts[0], cuts[1]]);
    expect(afterEdit(before, after, 3, 1)).toEqual({ kind: 'show', frame: 1, place: 'keep' });
  });
});

describe('lastScreenStart', () => {
  const portrait = framesOf([cut(0), cut(1), cut(2)]);
  it('starts at the last two frames when two show on the stage', () => {
    expect(lastScreenStart(portrait, 1000, 700)).toBe(1);
  });
  it('starts at the last frame when one shows', () => {
    expect(lastScreenStart(portrait, 700, 1000)).toBe(2);
  });
  it('starts at 0 for one frame', () => {
    expect(lastScreenStart(framesOf([cut(0)]), 1000, 700)).toBe(0);
  });
});

describe('relistTarget', () => {
  const items: Item[] = ['a', 'b', 'c'].map((id) => ({ scoreId: id, title: id, entryId: `e-${id}` }));
  it('is the same entry when it is still the one read', () => {
    expect(relistTarget(items, 'e-b', 'e-b', 0)).toEqual({ k: 1, same: true });
  });
  it('is the entry\'s new index, not the same, when it was not the one read', () => {
    expect(relistTarget(items, 'e-c', 'e-a', 0)).toEqual({ k: 2, same: false });
  });
  it('falls back to the place, and to the last item when it is past the end', () => {
    expect(relistTarget(items, 'e-gone', 'e-a', 1)).toEqual({ k: 1, same: false });
    expect(relistTarget(items, undefined, 'e-a', 7)).toEqual({ k: 2, same: false });
  });
});
