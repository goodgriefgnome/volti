import { describe, expect, it } from 'vitest';
import { History } from './_history';

interface E { state: string; focus?: string }

describe('History', () => {
  it('undoes and redoes, showing the cut of the edit', () => {
    let now = 'c';
    const h = new History<E>();
    const back = (e: E) => ({ ...e, state: now });
    h.record({ state: 'a', focus: 'x' });
    h.record({ state: 'b', focus: 'y' });
    expect(h.undo(back)).toEqual({ state: 'b', focus: 'y' });
    now = 'b';
    expect(h.undo(back)).toEqual({ state: 'a', focus: 'x' });
    expect(h.canUndo).toBe(false);
    now = 'a';
    expect(h.redo(back)).toEqual({ state: 'b', focus: 'x' });
    now = 'b';
    expect(h.redo(back)).toEqual({ state: 'c', focus: 'y' });
    expect(h.canRedo).toBe(false);
  });
  it('forgets what was undone when a new edit is made', () => {
    const h = new History<E>();
    h.record({ state: 'a' });
    h.undo((e) => ({ ...e, state: 'b' }));
    expect(h.canRedo).toBe(true);
    h.record({ state: 'c' });
    expect(h.canRedo).toBe(false);
    expect(h.redo((e) => e)).toBeUndefined();
  });
});
