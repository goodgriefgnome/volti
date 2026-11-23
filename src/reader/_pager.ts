// Where the reader is: the item read, its frames and the first one on the screen, going to an
// item and a screen, turning, offering the library's next score past a score's end, a setlist's
// entries changed, where to go after an edit, and remembering where it was read.

import { ends } from '../scores/excerpts';
import { titleOf } from '../originals/path-utils';
import type { SourceFile } from '../originals/types';
import { frameOf, pack, type Frame } from '../scores/frames';
import { loadScore } from '../scores/store';
import type { State } from '../scores/model';
import { failed, failedOnce } from '../ui/failure';
import { afterEdit, lastScreenStart, relistTarget } from './_landing';
import type { LastRead } from './_last-read';
import { openPages, type Item, type OpenScore, type OpenScores } from './_open-scores';
import { setlistItems, type Reading } from './_reading';
import type { Screen } from './_screen';
import { saveLastRead } from './_store';
import type { ToolDesk } from './_tool-desk';
import { offerScore, turnFrom, type Offer } from './_turning';

/** How long the next score is offered after turning past a score's end: as long as the toast saying so shows. */
const OFFER_MS = 3500;

export interface PagerHost {
  reading: Reading;
  scores: OpenScores;
  stage: HTMLElement;
  /** The library's scores; in a score's own reader, in the library's order, to turn to. */
  library: readonly SourceFile[];
  /** Put away the cut editor's menus and dialogs. */
  dismissEditor(): void;
  /** The cut editor shows its decoration on the screen again. */
  decorate(): void;
  info(text: string): void;
  say(text: string): void;
  hideToast(): void;
  /** What the toolbar shows may have changed. */
  changed(): void;
  /** Back to the library. */
  leave(): void;
}

export class Pager {
  private index = 0;
  private first = 0;
  private list: Frame[] = [];
  private goSeq = 0;
  private opening = false;
  /** The score offered by turning past this one's end: turning that way again while it is offered opens it. */
  private offered: Offer | null = null;

  constructor(private host: PagerHost, private screen: Screen, private desk: ToolDesk) {}

  get items(): Item[] { return this.host.reading.items; }

  /** The item being read. */
  get k(): number { return this.index; }

  /** The current item's frames. */
  get frames(): Frame[] { return this.list; }

  /** The first frame on the screen, among the current item's. */
  get frame(): number { return this.first; }
  set frame(f: number) { this.first = f; }

  /** An item is opening: nothing is shown until it has, and turning does nothing. */
  get loading(): boolean { return this.opening; }

  /** The current item's score, once open; undefined while it opens or when it can't be. */
  get current(): OpenScore | undefined { return this.host.scores.get(this.items[this.index].scoreId); }

  framesFor(k: number): Frame[] {
    const cur = this.host.scores.get(this.items[k].scoreId);
    return cur ? pack(this.host.reading.playedCuts(k, cur.state.score.cuts), cur.aspects) : [];
  }

  /** Go to item k: its first or last screen, or the screen holding a cut; `turned` as Screen.show says. */
  async goTo(k: number, at?: string | 'first' | 'last', turned = false) {
    const { host } = this;
    const seq = ++this.goSeq;
    this.opening = true;
    this.desk.deselect();
    if (k !== this.index) { host.dismissEditor(); host.info('Opening…'); }
    await host.scores.ensure(k, true);
    if (seq !== this.goSeq || host.scores.closed) return;
    this.opening = false;
    this.index = k;
    this.list = this.framesFor(k);
    const f = at === 'last' ? this.lastScreen(this.list) : at && at !== 'first' ? frameOf(this.list, at) : 0;
    this.first = Math.max(0, f);
    host.changed();
    await this.screen.show({ turned });
    host.scores.keepNear(this.index);
  }

  /**
   * The setlist's entries changed: list them again, and read entry `entryId` where it is now, or,
   * when it's gone, the entry now at `at` (or the last); with none left, back to the library.
   * Done when the entry is on its way to the screen.
   */
  relisted(entryId?: string, at = this.index): Promise<void> {
    const { host } = this;
    const s = host.reading.setlist;
    if (!s?.entries.length) { host.leave(); return Promise.resolve(); }
    const titles = Object.fromEntries(this.items.map((it) => [it.scoreId, it.title]));
    const was = this.items[this.index]?.entryId;
    host.reading.relist(setlistItems(s, new Map(host.library.map((o) => [o.id, o])), titles));
    const { k, same } = relistTarget(this.items, entryId, was, at);
    if (same) {
      // Still reading the same entry, only somewhere else in the setlist.
      this.index = k;
      host.changed();
      void this.screen.show({ place: 'keep' });
      host.scores.keepNear(k);
      return Promise.resolve();
    }
    return this.goTo(k, 'first');
  }

