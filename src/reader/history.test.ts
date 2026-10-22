import { describe, expect, it } from 'vitest';
import type { State } from '../pieces/model';
import { cut, state } from '../pieces/testing';
import { History } from './history';

const states = (): State[] => [state([cut(0)]), state([cut(1)]), state([cut(2)])];

describe('History', () => {
  it('undoes and redoes, showing the cut of the edit', () => {
    const [a, b, c] = states(), h = new History();
    h.record(a, 'x');
    h.record(b, 'y');
    expect(h.undo(c)).toEqual({ state: b, focus: 'y' });
    expect(h.undo(b)).toEqual({ state: a, focus: 'x' });
    expect(h.canUndo).toBe(false);
    expect(h.redo(a)).toEqual({ state: b, focus: 'x' });
    expect(h.redo(b)).toEqual({ state: c, focus: 'y' });
    expect(h.canRedo).toBe(false);
  });
  it('forgets what was undone when a new edit is made', () => {
    const [a, b, c] = states(), h = new History();
    h.record(a);
    h.undo(b);
    expect(h.canRedo).toBe(true);
    h.record(c);
    expect(h.canRedo).toBe(false);
    expect(h.redo(b)).toBeUndefined();
  });
});
