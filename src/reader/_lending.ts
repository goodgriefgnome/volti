// The lend stack: the tool equipped by its button at the bottom, and the tools lent on top of it,
// by a selection or for one press. Pure: what equipping and unequipping does is the reader's.

/** Why a tool is on the stack above the bottom. */
export type LendReason = 'selection' | 'press';

/** What a change to the stack did, for the reader to tell the tools: in the order to tell them. */
export interface StackChange<T> { unequipped: T[]; equipped: T[] }

interface Entry<T> { tool: T; reason?: LendReason }

export class LendStack<T> {
  /** The bottom first; only the bottom has no reason. */
  private entries: Entry<T>[];

  constructor(bottom: T) {
    this.entries = [{ tool: bottom }];
  }

  /** The tool on top. */
  get active(): T {
    return this.entries[this.entries.length - 1].tool;
  }

  /** The tool equipped by its button. */
  get bottom(): T {
    return this.entries[0].tool;
  }

  /** Whether `reason` has a lend on the stack. */
  has(reason: LendReason): boolean {
    return this.entries.some((e) => e.reason === reason);
  }

  /** A tool equipped by its button: the stack is only it. */
  equip(tool: T): StackChange<T> {
    return this.become([{ tool }]);
  }

  /** Lend `tool` for `reason`, replacing a lend for that reason already there; nothing when it is already on top. */
  lend(tool: T, reason: LendReason): StackChange<T> {
    // A tool is on the stack only once: one already there, covered or on top, moves nothing.
    if (this.entries.some((e) => e.tool === tool)) return { unequipped: [], equipped: [] };
    const next = [...this.entries], at = next.findIndex((e) => e.reason === reason);
    if (at >= 0) next[at] = { tool, reason };
    else next.push({ tool, reason });
    return this.become(next);
  }

  /** Take the lend for `reason` off, wherever it is. */
  end(reason: LendReason): StackChange<T> {
    return this.become(this.entries.filter((e) => e.reason !== reason));
  }

  /** Make the stack `next`; the tools that left it, then the tools that came on. */
  private become(next: Entry<T>[]): StackChange<T> {
    const was = this.entries.map((e) => e.tool), now = next.map((e) => e.tool);
    this.entries = next;
    return { unequipped: was.filter((t) => !now.includes(t)).reverse(), equipped: now.filter((t) => !was.includes(t)) };
  }
}
