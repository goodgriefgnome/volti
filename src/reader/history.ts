/** Undo and redo of whole states. An entry `U` holds what to go back to, as the reader needs it. */
export class History<U> {
  private past: U[] = [];
  private future: U[] = [];

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  /** Remember the state before an edit. A new edit forgets what was undone. */
  record(before: U) {
    this.past.push(before);
    this.future = [];
  }

  /**
   * Step back: the entry to go back to, or undefined when there is none. `now(e)` is the entry
   * that redoes it, made from the state as it is now.
   */
  undo(now: (e: U) => U): U | undefined {
    const e = this.past.pop();
    if (e) this.future.push(now(e));
    return e;
  }

  redo(now: (e: U) => U): U | undefined {
    const e = this.future.pop();
    if (e) this.past.push(now(e));
    return e;
  }
}
