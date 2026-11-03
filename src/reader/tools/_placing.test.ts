import { describe, expect, it, vi } from 'vitest';
import type { PlacedMark } from '../../markings/placed';
import { addGlyph } from '../../markings/glyphs';
import { pack } from '../../scores/frames';
import { A4, aspects, cut, state } from '../../scores/testing';
import type { FrameSlot } from '../_spread';
import { _lifted, _tapAction, placingTool, pressesMarking } from './_placing';
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

describe('_lifted', () => {
  it('only taps when the tap moved nothing', () => expect(_lifted(false, true)).toBe('tap'));
  it('keeps where a tap moved the marking, then taps', () => expect(_lifted(true, true)).toBe('move-then-tap'));
  it('moves, however small, when it was not a tap', () => {
    expect(_lifted(true, false)).toBe('move');
    expect(_lifted(false, false)).toBe('move');
  });
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
  it('is true on a handle of the selected marking\'s box, beyond a marking\'s tap margin', () => {
    // A 10 px marking: its box is 24 px (corner at 12 px from the centre), handles of 6 px. A press 5.5 px
    // right of the top right corner is 12.5 px from the ink, beyond the 12 px tap margin.
    const small: PlacedMark = { ...m, size: 0.01 };
    const h = (selected?: boolean) => ({
      zoom: () => ({ s: 1 }), aspects: () => aspects, state: () => state([c], { [c.id]: [small] }),
      selected: () => (selected ? { cut: c.id, mark: small } : undefined),
    }) as unknown as ToolHost;
    expect(pressesMarking(h(), slot, [0.5175, y - 0.012, 0.5])).toBe(false);
    expect(pressesMarking(h(true), slot, [0.5175, y - 0.012, 0.5])).toBe(true);
    // 8 px off the corner is beyond the disc.
    expect(pressesMarking(h(true), slot, [0.52, y - 0.012, 0.5])).toBe(false);
  });
});

describe('placingTool: the press', () => {
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('requestAnimationFrame', () => 1);
  addGlyph('p:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
  const c = cut(0), m: PlacedMark = { kind: 'symbol', text: 'x', font: 'p', glyphs: [[1, -0.5, 0.5]], at: [0.5, 0.5], size: 0.1 };
  const [frame] = pack([c], aspects);
  const slot = { frame, x: 0, y: 0, w: 1000, h: 1000 * A4, box: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 * A4 }) } } as unknown as FrameSlot;
  const y = A4 * 0.5;
  const setup = (selected?: PlacedMark) => {
    const calls: string[] = [];
    const host = {
      zoom: () => ({ s: 1 }), aspects: () => aspects, state: () => state([c], { [c.id]: [m] }), slots: () => [slot],
      selected: () => (selected ? { cut: c.id, mark: selected } : undefined), select: () => {}, paintInk: () => {},
      loupe: () => ({ begin: () => void calls.push('begin'), show: () => void calls.push('show'), end: () => void calls.push('end') }),
    } as unknown as ToolHost;
    const ghost = () => ({ ...m, at: [0.2, 0.2] as [number, number] });
    return { calls, host, tool: placingTool('t', () => {}, ghost) };
  };
  it('shows the loupe on a placed marking at once, and hides it when lifting', () => {
    const { calls, host, tool } = setup();
    const use = tool.start(host, slot, [0.5, y, 0.5]);
    expect(calls).toEqual(['begin', 'show']);
    use.end(false);
    expect(calls).toEqual(['begin', 'show', 'end']);
  });
  it('shows the ghost\'s loupe at once on empty music with nothing selected', () => {
    const { calls, host, tool } = setup();
    tool.start(host, slot, [0.1, y, 0.5]);
    expect(calls).toEqual(['begin', 'show']);
  });
  it('waits for a move on empty music with a marking selected', () => {
    const { calls, host, tool } = setup(m);
    tool.start(host, slot, [0.1, y, 0.5]);
    expect(calls).toEqual([]);
  });
  it('holds a second finger off while a marking is pressed or a ghost shows, not on a selected press on empty music', () => {
    expect(setup().tool.start(setup().host, slot, [0.5, y, 0.5]).holds?.()).toBe(true);
    const g = setup();
    expect(g.tool.start(g.host, slot, [0.1, y, 0.5]).holds?.()).toBe(true);
    const s = setup(m);
    expect(s.tool.start(s.host, slot, [0.1, y, 0.5]).holds?.()).toBe(false);
  });
});
