// The reader toolbar's menus and dialogs: the setlist's scores, the ⋯ menu of what is read (as its
// ⋯ menu in the library), exporting, the score's named excerpts, and choosing the excerpt an entry
// plays. What they change is the
// Reading's, and the reader shows and saves it.

import { addExcerpt, changeExcerptCuts, deleteExcerpt, renameExcerpt, type ExcerptHost } from '../dialogs/excerpts';
import { askSetlistName, chooseSetlist } from '../dialogs/setlists';
import { givePassword } from '../dialogs/passwords';
import { moveToFolder, renameFile, type FileChange, type ScoreFileHost } from '../dialogs/score-files';
import { openAddScores } from '../dialogs/add-scores';
import { openExcerptPicker } from '../dialogs/excerpt-picker';
import { openExportPdf } from '../dialogs/export-pdf';
import { openScore } from '../dialogs/open-score';
import { type ExcerptSource } from '../dialogs/thumb-strip';
import { ends, spanLabel, spanOf, type Span } from '../excerpts/span';
import { nameOf, sortedNames } from '../excerpts/names';
import type { ExportPart } from '../export/pdf';
import { folderState } from '../originals/device-score-fs';
import { NoAccess, PasswordNotGiven, type SourceFile } from '../originals/types';
import { subfolders, titleOf } from '../originals/path-utils';
import { loadSavedScore, saveScore } from '../scores/store';
import { type ExcerptName, type Score } from '../scores/model';
import { addEntries, defaultSetlist, duplicate, moveEntry, withSetlist, type Entry, type Setlist } from '../setlists/model';
import { deleteSetlist, loadLastAddedTo, saveLastAddedTo } from '../setlists/store';
import { button, dpr, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showMenu, type MenuItem } from '../ui/overlay';
import { originalOf, type OpenScore } from './_open-scores';
import type { Reading } from './_reading';
import type { Saver } from './_saver';
import type { Toolbar } from './_toolbar';

/** What the menus need from the reader. */
export interface MenusHost {
  reading: Reading;
  toolbar: Toolbar;
  saver: Saver;
  /** The library's scores: for Add scores, and the subfolders to move a score to. */
  library: readonly SourceFile[];
  /** The item being read. */
  k(): number;
  /** Item k's score, once open. */
  open(k: number): OpenScore | undefined;
  /** Go to item k: its first screen, or the screen holding a cut. */
  goTo(k: number, at?: string): void;
  /** What the current item plays has changed: show it from its start. */
  replay(): void;
  /** The current score's names changed: show its title again. */
  retitle(): void;
  /** Put away the cut editor's menus and dialogs. */
  dismiss(): void;
  say(text: string, action?: [label: string, run: () => void]): void;
  /**
   * The setlist's entries changed: list them again, and read entry `entryId` (where it is now),
   * or, when it's gone, the entry now at `at` (or the last); with none left, back to the library.
   */
  relisted(entryId?: string, at?: number): void;
  /** In a named excerpt's reader: read `span` of the score instead. */
  readSpan(span: Span): void;
  /** Leave the reader for the library. */
  leave(): void;
  /** Ask for access to the scores folder, from a tap, when what is read needs it; false when not allowed. */
  access(): Promise<boolean>;
  /** A score's file changed (renamed, moved or removed): the library shows it on going back. */
  filesChanged(change: FileChange): void;
}

export class ReaderMenus {
  constructor(private h: MenusHost) {}

  private get current() { return this.h.open(this.h.k()); }

  /** In a setlist: its scores, to go to one. */
  scores() {
    const { reading } = this.h;
    showMenu(this.h.toolbar.anchor('scores'), reading.setlist?.title ?? 'Scores', reading.items.map((it, k) => ({
      label: `${k + 1}. ${it.title}${this.excerptLabel(k)}`,
      checked: k === this.h.k(),
      run: () => this.h.goTo(k),
    })));
  }

  /** " · Kyrie" or " · Pages 2–3" for an entry that plays an excerpt of a score that is open; otherwise nothing. */
  private excerptLabel(k: number): string {
    const cur = this.h.open(k);
    const label = cur && this.h.reading.excerptName(k, cur.state.score, cur.aspects);
    return label ? ` · ${label}` : '';
  }

