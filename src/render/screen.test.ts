import { describe, expect, it } from 'vitest';
import { pack } from '../scores/frames';
import { aspects, cut, sarabande } from '../scores/testing';
import { offlinePageWidths, pageWidths } from './screen';
import { stripPageWidths } from './strip';

describe('pageWidths', () => {
  it('gives each page the widest of the slots it is drawn into', () => {
    const frames = pack([cut(0, 0, 1), cut(1, 0, 1)], aspects);
    expect(pageWidths(frames, [500, 600])).toEqual(new Map([[0, 500], [1, 600]]));
  });
});

describe('offlinePageWidths', () => {
  const frames = pack(sarabande().score.cuts, aspects);
  it('on a square screen is the strip\'s', () => {
    expect(offlinePageWidths(frames, 1000, 1000, 1, 0.9)).toEqual(stripPageWidths(frames, 1000, 1000, 1, 0.9));
  });
  it('holds the widths of both orientations, and nothing else', () => {
    const both = offlinePageWidths(frames, 1280, 800, 1, 0.9);
    const a = stripPageWidths(frames, 1280, 800, 1, 0.9), b = stripPageWidths(frames, 800, 1280, 1, 0.9);
    for (const p of new Set([...a.keys(), ...b.keys()])) {
      expect([...both.get(p)!].sort()).toEqual([...new Set([...(a.get(p) ?? []), ...(b.get(p) ?? [])])].sort());
    }
    expect([...both.keys()].sort()).toEqual([...new Set([...a.keys(), ...b.keys()])].sort());
  });
  it('gives only the pages an excerpt plays', () => {
    const widths = offlinePageWidths(pack([cut(0, 0, 1), cut(2, 0, 1)], aspects), 800, 1280, 1, 0.9);
    expect([...widths.keys()]).toEqual([0, 2]);
  });
  it('gives more widths where a lower smallest scale fits more frames', () => {
    const tall = pack([cut(0), cut(1), cut(2)], aspects);
    const at90 = offlinePageWidths(tall, 1280, 800, 1, 0.9), at60 = offlinePageWidths(tall, 1280, 800, 1, 0.6);
    expect(Math.min(...[...at60.get(0)!])).toBeLessThan(Math.min(...[...at90.get(0)!]));
  });
});
