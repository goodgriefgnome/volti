import { describe, expect, it, vi } from 'vitest';
import type { PlacedMark } from '../../markings/placed';
import { addGlyph } from '../../markings/glyphs';
import { pack } from '../../scores/frames';
import { A4, aspects, cut, state } from '../../scores/testing';
import type { FrameSlot } from '../_slots';
import { _lifted, _tapAction, placingTool } from './_placing';
import type { Press, ToolHost } from './_tool';

const mark = (text: string): PlacedMark => ({ kind: 'symbol', text, font: 'f', glyphs: [], at: [0.5, 0.5], size: 0.05 });
const a = mark('a'), b = mark('b');

describe('_tapAction', () => {
  it('goes again on the selected marking', () => expect(_tapAction(a, a)).toBe('again'));
  it('selects another marking', () => expect(_tapAction(a, b)).toBe('select'));
  it('selects a marking when nothing was selected', () => expect(_tapAction(undefined, a)).toBe('select'));
  it('places on empty music', () => expect(_tapAction(undefined, undefined)).toBe('place'));
});

describe('_lifted', () => {
  it('only taps when the tap moved nothing', () => expect(_lifted(false, true)).toBe('tap'));
  it('keeps where a tap moved the marking, then taps', () => expect(_lifted(true, true)).toBe('move-then-tap'));
  it('moves, however small, when it was not a tap', () => {
    expect(_lifted(true, false)).toBe('move');
    expect(_lifted(false, false)).toBe('move');
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
  const setup = (selected?: PlacedMark, ink: PlacedMark = m) => {
    const calls: string[] = [];
    const host = {
      zoom: () => ({ s: 1 }), aspects: () => aspects, state: () => state([c], { [c.id]: [ink] }), slots: () => [slot],
      selected: () => (selected ? { cut: c.id, mark: selected } : undefined), select: () => {}, drawInk: () => {},
      loupe: () => ({ begin: () => void calls.push('begin'), show: () => void calls.push('show'), end: () => void calls.push('end') }),
    } as unknown as ToolHost;
    const ghost = () => ({ ...m, at: [0.2, 0.2] as [number, number] });
    const placed: number[] = [];
    const tool = placingTool(host, { name: 'symbol', owns: () => true, place: () => void placed.push(1), ghost, again: () => {}, resized: (s) => s });
    return { calls, placed, host, tool };
  };
  const press = (x: number, on?: Press['on'], py = y): Press => ({ slot, framePoint: [x, py, 0.5], screenPoint: { x: x * 1000, y: 0 }, ...(on ? { on } : {}) });
  const grabbed: Press['on'] = { what: 'grabbed', sel: { page: c.page, cut: c.id, mark: m } };
  it('shows the loupe on a grabbed marking at once, and hides it when lifting', () => {
    const { calls, tool } = setup();
    const use = tool.start(press(0.5, grabbed))!;
    expect(calls).toEqual(['begin', 'show']);
    use.end(false);
    expect(calls).toEqual(['begin', 'show', 'end']);
  });
  it('shows the ghost\'s loupe at once on empty music', () => {
    const { calls, tool } = setup();
    tool.start(press(0.1))!;
    expect(calls).toEqual(['begin', 'show']);
  });
  it('places where the finger lifted after a drag on empty music', () => {
    const { placed, tool } = setup();
    const use = tool.start(press(0.1))!;
    use.move([0.3, y, 0.5], { x: 300, y: 0 });
    use.end(false);
    expect(placed).toEqual([1]);
  });
  it('suppresses a pinch while a marking is held, not while a ghost shows', () => {
    const a = setup();
    expect(a.tool.suppressions?.().pinching).toBeUndefined();
    const use = a.tool.start(press(0.5, grabbed))!;
    expect(a.tool.suppressions?.().pinching).toBe(true);
    use.end(false);
    expect(a.tool.suppressions?.().pinching).toBeUndefined();
    const g = setup();
    g.tool.start(press(0.1));
    expect(g.tool.suppressions?.().pinching).toBeUndefined();
  });
  it('holds a marking pressed on its box or handle', () => {
    const a = setup(m);
    a.tool.start(press(0.5, { what: 'chrome' }));
    expect(a.tool.suppressions?.().pinching).toBe(true);
    const h = setup(m);
    h.tool.start(press(0.56, { what: 'chrome' }, y - 0.05));
    expect(h.tool.suppressions?.().pinching).toBe(true);
  });
  it('declines a press off the frames', () => {
    expect(setup().tool.start({ framePoint: [0.5, y, 0.5], screenPoint: { x: 0, y: 0 } })).toBeUndefined();
  });
  it('owns the markings it was given', () => {
    expect(setup().tool.ownsMarking?.(m)).toBe(true);
  });
});

describe('placingTool: its chrome', () => {
  addGlyph('p:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
  const c = cut(0), [frame] = pack([c], aspects);
  const slot = { frame, w: 1000 } as FrameSlot;
  const y = A4 * 0.5;
  const tool = (m: PlacedMark, selected: boolean) => {
    const host = {
      zoom: () => ({ s: 1 }), aspects: () => aspects, state: () => state([c], { [c.id]: [m] }),
      selected: () => (selected ? { cut: c.id, mark: m } : undefined),
    } as unknown as ToolHost;
    return placingTool(host, { name: 'symbol', owns: () => true, place: () => {}, ghost: () => undefined, again: () => {}, resized: (s) => s });
  };
  const big: PlacedMark = { kind: 'symbol', text: 'x', font: 'p', glyphs: [[1, -0.5, 0.5]], at: [0.5, 0.5], size: 0.1 };
  it('is on the selected marking\'s box and its handles, and nowhere else', () => {
    // The box is 0.1 wide (100 px): handles of 8 px at its corners (0.55, y - 0.05).
    const t = tool(big, true);
    expect(t.isChromeAt?.(slot, [0.5, y, 0.5])).toBe(true);
    expect(t.isChromeAt?.(slot, [0.556, y - 0.05, 0.5])).toBe(true);
    expect(t.isChromeAt?.(slot, [0.57, y, 0.5])).toBe(false);
    expect(t.isChromeAt?.(slot, [0.1, y, 0.5])).toBe(false);
  });
  it('is nowhere with nothing selected', () => {
    expect(tool(big, false).isChromeAt?.(slot, [0.5, y, 0.5])).toBe(false);
  });
  it('reaches a handle of a small marking from beyond the ink\'s tap margin', () => {
    // A 10 px marking: its box is 24 px (corner 12 px from the centre), handles of 6 px.
    const t = tool({ ...big, size: 0.01 }, true);
    expect(t.isChromeAt?.(slot, [0.5175, y - 0.012, 0.5])).toBe(true);
    expect(t.isChromeAt?.(slot, [0.52, y - 0.012, 0.5])).toBe(false);
  });
});