  /**
   * The menu of what is read, with the items of its ⋯ menu in the library: the score's, the named
   * excerpt's, or the setlist's and then the entry being read's. Changing the cuts stays the
   * toolbar's Excerpt button, and the score's named excerpts its Excerpts button.
   */
  async more() {
    const { reading } = this.h, anchor = this.h.toolbar.anchor('more');
    this.h.dismiss();
    if (reading.what.kind === 'setlist') { this.setlistMenu(anchor); return; }
    const cur = this.current, it = reading.items[0], o = it.original;
    const add = this.addItems(anchor, await loadLastAddedTo());
    if (reading.what.kind === 'excerpt') {
      const x = cur && nameOf(cur.state.score, reading.what.span);
      showMenu(anchor, x?.name ?? it.title, [
        ...add,
        cur && x && { label: 'Rename…', run: () => renameExcerpt(cur.state.score, x, this.excerptHost(cur)) },
        { label: 'Export PDF…', run: () => void this.exportPdf() },
        cur && x && { label: 'Delete…', run: () => this.deleteExcerpt(cur, x) },
      ]);
      return;
    }
    showMenu(anchor, it.title, [
      ...add,
      o && { label: 'Rename…', run: () => renameFile(this.files(), o) },
      { label: 'Export PDF…', run: () => void this.exportPdf() },
      o && { label: 'Move to folder…', run: () => moveToFolder(this.files(), o, subfolders(this.h.library)) },
      o && { label: 'Remove', run: () => void this.remove(o) },
    ]);
  }

  /** "Add to <default setlist>" and "Add to setlist…" for the score or excerpt read, below `anchor`. */
  private addItems(anchor: HTMLElement, lastAddedTo: string | undefined): MenuItem[] {
    const { reading } = this.h, it = reading.items[0], cur = this.current;
    const what = (cur && reading.excerptName(0, cur.state.score, cur.aspects)) ?? it.title;
    const add = (s: Setlist) => {
      reading.addTo(reading.setlists.find((x) => x.id === s.id) ?? s);
      void saveLastAddedTo(s.id);
      this.h.saver.soon();
      this.h.say(`Added “${what}” to “${s.title}”.`);
    };
    const d = defaultSetlist(reading.setlists, lastAddedTo);
    return [
      ...(d ? [{ label: `Add to “${d.title}”`, run: () => add(d) }] : []),
      { label: 'Add to setlist…', run: () => chooseSetlist(anchor, `Add “${what}” to`, reading.setlists, add, it.scoreId) },
    ];
  }

  /** The score's file dialogs, from here: what changes is shown here, and told to the library. */
  private files(): ScoreFileHost {
    return {
      say: (t) => this.h.say(t),
      changed: (change) => {
        this.h.filesChanged(change);
        if (!('now' in change)) return;
        const cur = this.h.open(this.h.k());
        this.h.reading.renamed(change.now);
        if (cur?.id === change.now.id) cur.original = change.now;
        this.h.retitle();
      },
    };
  }

  /** Move the score's file into Recently removed, and go back to the library. */
  private async remove(o: SourceFile) {
    try {
      await o.remove();
    } catch (e) {
      if (!(e instanceof NoAccess)) console.error(e);
      this.h.say(e instanceof NoAccess ? 'Volti needs permission to change files in the scores folder to remove one.' : `Could not remove it (${(e as Error).name}).`);
      return;
    }
    this.h.filesChanged({ gone: o.id });
    this.h.leave();
  }

  /** Delete the named excerpt being read, then read the next of the score's (or the one before); with none left, back to the library. */
  private deleteExcerpt(cur: OpenScore, x: ExcerptName) {
    const host = this.excerptHost(cur), at = sortedNames(cur.state.score).findIndex((n) => n.name === x.name);
    deleteExcerpt(cur.state.score, x, {
      ...host,
      save: (score, setlists) => {
        host.save(score, setlists);
        const left = sortedNames(score), next = left[at] ?? left[at - 1];
        if (next) this.h.readSpan(ends(next)); else this.h.leave();
      },
    });
  }