  /** The current item's frames again, from its state now, with nothing redrawn: the eraser's sweep ended. */
  refreshFrames() {
    this.list = this.framesFor(this.index);
  }

  /** What the current item plays changed: show it from its start. */
  replay() {
    this.list = this.framesFor(this.index);
    this.first = 0;
    void this.screen.show();
  }

  /** The current score's state changed (already set): reflow, and show the frame holding `focus`. */
  relayout(s: State, focus?: string) {
    const before = this.list.flatMap((f) => f.items.map((p) => p.cut));
    this.list = this.framesFor(this.index);
    const after = afterEdit(before, this.list, this.first, this.screen.shown, focus);
    if (after.kind === 'redraw') {
      this.screen.reframe(this.list, s);
      this.host.decorate();
      this.desk.refreshSelection();
      return;
    }
    this.first = after.frame;
    void this.screen.show({ place: after.place });
  }

  /** Where a score's last screen starts: at its last two frames when the one before last shows two. */
  private lastScreen(frames: Frame[]): number {
    return lastScreenStart(frames, this.host.stage.clientWidth, this.host.stage.clientHeight);
  }

  /**
   * Remember what is read and its first cut on the screen, to come back to (reader/_last-read.ts):
   * a score as an excerpt with no ends, an excerpt by the ends it plays now, a setlist by its entry.
   */
  saveSpot(cut: string | undefined) {
    if (!cut) return;
    const what = this.host.reading.what, item = this.items[this.index];
    const save = (last: LastRead) => void saveLastRead(last).catch((e) => failedOnce('save where this was read', e));
    if (what.kind === 'setlist') {
      if (item.entryId) save({ kind: 'setlist', id: what.id, entry: item.entryId, cut });
    } else save({ kind: 'excerpt', id: item.scoreId, ...(what.kind === 'excerpt' ? ends(what.excerpt) : {}), cut });
  }

  /** Turn a screen; in a setlist, past a score's end into the next one, or back into the one before. */
  turn(dir: 1 | -1) {
    if (this.opening) return;
    const place = { k: this.index, items: this.items.length, frame: this.first, shown: this.screen.shown, frames: this.list.length };
    const t = turnFrom(place, dir, this.host.reading.what.kind);
    if (t.to !== 'score') {
      this.offered = null;
      this.desk.deselect();
    }
    if (t.to === 'frame') {
      this.first = t.frame;
      this.host.changed();
      void this.screen.show({ turned: true });
    } else if (t.to === 'item') {
      this.host.changed();
      void this.goTo(t.k, t.at, true);
    } else if (t.to === 'score') {
      this.offerScore(t.dir);
    }
  }

  /**
   * Past a score's end (or before its start), in its own reader: offer the library's next score (or
   * the one before), and open it when turned that way again while the offer shows.
   */
  private offerScore(dir: 1 | -1) {
    const { host } = this;
    const here = host.library.findIndex((o) => o.id === this.items[0].scoreId);
    const o = here < 0 ? undefined : host.library[here + dir];
    const { open, offered } = offerScore(this.offered, dir, o?.id, Date.now(), OFFER_MS);
    this.offered = offered;
    if (!o) host.say(dir > 0 ? 'This is the last score.' : 'This is the first score.');
    else if (!open) host.say(`Tap again for “${titleOf(o.path)}”`);
    else {
      host.hideToast();
      void this.turnToScore(o, dir);
    }
  }

  /** Read score `o` instead: from its start going forward, from its last screen going back. */
  private async turnToScore(o: SourceFile, dir: 1 | -1) {
    const { host } = this;
    this.opening = true;
    host.dismissEditor();
    host.info('Opening…');
    let open: OpenScore;
    try {
      const { draw, drawProgressive, aspects, readable, close } = await openPages(o.id, o, true, true);
      if (host.scores.closed) { close?.(); return; }
      try {
        const { state } = await loadScore(o.id, aspects);
        open = { id: o.id, original: o, aspects, state, draw, drawProgressive, readable, close };
      } catch (e) {
        close?.();
        throw e;
      }
    } catch (e) {
      // Not opened (its password not given, say): stay where you were.
      this.opening = false;
      host.changed();
      void this.screen.show({ place: 'keep' });
      host.say(failed('open', e, titleOf(o.path)));
      return;
    }
    host.scores.adopt(open);
    host.reading.turnTo({ scoreId: o.id, title: titleOf(o.path), original: o });
    this.opening = false;
    await this.goTo(0, dir > 0 ? 'first' : 'last');
  }

  /** The reader is closing: an item that finishes opening now isn't shown. */
  stop() {
    this.host.scores.closed = true;
    this.screen.stop();
  }
}
