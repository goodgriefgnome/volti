// The Library screen: setlists, the scores folder, imported scores, and opening the reader. Code
// only this screen uses; what the reader also needs goes in ui/.

import type { Piece } from '../pieces/model';
import { loadSavedPiece } from '../pieces/store';
import { openReader, type Source } from '../reader/reader';
import {
  duplicate, moveEntry, newEntry, newSetlist, setlistsWith, spanLabel, type Entry, type Setlist,
} from '../setlists/model';
import { deleteSetlist, loadSetlists, saveChanged } from '../setlists/store';
import {
  allScores, canLinkFolder, folderState, importFiles, linkFolder, removeImported, titleFromId, unlinkFolder, unlockFolder,
  type FolderState, type Score,
} from '../sources/scores';
import type { Prefs } from '../storage/prefs';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showMenu } from '../ui/overlay';
import { askSetlistName, chooseSetlist } from '../ui/setlists';
import { Toast } from '../ui/toast';

/** The Library screen: setlists, the scores folder, imported scores, and the list to open them from. */
export class Library {
  private folder: FolderState = { kind: 'none' };
  private scores: Score[] = [];
  private setlists: Setlist[] = [];
  /** Pieces in setlists as last saved, for the excerpt each entry plays. */
  private pieces = new Map<string, Piece>();
  private query = '';
  /** What the library shows that isn't data, kept while the app runs. */
  private openRows = new Set<string>();
  private picked = new Set<string>();
  private showArchived = false;

  private root = el('main', 'library');
  private pickBar = el('div', 'pickbar');
  private folderPanel = el('section', 'folder');
  private setlistHead = el('div', 'head-tools');
  private setlistList = el('ul', 'list setlists');
  private list = el('ul', 'list scores');
  private status = el('p', 'status');
  private search = el('input', 'search');
  private fileInput = el('input');
  private toast = new Toast();

