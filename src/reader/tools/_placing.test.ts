import { describe, expect, it } from 'vitest';
import type { PlacedMark } from '../../markings/placed';
import { addGlyph } from '../../markings/glyphs';
import { pack } from '../../scores/frames';
import { A4, aspects, cut, state } from '../../scores/testing';
import type { FrameSlot } from '../_spread';
import { _tapAction, pressesMarking } from './_placing';
import type { ToolHost } from './_tool';

const mark = (text: string): PlacedMark => ({ kind: 'symbol', text, font: 'f', glyphs: [], at: [0.5, 0.5], size: 0.05 });
const a = mark('a'), b = mark('b');

describe('_tapAction', () => {
  it('goes again on the selected marking', () => expect(_tapAction(a, a)).toBe('again'));
  it('selects another marking, and only deselects on empty music', () => {
    expect(_tapAction(a, b)).toBe('select');
    expect(_tapAction(a, undefined)).toBe('deselect');
  });
  it('selects a marking when nothing is selected', () => expect(_tapAction(undefined, a)).toBe('select'));
  it('places on empty music when nothing is selected', () => expect(_tapAction(undefined, undefined)).toBe('place'));
});

describe('pressesMarking', () => {
  addGlyph('p:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
  const c = cut(0), m: PlacedMark = { kind: 'symbol', text: 'x', font: 'p', glyphs: [[1, -0.5, 0.5]], at: [0.5, 0.5], size: 0.1 };
  const [frame] = pack([c], aspects);
  const slot = { frame, w: 1000 } as FrameSlot;
  const y = A4 * 0.5;
  const host = (selected?: boolean) => ({
    zoom: () => ({ s: 1 }), aspects: () => aspects, state: () => state([c], { [c.id]: [m] }),
    selected: () => (selected ? { cut: c.id, mark: m } : undefined),
  }) as unknown as ToolHost;
  it('is true on a placed marking, and false on empty music', () => {
    expect(pressesMarking(host(), slot, [0.5, y, 0.5])).toBe(true);
    expect(pressesMarking(host(), slot, [0.1, y, 0.5])).toBe(false);
  });
  it('is true near the selected marking\'s box beyond a marking\'s tap margin, as for a handle', () => {
    // 0.05 + 12 px / 1000 px = 0.062 from the middle is the tap margin; 0.07 is beyond it, within a handle's reach.
    expect(pressesMarking(host(), slot, [0.57, y, 0.5])).toBe(false);
    expect(pressesMarking(host(true), slot, [0.57, y, 0.5])).toBe(true);
  });
});
