import type { State } from '../pieces/model';

/** Undo keeps whole states: each entry is the state before an edit, and the cut to show. */
export interface Undo { state: State; focus?: string }

export class History {
  private past: Undo[] = [];
  private future: Undo[] = [];

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  /** Remember the state before an edit. A new edit forgets what was undone. */
  record(before: State, focus?: string) {
    this.past.push({ state: before, focus });
    this.future = [];
  }

  /** Step back from `now`: the state to go back to, or undefined when there is none. */
  undo(now: State): Undo | undefined {
    const e = this.past.pop();
    if (e) this.future.push({ state: now, focus: e.focus });
    return e;
  }

  redo(now: State): Undo | undefined {
    const e = this.future.pop();
    if (e) this.past.push({ state: now, focus: e.focus });
    return e;
  }
}
