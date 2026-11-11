// The reader toolbar's menus and dialogs: the ⋯ menu of what is read (as its ⋯ menu in the
// library) and exporting. The menu under the title is in _title-menu.ts. What they change is the
// Reading's, and the reader shows and saves it.

import { askSetlistName, pickSetlist } from '../dialogs/setlists';
import { moveToFolder, renameFile, type ScoreFileHost } from '../dialogs/score-files';
import { openExportPdf } from '../dialogs/export-pdf';
import { type Excerpt, namedExcerptOf } from '../scores/excerpts';
import type { ExportPart } from '../export/pdf';
import { folderStatus } from '../originals/linked-folder';
import type { SourceFile } from '../originals/types';
import { subfolders, titleOf } from '../originals/path-utils';
import { defaultSetlist, duplicate, withSetlist, type Setlist } from '../setlists/model';
import { deleteSetlist, loadLastAddedTo, saveLastAddedTo } from '../setlists/store';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showMenu, type MenuItem } from '../ui/overlay';
import type { OpenScore } from './_open-scores';
import type { Reading } from './_reading';
import type { Saver } from './_saver';
import type { Toolbar } from './_toolbar';
import { showTitleMenu } from './_title-menu';
import { failed, failedOnce } from '../ui/failure';

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
  /** In a score's own reader: read the whole score, after an excerpt of it. */
  readWhole(): void;
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
  relisted(entryId?: string, at?: number): Promise<void>;
  /** Item k's score, opened if it isn't (asking for a password if need be); null when it can't be. */
  ensure(k: number): Promise<OpenScore | null>;
  /** In a named excerpt's reader: read `excerpt` of the score instead. */
  playExcerpt(excerpt: Excerpt): void;
  /** Leave the reader for the library. */
  leave(): void;
  /** Ask for access to the scores folder, from a tap, when what is read needs it; false when not allowed. */
  access(): Promise<boolean>;
}

export class ReaderMenus {
  constructor(private h: MenusHost) {}

  private get current() { return this.h.open(this.h.k()); }

  /** The menu under the title, to go to another entry or excerpt. */
  titleMenu() { showTitleMenu(this.h); }

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
      const x = cur && namedExcerptOf(cur.state.score, reading.what.excerpt);
      showMenu(anchor, x?.name ?? it.title, [
        ...add,
        { label: 'Export PDF…', run: () => void this.exportPdf() },
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
      void saveLastAddedTo(s.id).catch((e) => failedOnce('save the setlist last added to', e));
      this.h.saver.soon();
      this.h.say(`Added “${what}” to “${s.title}”.`);
    };
    const d = defaultSetlist(reading.setlists, lastAddedTo);
    return [
      ...(d ? [{ label: `Add to “${d.title}”`, run: () => add(d) }] : []),
      { label: 'Add to setlist…', run: () => pickSetlist(anchor, `Add “${what}” to`, reading.setlists, add, it.scoreId) },
    ];
  }

  /** The score's file dialogs, from here: what changes is shown here (the library follows the records). */
  private files(): ScoreFileHost {
    return {
      say: (t) => this.h.say(t),
      changed: (change) => {
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
      this.h.say(failed('remove', e, titleOf(o.path)));
      return;
    }
    this.h.leave();
  }

  /** The setlist's menu. */
  private setlistMenu(anchor: HTMLElement) {
    const { reading } = this.h, s = reading.setlist;
    if (!s) return;
    const change = (next: Setlist) => {
      reading.setlists = withSetlist(reading.setlists, next);
      this.h.saver.soon();
    };
    showMenu(anchor, s.title, [
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
    ]);
  }

  /** Only an archived setlist can be deleted; deleting the one read goes back to the library. */
  private confirmDelete(s: Setlist) {
    const d = showDialog(`Delete “${s.title}”?`);
    d.append(
      el('p', '', 'The scores, with their cuts and markings, stay in the library.'),
      buttonRow(button('Cancel', closeOverlay), button('Delete', async () => {
        closeOverlay();
        const { reading } = this.h, all = reading.setlists;
        try {
          await deleteSetlist(all, s.id);
        } catch (e) {
          this.h.say(failed('delete', e, s.title));
          return;
        }
        reading.setlists = all.filter((x) => x.id !== s.id);
        this.h.leave();
      }, 'danger')),
    );
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
      if (it.original && !it.missing) parts.push({ original: it.original, excerpt: reading.excerpt(k) });
      else missing.push(it.title);
    });
    if (!parts.length) { this.h.say('Its scores are all missing.'); return; }
    const cur = this.current, title = reading.items[0].title;
    const excerpt = reading.what.kind === 'excerpt' && cur ? reading.excerptName(0, cur.state.score, cur.aspects) : null;
    openExportPdf({
      title: reading.setlist?.title ?? (excerpt ? `${title} - ${excerpt}` : title),
      parts,
      missing,
      toFolder: (await folderStatus()).kind !== 'none',
      saved: (name) => this.h.say(`Saved “${name}.pdf” in Exports, in the scores folder.`),
    });
  }
}
