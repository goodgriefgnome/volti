import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Zoom } from '../../render/zoom';
import { handTool } from './_hand';
import type { HandHost, Press } from './_tool';

const press: Press = { framePoint: [0, 0, 0.5], screenPoint: { x: 100, y: 100 } };

describe('handTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const setup = (cuts: boolean) => {
    const calls: string[] = [];
    const zooms: Zoom[] = [];
    const host = {
      zoom: () => ({ s: 2, x: -300, y: 0 }), view: () => ({ top: 0, W: 1000, H: 800 }), setZoom: (z: Zoom) => void zooms.push(z),
      toggleToolbar: () => void calls.push('toggle'), cutsOn: () => cuts, cutMenu: () => void calls.push('menu'),
    } as unknown as HandHost;
    return { calls, zooms, tool: handTool(host) };
  };
  it('pans as the pointer moves', () => {
    const { zooms, tool } = setup(false);
    const use = tool.start(press)!;
    use.move([0, 0, 0.5], { x: 130, y: 100 });
    expect(zooms).toHaveLength(1);
    expect(zooms[0].s).toBe(2);
    expect(zooms[0].x).toBe(-270);
  });
  it('hides or shows the toolbar on a tap, not after a drag or a long hold', () => {
    const a = setup(false);
    a.tool.start(press)!.end(false);
    expect(a.calls).toEqual(['toggle']);
    const b = setup(false);
    const use = b.tool.start(press)!;
    use.move([0, 0, 0.5], { x: 160, y: 100 });
    use.end(false);
    expect(b.calls).toEqual([]);
    const c = setup(false);
    const held = c.tool.start(press)!;
    vi.advanceTimersByTime(600);
    held.end(false);
    expect(c.calls).toEqual([]);
  });
  it('opens the cut menu on a long press while Cuts is on, and ends the pan', () => {
    const { calls, zooms, tool } = setup(true);
    const use = tool.start(press)!;
    vi.advanceTimersByTime(600);
    expect(calls).toEqual(['menu']);
    use.move([0, 0, 0.5], { x: 200, y: 100 });
    use.end(false);
    expect(zooms).toEqual([]);
    expect(calls).toEqual(['menu']);
  });
  it('opens no menu with Cuts off, or when the press moved, or was dropped', () => {
    const off = setup(false);
    off.tool.start(press);
    vi.advanceTimersByTime(600);
    expect(off.calls).toEqual([]);
    const moved = setup(true);
    moved.tool.start(press)!.move([0, 0, 0.5], { x: 120, y: 100 });
    vi.advanceTimersByTime(600);
    expect(moved.calls).toEqual([]);
    const dropped = setup(true);
    dropped.tool.start(press)!.drop();
    vi.advanceTimersByTime(600);
    expect(dropped.calls).toEqual([]);
  });
});