  /** The setlist's menu, then the entry being read's. */
  private setlistMenu(anchor: HTMLElement) {
    const { reading } = this.h, s = reading.setlist, k = this.h.k(), e = reading.entry(k);
    if (!s) return;
    const i = e ? s.entries.indexOf(e) : -1;
    const change = (next: Setlist) => {
      reading.setlists = withSetlist(reading.setlists, next);
      this.h.saver.soon();
    };
    showMenu(anchor, s.title, [
      { label: 'Add scores…', run: () => void this.addScores() },
      { label: 'Rename…', run: () => askSetlistName('Rename setlist', s.title, 'Rename', (title) => change({ ...reading.setlist!, title })) },
      { label: 'Duplicate', run: () => {
        const c = duplicate(s);
        reading.setlists = [c, ...reading.setlists];
        this.h.saver.soon();
        this.h.say(`Made “${c.title}”.`);
      } },
      { label: 'Export PDF…', run: () => void this.exportPdf() },
      s.archived
        ? { label: 'Unarchive', run: () => { change({ ...reading.setlist!, archived: false }); this.h.say(`Unarchived “${s.title}”.`); } }
        : { label: 'Archive', run: () => { change({ ...reading.setlist!, archived: true }); this.h.say(`Archived “${s.title}”.`); } },
      s.archived && { label: 'Delete…', run: () => this.confirmDelete(s) },
      e && `Entry ${i + 1}: ${reading.items[k].title}`,
      e && i > 0 && { label: 'Move up', run: () => { change(moveEntry(s, i, i - 1)); this.h.relisted(e.id); } },
      e && i < s.entries.length - 1 && { label: 'Move down', run: () => { change(moveEntry(s, i, i + 1)); this.h.relisted(e.id); } },
      e && { label: 'Remove from setlist', run: () => this.removeEntry(s, e, i) },
    ]);
  }

  /** Take the entry being read out of the setlist, and read the next (or the one before), with Undo. */
  private removeEntry(s: Setlist, e: Entry, at: number) {
    const { reading } = this.h, title = reading.items[this.h.k()].title;
    reading.setlists = withSetlist(reading.setlists, { ...s, entries: s.entries.filter((x) => x !== e) });
    this.h.saver.soon();
    this.h.relisted(undefined, at);
    if (!reading.setlist?.entries.length) return;
    this.h.say(`Removed “${title}” from “${s.title}”.`, ['Undo', () => {
      const now = reading.setlist;
      if (!now) return;
      const entries = [...now.entries];
      entries.splice(Math.min(at, entries.length), 0, e);
      reading.setlists = withSetlist(reading.setlists, { ...now, entries });
      this.h.saver.soon();
      this.h.relisted(e.id);
    }]);
  }

  /** Only an archived setlist can be deleted; deleting the one read goes back to the library. */
  private confirmDelete(s: Setlist) {
    const d = showDialog(`Delete “${s.title}”?`);
    d.append(
      el('p', '', 'The scores, with their cuts and markings, stay in the library.'),
      buttonRow(button('Cancel', closeOverlay), button('Delete', async () => {
        closeOverlay();
        const { reading } = this.h, all = reading.setlists;
        reading.setlists = all.filter((x) => x.id !== s.id);
        await deleteSetlist(all, s.id);
        this.h.leave();
      }, 'danger')),
    );
  }

  /** Add scores to the end of the setlist read, as from the library. */
  private async addScores() {
    const { reading } = this.h, originals = this.h.library;
    // The scores as saved: a preview opens them from there.
    await this.h.saver.flush();
    const saved = await Promise.all(originals.map((o) => loadSavedScore(o.id)));
    const s = reading.setlist;
    if (!s) return;
    openAddScores({
      setlist: s,
      originals,
      saved: new Map(saved.filter((x): x is Score => !!x).map((x) => [x.id, x])),
      givePassword: (o) => givePassword(o).catch((e) => { console.error(e); this.h.say(`Could not open “${titleOf(o.path)}”.`); return false; }),
      open: (o) => openScore(o).catch((e) => {
        console.error(e);
        this.h.say(e instanceof PasswordNotGiven ? `“${titleOf(o.path)}” needs its password to open.` : `Could not open “${titleOf(o.path)}”.`);
        return null;
      }),
      add: (entries, scores) => {
        const now = reading.setlist;
        if (!now) return;
        // The scores excerpts were chosen from too, so the spans and the cuts they name agree.
        for (const x of scores) void saveScore(x.state);
        reading.setlists = withSetlist(reading.setlists, addEntries(now, entries));
        void saveLastAddedTo(now.id);
        this.h.saver.soon();
        this.h.relisted(reading.items[this.h.k()]?.entryId);
        this.h.say(`Added ${plural(entries.length, 'score')} to “${now.title}”.`);
      },
    });
  }