  constructor(private prefs: Prefs) {
    const header = el('header', 'masthead');
    const brand = el('h1', 'brand', 'Volti');
    const tagline = el('p', 'tagline', 'volti subito · turn the page');
    header.append(brand, tagline);

    this.search.type = 'search';
    this.search.id = 'search';
    this.search.placeholder = 'Find a score';
    this.search.setAttribute('aria-label', 'Find a score');
    this.search.addEventListener('input', () => { this.query = this.search.value; this.renderList(); });

    this.fileInput.type = 'file';
    this.fileInput.id = 'import-files';
    this.fileInput.accept = 'application/pdf,.pdf';
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', async () => {
      const n = await importFiles(this.fileInput.files ?? []);
      this.fileInput.value = '';
      this.say(n ? `Added ${n} score${n === 1 ? '' : 's'}.` : 'No PDFs were selected.');
      await this.refresh();
    });

    const tools = el('div', 'tools');
    tools.append(this.search, button('Add PDFs', () => this.fileInput.click()), this.fileInput);

    const setlistsHead = el('div', 'section-head');
    setlistsHead.append(el('h2', '', 'Setlists'), this.setlistHead);
    const scoresHead = el('div', 'section-head');
    scoresHead.append(el('h2', '', 'Scores'));

    this.pickBar.setAttribute('role', 'toolbar');
    this.pickBar.setAttribute('aria-label', 'Picked scores');
    this.pickBar.hidden = true;
    this.status.setAttribute('role', 'status');
    this.toast.el.classList.add('fixed');
    this.root.append(this.pickBar, header, this.status, setlistsHead, this.setlistList, scoresHead, this.folderPanel, tools, this.list);
    document.body.append(this.root, this.toast.el);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) closeOverlay(); });
  }

  say(text: string) {
    this.status.textContent = text;
  }

  async refresh() {
    this.folder = await folderState();
    this.renderFolder();
    try {
      this.scores = await allScores(this.folder);
    } catch (e) {
      // The folder may have been moved or deleted since it was linked.
      console.error(e);
      this.say('Could not read the scores folder. Link it again if it has moved.');
      this.scores = [];
    }
    await this.loadSetlists();
    this.renderList();
  }

  private async loadSetlists() {
    this.setlists = await loadSetlists();
    const ids = [...new Set(this.setlists.flatMap((s) => s.entries.map((e) => e.pieceId)))];
    const pieces = await Promise.all(ids.map((id) => loadSavedPiece(id)));
    this.pieces = new Map(pieces.filter((p): p is Piece => !!p).map((p) => [p.id, p]));
    this.renderSetlists();
  }

  private renderFolder() {
    const p = this.folderPanel;
    p.replaceChildren();
    const f = this.folder;
    if (f.kind === 'none') {
      const text = canLinkFolder()
        ? 'Link the folder on this tablet where you keep your PDF scores. Volti reads them where they are.'
        : 'This browser cannot link a folder. Add PDFs to keep copies in Volti instead.';
      p.append(el('p', '', text));
      if (canLinkFolder()) p.append(button('Link scores folder', () => void this.link(), 'primary'));
      return;
    }
    const name = el('p', 'folder-name');
    name.append(el('span', 'label', 'Scores folder'), el('strong', '', f.name));
    p.append(name);
    if (f.kind === 'locked') {
      p.append(button('Allow access', () => void this.unlock(), 'primary'));
    }
    p.append(
      button('Change', () => void this.link()),
      button('Unlink', async () => { await unlinkFolder(); this.say('Folder unlinked. Your markings are kept.'); await this.refresh(); }, 'quiet'),
    );
  }

  private async link() {
    try {
      if (await linkFolder()) await this.refresh();
    } catch (e) {
      this.say('That folder cannot be linked. Android blocks the Download folder itself and the top of internal storage; pick a folder inside them, such as Download/Scores.');
      console.error(e);
    }
  }

  private async unlock(): Promise<boolean> {
    const ok = await unlockFolder();
    if (ok) await this.refresh();
    else this.say('Volti needs access to the folder to open its scores.');
    return ok;
  }

  /* ---------- setlists ---------- */

  private scoreOf(id: string) { return this.scores.find((s) => s.id === id); }
  private titleOf(pieceId: string) { return this.scoreOf(pieceId)?.title ?? this.pieces.get(pieceId)?.title ?? titleFromId(pieceId); }

  /** Change the setlists, save the ones that changed, and show them. */
  private async change(next: Setlist[]) {
    const before = this.setlists;
    this.setlists = next;
    this.renderSetlists();
    this.renderList();
    await saveChanged(next, before);
  }

  private update(s: Setlist) {
    return this.change(this.setlists.map((x) => (x.id === s.id ? s : x)));
  }

  private renderSetlists() {
    const active = this.setlists.filter((s) => !s.archived), archived = this.setlists.filter((s) => s.archived);
    this.setlistHead.replaceChildren();
    if (archived.length) {
      const b = button(this.showArchived ? 'Hide archived' : `Show archived (${archived.length})`, () => {
        this.showArchived = !this.showArchived;
        this.renderSetlists();
      }, 'quiet');
      b.setAttribute('aria-pressed', String(this.showArchived));
      this.setlistHead.append(b);
    }
    this.setlistHead.append(button('New setlist', () => askSetlistName('New setlist', '', 'Next', (name) => {
      const s = newSetlist(name);
      this.openRows.add(s.id);
      void this.change([s, ...this.setlists]);
      this.addPieces(s.id);
    })));

    const list = this.setlistList;
    list.replaceChildren();
    if (!active.length) list.append(el('li', 'empty', 'No setlists yet. Tick scores below to make one.'));
    for (const s of active) list.append(this.setlistRow(s));
    // Archived setlists follow the others, in grey, only when asked for.
    if (this.showArchived) for (const s of archived) list.append(this.setlistRow(s));
  }

  /** A setlist: tap to play it; the arrow slides its pieces open; ⋯ for the rest. */
  private setlistRow(s: Setlist): HTMLLIElement {
    const open = this.openRows.has(s.id);
    const li = el('li', 'set' + (open ? ' open' : '') + (s.archived ? ' archived' : ''));
    const body = el('div', 'set-body');
    body.id = 'set-' + s.id;
    body.inert = !open;
    const expand = button('', () => {
      const now = !this.openRows.has(s.id);
      if (now) this.openRows.add(s.id); else this.openRows.delete(s.id);
      li.classList.toggle('open', now);
      expand.setAttribute('aria-expanded', String(now));
      body.inert = !now;
    }, 'expand');
    expand.append(el('span', 'chev'));
    expand.setAttribute('aria-expanded', String(open));
    expand.setAttribute('aria-controls', body.id);
    expand.setAttribute('aria-label', `Pieces in ${s.title}`);

    const play = button('', () => {
      if (s.entries.length) void this.play(s);
      else this.toast.say('This setlist has no pieces yet.');
    }, 'open');
    play.append(el('span', 'item-title setlist-title', s.title), el('span', 'meta', (s.archived ? 'Archived · ' : '') + plural(s.entries.length, 'piece')));

    const more = button('⋯', () => showMenu(more, s.title, [
      { label: 'Add pieces…', run: () => this.addPieces(s.id) },
      { label: 'Rename…', run: () => askSetlistName('Rename setlist', s.title, 'Rename', (title) => void this.update({ ...this.get(s.id)!, title })) },
      { label: 'Duplicate', run: () => this.duplicate(s) },
      s.archived
        ? { label: 'Unarchive', run: () => { void this.update({ ...this.get(s.id)!, archived: false }); this.toast.say(`Unarchived “${s.title}”.`); } }
        : { label: 'Archive', run: () => { void this.update({ ...this.get(s.id)!, archived: true }); this.toast.say(`Archived “${s.title}”.`); } },
      s.archived && { label: 'Delete…', run: () => this.confirmDelete(s) },
    ]), 'quiet more');
    more.setAttribute('aria-label', `More for ${s.title}`);
    more.setAttribute('aria-haspopup', 'menu');

    const entries = el('ol', 'entries');
    entries.setAttribute('aria-label', `Pieces in ${s.title}`);
    s.entries.forEach((e, i) => entries.append(this.entryRow(s, e, i, entries)));
    if (!s.entries.length) entries.append(el('li', 'empty', 'No pieces yet. Use ⋯ › Add pieces, or tick scores below.'));
    const inner = el('div', 'set-inner');
    inner.append(entries);
    body.append(inner);
    const head = el('div', 'set-head');
    head.append(expand, play, more);
    li.append(head, body);
    return li;
  }

  private get(id: string) { return this.setlists.find((s) => s.id === id); }

  private entryRow(s: Setlist, e: Entry, i: number, list: HTMLElement): HTMLLIElement {
    const title = this.titleOf(e.pieceId), piece = this.pieces.get(e.pieceId), missing = !this.scoreOf(e.pieceId);
    const excerpt = piece ? spanLabel(piece.cuts, e) : null;
    const li = el('li', 'entry');
    const handle = button('⋮⋮', () => {}, 'handle');
    handle.setAttribute('aria-label', `Move ${title}`);
    this.dragToReorder(handle, li, list, s, i);
    const open = button('', () => void this.play(s, e.id), 'open');
    open.append(el('span', 'item-title', title));
    if (piece?.key) open.append(el('span', 'meta', piece.key));
    if (excerpt) open.append(el('span', 'pill', excerpt));
    if (missing) open.append(el('span', 'pill missing', 'Missing'));
    const more = button('⋯', () => showMenu(more, title, [
      i > 0 && { label: 'Move up', run: () => void this.update(moveEntry(s, i, i - 1)) },
      i < s.entries.length - 1 && { label: 'Move down', run: () => void this.update(moveEntry(s, i, i + 1)) },
      !missing && { label: 'Choose the excerpt to play…', run: () => void this.play(s, e.id, true) },
      !!excerpt && { label: 'Play the whole piece', run: () => void this.update({ ...s, entries: s.entries.map((x) => (x === e ? { id: e.id, pieceId: e.pieceId } : x)) }) },
      { label: 'Remove from setlist', run: () => this.removeEntry(s, e) },
    ]), 'quiet more');
    more.setAttribute('aria-label', `More for ${title}`);
    more.setAttribute('aria-haspopup', 'menu');
    li.append(handle, el('span', 'num', String(i + 1)), open, more);
    return li;
  }

  private dragToReorder(handle: HTMLElement, li: HTMLElement, list: HTMLElement, s: Setlist, i: number) {
    handle.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      li.classList.add('dragging');
      let to = i;
      const rows = [...list.children] as HTMLElement[];
      const onMove = (m: PointerEvent) => {
        to = rows.findIndex((r) => m.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
        if (to < 0) to = rows.length - 1; else if (to > i) to -= 1;
        rows.forEach((r, k) => { r.style.boxShadow = k === to && k !== i ? `inset 0 ${to < i ? 3 : -3}px 0 var(--select)` : ''; });
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        li.classList.remove('dragging');
        rows.forEach((r) => { r.style.boxShadow = ''; });
        if (to !== i) void this.update(moveEntry(s, i, to));
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp, { once: true });
      handle.addEventListener('pointercancel', onUp, { once: true });
    });
  }

  private removeEntry(s: Setlist, e: Entry) {
    const at = s.entries.indexOf(e);
    void this.update({ ...s, entries: s.entries.filter((x) => x !== e) });
    this.toast.say(`Removed “${this.titleOf(e.pieceId)}” from “${s.title}”.`, ['Undo', () => {
      const now = this.get(s.id);
      if (!now) return;
      const entries = [...now.entries];
      entries.splice(Math.min(at, entries.length), 0, e);
      void this.update({ ...now, entries });
    }]);
  }

  private duplicate(s: Setlist) {
    const c = duplicate(s);
    this.openRows.add(c.id);
    void this.change([c, ...this.setlists]);
    this.toast.say(`Made “${c.title}”.`);
  }

  /** Only an archived setlist can be deleted. */
  private confirmDelete(s: Setlist) {
    const d = showDialog(`Delete “${s.title}”?`);
    d.append(
      el('p', '', 'The pieces, with their cuts and markings, stay in the library.'),
      buttonRow(button('Cancel', closeOverlay), button('Delete', async () => {
        closeOverlay();
        await deleteSetlist(this.setlists, s.id);
        this.setlists = this.setlists.filter((x) => x.id !== s.id);
        this.renderSetlists();
        this.renderList();
        this.toast.say(`Deleted “${s.title}”.`);
      }, 'danger')),
    );
  }

  /** Scores as checkboxes; the ticked ones go at the end, in library order, each played whole. */
  private addPieces(id: string) {
    const s = this.get(id);
    if (!s) return;
    const chosen = new Set<string>();
    const d = showDialog(`Add pieces to “${s.title}”`);
    const list = el('div', 'picklist');
    const add = button('Add', () => {
      const now = this.get(id);
      if (!now) return;
      closeOverlay();
      const ids = this.scores.map((x) => x.id).filter((x) => chosen.has(x));
      this.openRows.add(id);
      void this.update({ ...now, entries: [...now.entries, ...ids.map(newEntry)] });
      this.toast.say(`Added ${plural(ids.length, 'piece')} to “${now.title}”.`);
    }, 'primary');
    add.disabled = true;
    const fill = (q: string) => {
      list.replaceChildren();
      const shown = this.scores.filter((x) => `${x.title} ${x.folder}`.toLowerCase().includes(q.trim().toLowerCase()));
      if (!shown.length) list.append(el('p', 'empty', this.scores.length ? `Nothing matches “${q}”.` : 'No scores yet.'));
      for (const sc of shown) {
        const label = el('label', 'check');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = chosen.has(sc.id);
        box.addEventListener('change', () => {
          if (box.checked) chosen.add(sc.id); else chosen.delete(sc.id);
          add.disabled = !chosen.size;
          add.textContent = chosen.size ? `Add ${plural(chosen.size, 'piece')}` : 'Add';
        });
        const has = s.entries.some((e) => e.pieceId === sc.id);
        label.append(box, el('span', '', sc.title), el('span', 'meta', has ? 'already in this setlist' : sc.folder));
        list.append(label);
      }
    };
    const find = el('input', 'search');
    find.type = 'search';
    find.placeholder = 'Find a score';
    find.setAttribute('aria-label', 'Find a score');
    find.addEventListener('input', () => fill(find.value));
    fill('');
    d.append(el('p', 'hint', 'They go at the end, in the order shown, each played whole.'), find, list, buttonRow(button('Cancel', closeOverlay), add));
    find.focus();
  }

  /* ---------- picking scores ---------- */

  private renderPickBar() {
    const n = this.picked.size;
    this.pickBar.hidden = !n;
    if (!n) return;
    const add = button('Add to setlist', () => chooseSetlist(add, `Add ${plural(n, 'piece')} to`, this.setlists, (s, isNew) => this.addPicked(s, isNew)), 'primary');
    add.setAttribute('aria-haspopup', 'menu');
    this.pickBar.replaceChildren(
      button('Clear', () => { this.picked.clear(); this.renderList(); }, 'quiet'),
      el('span', 'grow', `${plural(n, 'score')} picked`),
      add,
    );
  }

  /** The ticked scores go at the end, whole, in library order. */
  private addPicked(s: Setlist, isNew: boolean) {
    const ids = this.scores.map((x) => x.id).filter((id) => this.picked.has(id));
    const added = { ...s, entries: [...s.entries, ...ids.map(newEntry)] };
    this.picked.clear();
    this.openRows.add(s.id);
    void this.change(isNew ? [added, ...this.setlists] : this.setlists.map((x) => (x.id === s.id ? added : x)));
    this.toast.say(`Added ${plural(ids.length, 'piece')} to “${s.title}”.`);
    this.setlistList.querySelector(`#set-${CSS.escape(s.id)}`)?.closest('li')?.scrollIntoView({ block: 'nearest' });
  }

  private renderList() {
    this.renderPickBar();
    const q = this.query.trim().toLowerCase();
    const shown = q ? this.scores.filter((s) => `${s.title} ${s.folder}`.toLowerCase().includes(q)) : this.scores;
    this.list.replaceChildren();
    if (!this.scores.length) {
      this.list.append(el('li', 'empty', this.folder.kind === 'none'
        ? 'No scores yet. Link your scores folder, add PDFs, or share a PDF to Volti from another app.'
        : 'No PDFs found in this folder or its subfolders.'));
      return;
    }
    if (!shown.length) {
      this.list.append(el('li', 'empty', `Nothing matches “${this.query}”.`));
      return;
    }
    for (const s of shown) {
      const picked = this.picked.has(s.id);
      const li = el('li', 'score' + (picked ? ' picked' : ''));
      const pick = el('label', 'pick');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = picked;
      box.setAttribute('aria-label', `Pick ${s.title}`);
      box.addEventListener('change', () => {
        if (box.checked) this.picked.add(s.id); else this.picked.delete(s.id);
        li.classList.toggle('picked', box.checked);
        this.renderPickBar();
      });
      pick.append(box);
      const open = el('button', 'open');
      open.type = 'button';
      open.append(el('span', 'score-title', s.title));
      const n = setlistsWith(this.setlists, s.id).length;
      const meta = [s.folder, n ? `in ${plural(n, 'setlist')}` : ''].filter(Boolean).join(' · ');
      if (meta) open.append(el('span', 'score-folder', meta));
      if (s.source === 'imported') open.append(el('span', 'badge', 'Added'));
      open.addEventListener('click', () => void this.open(s));
      li.append(pick, open);
      if (s.source === 'imported') {
        li.append(button('Remove', async () => {
          await removeImported(s);
          this.say(`Removed “${s.title}”.`);
          await this.refresh();
        }, 'quiet'));
      }
      this.list.append(li);
    }
  }

  /* ---------- opening the reader ---------- */

  private open(s: Score) {
    return this.read({ kind: 'piece', score: s }, [s], `Could not open “${s.title}”. It may have been moved or renamed.`);
  }

  /** Play a setlist from where it was left, or from one of its entries. */
  private play(s: Setlist, startEntry?: string, chooseExcerpt = false) {
    const scores = s.entries.map((e) => this.scoreOf(e.pieceId)).filter((x): x is Score => !!x);
    this.openRows.add(s.id);
    return this.read({ kind: 'setlist', setlistId: s.id, scores: this.scores, startEntry, chooseExcerpt }, scores, `Could not open “${s.title}”.`);
  }

  private async read(source: Source, scores: Score[], failed: string) {
    // Opening is a tap, so it can also grant folder access for this session.
    if (scores.some((s) => s.source === 'folder') && this.folder.kind === 'locked' && !(await this.unlock())) return;
    this.say('');
    closeOverlay();
    this.toast.hide();
    this.root.hidden = true;
    const back = () => {
      this.root.hidden = false;
      this.search.blur();
      void this.loadSetlists().then(() => this.renderList());
    };
    try {
      await openReader(source, this.prefs, back);
    } catch (e) {
      console.error(e);
      this.root.hidden = false;
      this.say(failed);
    }
  }
}
