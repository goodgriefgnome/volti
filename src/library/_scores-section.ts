// The library's scores: searching them, adding PDFs, and the lists of them, by subfolder, each score
// opening to its named excerpts, with their menus.

import { addExcerpt, changeExcerptCuts, deleteExcerpt, renameExcerpt } from '../dialogs/excerpts';
import { moveToFolder, renameFile, type ScoreFileHost } from '../dialogs/score-files';
import { sortedNames } from '../excerpts/names';
import { spanLabel } from '../excerpts/span';
import { byFolder, folderOf, subfolders, titleOf } from '../originals/path-utils';
import { NoAccess, type SourceFile } from '../originals/types';
import type { ExcerptName, Score } from '../scores/model';
import { setlistsWith } from '../setlists/model';
import { button, el, plural } from '../ui/dom';
import { showMenu } from '../ui/overlay';
import type { LibraryHost } from './_host';
import { openIncoming } from './_incoming';
import { expandableRow, moreButton } from './_rows';
import { loadClosedFolders, saveClosedFolders } from './_store';

export class ScoresSection {
  /** Searching, and Add PDFs. */
  readonly tools = el('div', 'tools');
  readonly list = el('ul', 'list scores');
  readonly search = el('input', 'search');
  private fileInput = el('input');
  private query = '';
  /** The subfolder lists closed by hand, by path; the others are open. Read once, then kept here. */
  private closedFolders: Set<string> | undefined;
  /** For giving each subfolder list an id. */
  private rowSeq = 0;
  /** For the dialogs about a score's file. */
  private files: ScoreFileHost = { say: (t) => this.lib.toast.say(t), changed: (c) => this.lib.filesChanged([c]) };

