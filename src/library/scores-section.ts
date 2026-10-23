// The library's scores: searching them, adding PDFs, and the lists of them, by subfolder, each score
// opening to its named excerpts, with their menus.

import { addExcerpt, changeExcerptCuts, deleteExcerpt, renameExcerpt } from '../dialogs/excerpts';
import { sortedNames } from '../excerpts/names';
import { spanLabel } from '../excerpts/span';
import { importFiles, removeImported } from '../originals/imported';
import type { Original } from '../originals/originals';
import type { ExcerptName, Score } from '../scores/model';
import { setlistsWith } from '../setlists/model';
import { button, el, lockIcon, plural } from '../ui/dom';
import { showMenu } from '../ui/overlay';
import { moveAdded, renameFile } from './dialogs';
import { byFolder } from './folders';
import type { LibraryHost } from './host';
import { expandableRow, moreButton } from './rows';
import { loadClosedFolders, saveClosedFolders } from './store';

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

  private async addPdfs() {
    const { lib } = this;
    let result;
    try {
      result = await importFiles(this.fileInput.files ?? []);
    } catch (e) {
      console.error(e);
      lib.say(`Could not add them (${(e as Error).name}).`);
      return;
    } finally {
      this.fileInput.value = '';
    }
    const { added, already } = result;
    const have = already.length === 1 ? `“${already[0]}” is already in the library.` : already.length ? `${already.length} were already in the library.` : '';
    lib.say([added ? `Added ${plural(added, 'score')}.` : '', have].filter(Boolean).join(' ') || 'No PDFs or images were selected.');
    await lib.refresh();
  }

  render() {
    const { lib } = this;
    const q = this.query.trim().toLowerCase();
    const matches = (s: Original) => !q || `${s.title} ${s.folder}`.toLowerCase().includes(q);
    // Named excerpts whose names match, found under their scores.
    const hits = (s: Original) => {
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
  private excerptHit(o: Original, score: Score, x: ExcerptName): HTMLLIElement {
    const li = el('li', 'score hit');
    const open = button('', () => this.lib.readExcerpt(o, x), 'open');
    const pages = spanLabel(score.cuts, x, this.lib.shapes.get(score.id));
    open.append(el('span', 'score-title', `${x.name} · ${o.title}`));
    if (pages) open.append(el('span', 'score-folder', pages));
    open.setAttribute('aria-label', `${x.name}, an excerpt of ${o.title}`);
    li.append(el('span', 'expand'), open);
    return li;
  }

  /** A score: tap to open it; the arrow slides its named excerpts open; ⋯ for the rest. */
  private scoreRow(s: Original): HTMLLIElement {
    const { lib } = this;
    const score = lib.saved.get(s.id), names = score ? sortedNames(score) : [];
    const title = button('', () => lib.open(s), 'open');
    const name = el('span', 'score-title', s.title);
    if (lib.locked.has(s.id)) name.append(lockIcon('Needs its password'));
    title.append(name);
    const n = setlistsWith(lib.setlists, s.id).length;
    const meta = [names.length ? plural(names.length, 'excerpt') : '', n ? `in ${plural(n, 'setlist')}` : ''].filter(Boolean).join(' · ');
    if (meta) title.append(el('span', 'score-folder', meta));
    if (s.location === 'imported') title.append(el('span', 'badge', 'Added'));

    const more = moreButton(s.title, (at) => showMenu(at, s.title, [
      ...lib.addToItems(at, s.id, s.title),
      { label: 'Add excerpt…', run: () => void lib.withPages(s, (sc) => addExcerpt(sc, s.title, lib.excerptHost(s.id))) },
      { label: 'Rename…', run: () => renameFile(lib, s) },
      { label: 'Export PDF…', run: () => lib.exportPdf(s.title, [{ scoreId: s.id }]) },
      s.location === 'imported' && { label: 'Move to folder…', run: () => moveAdded(lib, s) },
      s.location === 'imported' && { label: 'Remove from Volti', run: async () => {
        await removeImported(s);
        lib.say(`Removed “${s.title}”.`);
        await lib.refresh();
      } },
    ]));

    let excerpts: HTMLElement | undefined;
    if (score && names.length) {
      excerpts = el('ul', 'entries excerpts');
      excerpts.setAttribute('aria-label', `Named excerpts of ${s.title}`);
      for (const x of names) excerpts.append(this.excerptRow(s, score, x));
    }
    return expandableRow({
      cls: 'score set',
      id: s.id,
      open: lib.openRows,
      label: `Named excerpts of ${s.title}`,
      head: [title, more],
      inner: excerpts,
    });
  }

  /** A named excerpt of a score: tap to read it; ⋯ to rename, change or delete it. */
  private excerptRow(o: Original, score: Score, x: ExcerptName): HTMLLIElement {
    const { lib } = this;
    const li = el('li', 'excerpt');
    const pages = spanLabel(score.cuts, x, lib.shapes.get(score.id));
    const open = button('', () => lib.readExcerpt(o, x), 'open');
    open.append(el('span', 'item-title', x.name));
    if (pages) open.append(el('span', 'meta', pages));
    const more = moreButton(x.name, (at) => showMenu(at, x.name, [
      ...lib.addToItems(at, o.id, x.name, x),
      { label: 'Rename…', run: () => renameExcerpt(score, x, lib.excerptHost(o.id)) },
      { label: 'Change cuts…', run: () => void lib.withPages(o, (sc) => changeExcerptCuts(sc, x, lib.excerptHost(o.id))) },
      { label: 'Export PDF…', run: () => lib.exportPdf(`${o.title} - ${x.name}`, [{ scoreId: o.id, first: x.first, last: x.last }]) },
      { label: 'Delete…', run: () => deleteExcerpt(score, x, lib.excerptHost(o.id)) },
    ]));
    li.append(open, more);
    return li;
  }
}
