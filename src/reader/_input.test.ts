import { describe, expect, it } from 'vitest';
import { _route } from './_input';

const base = { onTab: false, turn: null, toolbarShown: true, eraserButton: false, onFrame: true, selecting: false } as const;

describe('_route', () => {
  it('gives a tab the press before a turn', () => {
    expect(_route({ ...base, onTab: true, turn: 'next' })).toBe('tab');
  });
  it('turns the page at the sides with every tool and the eraser button', () => {
    expect(_route({ ...base, turn: 'prev', selecting: true })).toBe('turn');
    expect(_route({ ...base, turn: 'next', eraserButton: true })).toBe('turn');
    expect(_route({ ...base, turn: 'next', toolbarShown: false })).toBe('turn');
  });
  it('lets only a tap in the middle through while the toolbar is hidden', () => {
    expect(_route({ ...base, toolbarShown: false })).toBe('toolbar-tap');
    expect(_route({ ...base, toolbarShown: false, selecting: true, onFrame: false })).toBe('toolbar-tap');
  });
  it('gives a press off the frames to the hand', () => {
    expect(_route({ ...base, onFrame: false })).toBe('hand');
    expect(_route({ ...base, onFrame: false, selecting: true })).toBe('hand');
  });
  it('selects before the tool, unless suppressed or the eraser button is down', () => {
    expect(_route({ ...base, selecting: true })).toBe('select');
    expect(_route({ ...base, selecting: false })).toBe('tool');
    expect(_route({ ...base, selecting: true, eraserButton: true })).toBe('tool');
  });
});