  constructor(private lib: LibraryHost) {
    this.search.type = 'search';
    this.search.id = 'search';
    this.search.placeholder = 'Find a score or excerpt';
    this.search.setAttribute('aria-label', 'Find a score or excerpt');
    this.search.addEventListener('input', () => { this.query = this.search.value; this.render(); });

    this.fileInput.type = 'file';
    this.fileInput.id = 'import-files';
    this.fileInput.accept = 'application/pdf,.pdf,image/*';
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => void this.addPdfs());
    this.tools.append(this.search, button('Add PDFs', () => this.fileInput.click()), this.fileInput);
  }

  /** Read which subfolder lists were closed by hand, the first time. */
  async load() {
    this.closedFolders ??= new Set(await loadClosedFolders());
  }

  /** The files picked, in the screen for incoming files. */
  private addPdfs() {
    const files = [...(this.fileInput.files ?? [])];
    this.fileInput.value = '';
    if (files.length) void openIncoming(this.lib, files.map((file) => ({ file })));
  }

  render() {
    const { lib } = this;
    const q = this.query.trim().toLowerCase();
    const matches = (s: SourceFile) => !q || `${titleOf(s.path)} ${folderOf(s.path)}`.toLowerCase().includes(q);
    // Named excerpts whose names match, found under their scores.
    const hits = (s: SourceFile) => {
      const score = lib.saved.get(s.id);
      return q && score ? sortedNames(score).filter((x) => x.name.toLowerCase().includes(q)).map((x) => this.excerptHit(s, score, x)) : [];
    };
    this.list.replaceChildren();
    if (!lib.originals.length) {
      this.list.append(el('li', 'empty', lib.reading ? 'Reading the scores…' : lib.folder.kind === 'none'
        ? 'No scores yet. Link your scores folder, add PDFs, or share a PDF to Volti from another app.'
        : 'No PDFs or images found in this folder or its subfolders.'));
      return;
    }
    // The top of the folder, then a list for each subfolder; while searching, only lists with matches.
    let found = false;
    for (const { folder, originals } of byFolder(lib.originals)) {
      const rows = originals.flatMap((s) => [...(matches(s) ? [this.scoreRow(s)] : []), ...hits(s)]);
      if (!rows.length && (q || !folder)) continue;
      found ||= rows.length > 0;
      if (folder) this.list.append(this.folderList(folder, rows, !!q));
      else this.list.append(...rows);
    }
    if (!found) this.list.append(el('li', 'empty', `Nothing matches “${this.query}”.`));
  }

  /** A subfolder's scores under its heading, which opens and closes the list (remembered); a search opens it. */
  private folderList(folder: string, rows: HTMLElement[], searching: boolean): HTMLLIElement {
    const closed = this.closedFolders ??= new Set();
    const open = searching || !closed.has(folder);
    const li = el('li', 'folder-list' + (open ? ' open' : ''));
    const list = el('ul', 'list scores sub');
    list.id = 'folder-' + ++this.rowSeq;
    list.hidden = !open;
    list.append(...rows);
    const head = button('', () => {
      const now = Boolean(list.hidden);
      list.hidden = !now;
      li.classList.toggle('open', now);
      head.setAttribute('aria-expanded', String(now));
      // A search opens lists for the while; what is closed by hand is remembered.
      if (searching) return;
      if (now) closed.delete(folder); else closed.add(folder);
      void saveClosedFolders([...closed]);
    }, 'folder-head');
    head.append(el('span', 'chev'), el('span', '', folder.split('/').join(' / ')));
    head.setAttribute('aria-expanded', String(open));
    head.setAttribute('aria-controls', list.id);
    li.append(head, list);
    return li;
  }

  /** A named excerpt found by searching: its name, with its score's, as names are only unique within a score. */
  private excerptHit(o: SourceFile, score: Score, x: ExcerptName): HTMLLIElement {
    const li = el('li', 'score hit');
    const open = button('', () => this.lib.readExcerpt(o, x), 'open');
    const pages = spanLabel(score.cuts, x, this.lib.shapes.get(score.id));
    open.append(el('span', 'score-title', `${x.name} · ${titleOf(o.path)}`));
    if (pages) open.append(el('span', 'score-folder', pages));
    open.setAttribute('aria-label', `${x.name}, an excerpt of ${titleOf(o.path)}`);
    li.append(el('span', 'expand'), open, this.excerptMore(o, score, x));
    return li;
  }

  /** A score: tap to open it; the arrow slides its named excerpts open; ⋯ for the rest. */
  private scoreRow(s: SourceFile): HTMLLIElement {
    const { lib } = this;
    const score = lib.saved.get(s.id), names = score ? sortedNames(score) : [];
    const title = button('', () => lib.open(s), 'open');
    const name = el('span', 'score-title', titleOf(s.path));
    title.append(name);
    const n = setlistsWith(lib.setlists, s.id).length;
    const meta = [names.length ? plural(names.length, 'excerpt') : '', n ? `in ${plural(n, 'setlist')}` : ''].filter(Boolean).join(' · ');
    if (meta) title.append(el('span', 'score-folder', meta));

    const more = moreButton(titleOf(s.path), (at) => showMenu(at, titleOf(s.path), [
      ...lib.addToItems(at, s.id, titleOf(s.path)),
      { label: 'Add excerpt…', run: () => void lib.withPages(s, (sc) => addExcerpt(sc, titleOf(s.path), lib.excerptHost(s.id))) },
      { label: 'Rename…', run: () => renameFile(this.files, s) },
      { label: 'Export PDF…', run: () => lib.exportPdf(titleOf(s.path), [{ scoreId: s.id }]) },
      { label: 'Move to folder…', run: () => moveToFolder(this.files, s, subfolders(lib.originals)) },
      { label: 'Remove', run: async () => {
        try {
          await s.remove();
        } catch (e) {
          if (!(e instanceof NoAccess)) console.error(e);
          lib.say(e instanceof NoAccess ? 'Volti needs permission to change files in the scores folder to remove one.' : `Could not remove it (${(e as Error).name}).`);
          return;
        }
        lib.say(`Removed “${titleOf(s.path)}”. It is in Recently removed for a week.`);
        lib.filesChanged([{ gone: s.id }]);
      } },
    ]));

    let excerpts: HTMLElement | undefined;
    if (score && names.length) {
      excerpts = el('ul', 'entries excerpts');
      excerpts.setAttribute('aria-label', `Named excerpts of ${titleOf(s.path)}`);
      for (const x of names) excerpts.append(this.excerptRow(s, score, x));
    }
    return expandableRow({
      cls: 'score set',
      id: s.id,
      open: lib.openRows,
      label: `Named excerpts of ${titleOf(s.path)}`,
      head: [title, more],
      inner: excerpts,
    });
  }

  /** A named excerpt of a score: tap to read it; ⋯ to rename, change or delete it. */
  private excerptRow(o: SourceFile, score: Score, x: ExcerptName): HTMLLIElement {
    const { lib } = this;
    const li = el('li', 'excerpt');
    const pages = spanLabel(score.cuts, x, lib.shapes.get(score.id));
    const open = button('', () => lib.readExcerpt(o, x), 'open');
    open.append(el('span', 'item-title', x.name));
    if (pages) open.append(el('span', 'meta', pages));
    li.append(open, this.excerptMore(o, score, x));
    return li;
  }

  /** A named excerpt's ⋯ menu, under its score and in search results alike. */
  private excerptMore(o: SourceFile, score: Score, x: ExcerptName): HTMLButtonElement {
    const { lib } = this;
    return moreButton(x.name, (at) => showMenu(at, x.name, [
      ...lib.addToItems(at, o.id, x.name, x),
      { label: 'Rename…', run: () => renameExcerpt(score, x, lib.excerptHost(o.id)) },
      { label: 'Change cuts…', run: () => void lib.withPages(o, (sc) => changeExcerptCuts(sc, x, lib.excerptHost(o.id))) },
      { label: 'Export PDF…', run: () => lib.exportPdf(`${titleOf(o.path)} - ${x.name}`, [{ scoreId: o.id, first: x.first, last: x.last }]) },
      { label: 'Delete…', run: () => deleteExcerpt(score, x, lib.excerptHost(o.id)) },
    ]));
  }
}
