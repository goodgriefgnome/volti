// The reader's edits: taking one (its undo step, carrying it through the Reading to the setlists
// and named excerpts, saving, showing it), the eraser's sweep as one undo step, undo and redo
// across the scores read, and saving.

import type { State } from '../scores/model';
import type { Setlist } from '../setlists/model';
import { History } from './_history';
import type { OpenScore } from './_open-scores';
import type { Pager } from './_pager';
import type { Reading, ReadingSnapshot } from './_reading';
import { Saver } from './_saver';
import type { Screen } from './_screen';
import type { FrameSlot } from './_slots';

/**
 * Undo keeps whole states: each entry is a score's state before an edit, what was read with the
 * setlists (whose excerpts follow the edit), the item it was made in, and the cut to show.
 */
interface Undo { open: OpenScore; state: State; reading: ReadingSnapshot; k: number; focus?: string }

export interface ChangesHost {
  reading: Reading;
  /** What the toolbar shows may have changed. */
  changed(): void;
  /** A save failed: say so. */
  saveFailed(e: unknown): void;
}

export class Changes {
  readonly saver: Saver;
  private undos = new History<Undo>();

  /** `setlists` are the setlists as loaded, as last written. */
  constructor(private host: ChangesHost, private pager: Pager, private screen: Screen, setlists: readonly Setlist[]) {
    this.saver = new Saver(() => host.reading.setlists, setlists, (e) => host.saveFailed(e));
  }

  get canUndo(): boolean { return this.undos.canUndo; }
  get canRedo(): boolean { return this.undos.canRedo; }

  /**
   * Take a new state from an edit: remember the old one for undo, save, reflow, and show the
   * frame holding `focus` (or stay where you are, if that cut is gone). Undo shows it too. The
   * selection is the caller's to keep.
   */
  commit(s: State, focus?: string) {
    const { host, pager } = this;
    const cur = pager.current!;
    this.undos.record({ open: cur, state: cur.state, reading: host.reading.snapshot(), k: pager.k, focus });
    // Every setlist's excerpts of the score, and its named excerpts, follow the edit.
    this.setState(host.reading.edited(pager.k, cur.id, cur.state.score.cuts, s), focus);
  }

  /** Show the current score in state `s`, saving it; the setlists have been changed already. */
  private setState(s: State, focus?: string) {
    const cur = this.pager.current!;
    cur.state = s;
    this.saver.soon(cur);
    this.host.changed();
    this.pager.relayout(s, focus);
  }

  /** The eraser took strokes away: show and save them gone, but leave the undo step until it lifts. */
  showSweep(s: State, slot: FrameSlot) {
    const cur = this.pager.current!;
    cur.state = s;
    this.saver.soon(cur);
    this.screen.drawInk(slot, s);
  }

  /** One undo step for the whole sweep of the eraser. */
  endSweep(before: State, slot: FrameSlot) {
    const { host, pager } = this;
    this.undos.record({ open: pager.current!, state: before, reading: host.reading.snapshot(), k: pager.k, focus: slot.frame.items[0]?.cut.id });
    pager.refreshFrames();
    slot.frame = pager.frames[slot.index];
    host.changed();
  }

  undo() {
    const e = this.undos.undo((e) => ({ ...e, state: e.open.state, reading: this.host.reading.snapshot() }));
    if (e) this.restore(e);
  }

  redo() {
    const e = this.undos.redo((e) => ({ ...e, state: e.open.state, reading: this.host.reading.snapshot() }));
    if (e) this.restore(e);
  }

  /** Put back a score and the setlists as they were, showing the score where the edit was made. */
  private restore(e: Undo) {
    const { pager } = this;
    this.host.reading.restore(e.reading);
    if (e.k === pager.k && pager.current === e.open) { this.setState(e.state, e.focus); return; }
    e.open.state = e.state;
    this.saver.soon(e.open);
    void pager.goTo(e.k, e.focus);
  }
}
