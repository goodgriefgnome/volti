import { describe, expect, it } from 'vitest';
import { pack } from '../scores/frames';
import { aspects, cut, sarabande } from '../scores/testing';
import { readPageWidths, screenAt } from './screen';

describe('screenAt', () => {
  it('in a setlist, keeps the room left on a score\'s last screen', () => {
    const frames = pack(sarabande().score.cuts, aspects).slice(0, 3);
    expect(screenAt(frames, 2, 1280, 800, 1, true).rects).toHaveLength(2);
    expect(screenAt(frames, 2, 1280, 800, 1, false).rects).toHaveLength(1);
  });
});

describe('readPageWidths', () => {
  it('gives each page shown, a screen at a time, at the widths it is drawn', () => {
    const frames = pack(sarabande().score.cuts, aspects);
    const widths = readPageWidths(frames, 1280, 800, 1);
    // Three pages on four frames, two to a landscape screen: every page, at one width, the same for all.
    expect([...widths.keys()].sort()).toEqual([0, 1, 2]);
    const all = new Set([...widths.values()].flatMap((w) => [...w]));
    expect(all.size).toBe(1);
  });
  it('gives only the pages an excerpt plays', () => {
    const widths = readPageWidths(pack([cut(0, 0, 1), cut(2, 0, 1)], aspects), 800, 1280, 1);
    expect([...widths.keys()]).toEqual([0, 2]);
  });
});