  /** Export what the reader pages through: the score, the excerpt, or the whole setlist. */
  async exportPdf() {
    const { reading } = this.h;
    // Exporting reads the PDFs.
    if (!(await this.h.access())) return;
    this.h.dismiss();
    // The export reads the scores as saved.
    await this.h.saver.flush();
    const parts: ExportPart[] = [], missing: string[] = [];
    reading.items.forEach((it, k) => {
      if (it.original && !it.missing) parts.push({ original: it.original, span: reading.span(k) });
      else missing.push(it.title);
    });
    if (!parts.length) { this.h.say('Its scores are all missing.'); return; }
    const cur = this.current, title = reading.items[0].title;
    const excerpt = reading.what.kind === 'excerpt' && cur ? reading.excerptName(0, cur.state.score, cur.aspects) : null;
    openExportPdf({
      title: reading.setlist?.title ?? (excerpt ? `${title} - ${excerpt}` : title),
      parts,
      missing,
      toFolder: (await folderState()).kind !== 'none',
      saved: (name) => this.h.say(`Saved “${name}.pdf” in Exports, in the scores folder.`),
    });
  }

  /** An open score's pages, for the excerpt picker. */
  private source(cur: OpenScore): ExcerptSource {
    return { state: cur.state, aspects: cur.aspects, page: async (p, w) => (await (await originalOf(cur)).draw(p + 1, Math.round(w * dpr()))).canvas };
  }

  /** Changing the open score's named excerpts from the reader, saved with the score. */
  private excerptHost(cur: OpenScore): ExcerptHost {
    return {
      setlists: this.h.reading.setlists,
      aspects: cur.aspects,
      save: (score, setlists) => {
        cur.state = { ...cur.state, score };
        if (setlists) this.h.reading.setlists = setlists;
        this.h.saver.soon(cur);
        this.h.retitle();
      },
      say: (t) => this.h.say(t),
    };
  }

  /** In a score's own reader: its named excerpts, to go to one, add one or change them. */
  excerpts() {
    const cur = this.current, cache = cur?.cache;
    if (!cur || !cache) return;
    this.h.dismiss();
    const score = cur.state.score, title = this.h.reading.items[0].title, names = sortedNames(score);
    const d = showDialog(`Excerpts of “${title}”`);
    const list = el('ul', 'excerpt-list');
    for (const x of names) {
      const li = el('li');
      const go = button('', () => {
        closeOverlay();
        this.h.goTo(this.h.k(), score.cuts[spanOf(score.cuts, x).i0]?.id);
      }, 'open');
      go.append(el('span', 'item-title', x.name));
      const pages = spanLabel(score.cuts, x, cur.aspects);
      if (pages) go.append(el('span', 'meta', pages));
      go.setAttribute('aria-label', `Go to ${x.name}`);
      const more = button('⋯', () => showMenu(more, x.name, [
        { label: 'Rename…', run: () => renameExcerpt(cur.state.score, x, this.excerptHost(cur)) },
        { label: 'Change cuts…', run: () => changeExcerptCuts(this.source(cur), x, this.excerptHost(cur)) },
        { label: 'Delete…', run: () => deleteExcerpt(cur.state.score, x, this.excerptHost(cur)) },
      ]), 'quiet more');
      more.setAttribute('aria-label', `More for ${x.name}`);
      more.setAttribute('aria-haspopup', 'menu');
      li.append(go, more);
      list.append(li);
    }
    if (!names.length) list.append(el('li', 'empty', 'No excerpts yet. Add one to name part of the score, such as the Kyrie.'));
    d.append(list, buttonRow(
      button('Add excerpt…', () => addExcerpt(this.source(cur), title, this.excerptHost(cur))),
      button('Close', closeOverlay, 'primary'),
    ));
  }

  /** In a setlist: choose which of the score's cuts this entry plays. In an excerpt: change the excerpt's cuts. */
  excerpt() {
    const cur = this.current, { reading } = this.h, k = this.h.k();
    if (!cur?.cache) return;
    this.h.dismiss();
    const pages = this.source(cur);
    const play = (span: Span) => {
      reading.play(k, span);
      // The score too: one opened for the first time isn't saved yet, and the span names its cuts.
      this.h.saver.soon(cur);
      this.h.replay();
    };
    if (reading.what.kind === 'excerpt') {
      // Give the named excerpt being read other cuts; every setlist entry that plays it moves with
      // it. An excerpt that lost its name to an edit (it came to be the whole score) just plays other cuts.
      const span = reading.what.span, name = nameOf(cur.state.score, span);
      if (name) changeExcerptCuts(pages, name, this.excerptHost(cur), play);
      else openExcerptPicker({ ...pages, question: `Which part of “${reading.items[0].title}” to read?`, verb: 'It plays', span, done: play });
      return;
    }
    const entry = reading.entry(k);
    if (!entry) return;
    openExcerptPicker({
      ...pages,
      question: `Which part of “${reading.items[k].title}” does entry ${k + 1} play?`,
      verb: 'This entry plays',
      named: true,
      span: entry,
      done: play,
    });
  }
}
