// The Library screen: setlists, the scores folder, imported scores, and opening the reader. Code
// only this screen uses; what the reader also needs goes in ui/.

import type { Aspects, ExcerptName, Score } from '../scores/model';
import { loadAspects, loadSavedScore, scoreEntries, scoreEntry } from '../scores/store';
import { openReader, type ToRead } from '../reader/reader';
import {
  defaultSetlist, duplicate, moveEntry, newEntry, newSetlist, setlistsWith, spanLabel, type Entry, type Setlist, type Span,
} from '../setlists/model';
import { ends, excerptName, sortedNames } from '../setlists/names';
import { deleteSetlist, loadLastAddedTo, loadSetlists, saveChanged, saveLastAddedTo } from '../setlists/store';
import {
  allowWriting, allOriginals, byFolder, canLinkFolder, fileAdded, fileNameProblem, folderState, importFiles, knownTitles, linkFolder, removeImported, tidyFolder,
  renameOriginal, unlinkFolder, unlockFolder,
  type FolderState, type Original,
} from '../originals/originals';
import { button, el, focusHighlighted, plural } from '../ui/dom';
import type { ExportPart } from '../export/pdf';
import { openExcerptPicker, type ExcerptSource } from '../ui/excerpt-picker';
import { addExcerpt, changeExcerptCuts, deleteExcerpt, renameExcerpt, type ExcerptHost } from '../ui/excerpts';
import { openExportPdf } from '../ui/export-pdf';
import { PasswordNotGiven } from '../originals/open';
import { buttonRow, closeOverlay, showDialog, showMenu, whenOverlayCloses, type MenuItem } from '../ui/overlay';
import { askSetlistName, chooseSetlist } from '../ui/setlists';
import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { Toast } from '../ui/toast';
import { openAddScores } from './add-scores';
import { makePictures } from '../pictures/maker';
import { openScore, type LibraryScore } from './open-score';

/** The Library screen: setlists, the scores folder, imported scores, and the list to open them from. */
export class Library {
  private folder: FolderState = { kind: 'none' };
  private originals: Original[] = [];
  /** Every original's title as last seen, for scores whose original is missing. */
  private titles: Record<string, string> = {};
  /** The subfolder lists closed by hand, by path; the others are open. */
  private closedFolders: Set<string> | undefined;
  /** The setlist a score was last added to: see `defaultSetlist`. */
  private lastAddedTo: string | undefined;
  /** The refresh running, and whether another was asked for meanwhile. */
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;
  /** New PDFs are still being read. */
  private reading = false;
  private setlists: Setlist[] = [];
  /** Scores as last saved, and their originals' page shapes: for their named excerpts, and the excerpt each entry plays. */
  private saved = new Map<string, Score>();
  private shapes = new Map<string, Aspects>();
  private query = '';
  /** What the library shows that isn't data, kept while the app runs. */
  private openRows = new Set<string>();
  private showArchived = false;
  /** For giving each score row's excerpt list an id. */
  private rowSeq = 0;

  private root = el('main', 'library');
  private bannerTools = el('div', 'banner-tools');
  private folderTools = el('div', 'folder-tools');
  private setlistHead = el('div', 'head-tools');
  private setlistList = el('ul', 'list setlists');
  private list = el('ul', 'list scores');
  private status = el('p', 'status');
  private search = el('input', 'search');
  private fileInput = el('input');
  private toast = new Toast();

  constructor() {
    const header = el('header', 'masthead');
    const brand = el('h1', 'brand', 'Volti');
    const tagline = el('p', 'tagline', 'volti subito · turn the page');
    const name = el('div', 'brand-line');
    name.append(brand, tagline);
    // The scores folder's tools beside the name, so Allow access is in sight as the library opens.
    this.bannerTools.append(this.folderTools);
    header.append(name, this.bannerTools);

    this.search.type = 'search';
    this.search.id = 'search';
    this.search.placeholder = 'Find a score or excerpt';
    this.search.setAttribute('aria-label', 'Find a score or excerpt');
    this.search.addEventListener('input', () => { this.query = this.search.value; this.renderList(); });

    this.fileInput.type = 'file';
    this.fileInput.id = 'import-files';
    this.fileInput.accept = 'application/pdf,.pdf';
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', async () => {
      let result;
      try {
        result = await importFiles(this.fileInput.files ?? []);
      } catch (e) {
        console.error(e);
        this.say(`Could not add the PDFs (${(e as Error).name}).`);
        return;
      } finally {
        this.fileInput.value = '';
      }
      const { added, already } = result;
      const have = already.length === 1 ? `“${already[0]}” is already in the library.` : already.length ? `${already.length} were already in the library.` : '';
      this.say([added ? `Added ${plural(added, 'score')}.` : '', have].filter(Boolean).join(' ') || 'No PDFs were selected.');
      await this.refresh();
    });

    const tools = el('div', 'tools');
    tools.append(this.search, button('Add PDFs', () => this.fileInput.click()), this.fileInput);

    const setlistsHead = el('div', 'section-head');
    setlistsHead.append(el('h2', '', 'Setlists'), this.setlistHead);
    const scoresHead = el('div', 'section-head');
    scoresHead.append(el('h2', '', 'Scores'));

    this.status.setAttribute('role', 'status');
    this.toast.el.classList.add('fixed');
    this.root.append(header, this.status, setlistsHead, this.setlistList, scoresHead, tools, this.list);
    document.body.append(this.root, this.toast.el);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) closeOverlay(); });
  }

  /** A new version of the app is ready: offer it, beside the scores folder's tools. `take` switches to it. */
  offerUpdate(take: () => void) {
    const b = button('Update', take, 'primary');
    b.title = 'A new version of Volti is ready';
    b.setAttribute('aria-label', 'Update Volti to the new version');
    this.bannerTools.prepend(b);
  }

  say(text: string) {
    this.status.textContent = text;
  }

  /** Read the folder and the imported copies again, and show them. A refresh asked for while one runs follows it. */
  refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = this.readOriginals().finally(() => {
      this.refreshing = null;
      if (this.refreshAgain) { this.refreshAgain = false; void this.refresh(); }
    });
    return this.refreshing;
  }

  private async readOriginals() {
    this.folder = await folderState();
    this.renderFolder();
    const before = this.status.textContent;
    let shown = false;
    try {
      // New PDFs are read whole to know them: show the others meanwhile, and each as it is read.
      const { originals, removed } = await allOriginals(this.folder, (originals, left) => {
        this.originals = originals;
        this.reading = left > 0;
        this.say(left ? `Reading new scores: ${left} left…` : before ?? '');
        if (!shown) { shown = true; void this.loadSetlists().then(() => this.renderList()); } else this.renderList();
      });
      this.originals = originals;
      if (removed) this.toast.say(`Removed ${plural(removed, 'added copy', 'added copies')} of scores in the scores folder. Their cuts and markings are kept.`);
    } catch (e) {
      // The folder may have been moved or deleted since it was linked.
      console.error(e);
      this.say('Could not read the scores folder. Link it again if it has moved.');
      this.originals = [];
    }
    await this.loadSetlists();
    this.renderList();
  }

  private async loadSetlists() {
    [this.setlists, this.titles, this.lastAddedTo] = await Promise.all([loadSetlists(), knownTitles(), loadLastAddedTo()]);
    // Read once: after that, the lists opened and closed here are the ones to go by.
    this.closedFolders ??= new Set((await kv.get<string[]>(keys.closedFolders)) ?? []);
    // Every score's, for its named excerpts, and those of scores in setlists that are missing.
    const ids = [...new Set([...this.originals.map((o) => o.id), ...this.setlists.flatMap((s) => s.entries.map((e) => e.scoreId))])];
    const [saved, shapes] = await Promise.all([Promise.all(ids.map(loadSavedScore)), Promise.all(ids.map(loadAspects))]);
    this.saved = new Map(saved.filter((x): x is Score => !!x).map((x) => [x.id, x]));
    this.shapes = new Map(ids.flatMap((id, i) => (shapes[i] ? [[id, shapes[i]] as const] : [])));
    this.renderSetlists();
  }

  /**
   * The banner's tools for the scores folder, which is set and forget: the one button that needs a
   * tap (Link scores folder while none is linked, Allow access while locked), and ⋯ for the rest.
   */
  private renderFolder() {
    const p = this.folderTools;
    p.replaceChildren();
    const f = this.folder;
    if (f.kind === 'none') {
      if (canLinkFolder()) p.append(button('Link scores folder', () => void this.link(), 'primary'));
      return;
    }
    if (f.kind === 'locked') p.append(button('Allow access', () => void this.unlock(), 'primary'));
    const more = button('⋯', () => showMenu(more, `Scores folder: ${f.name}`, [
      { label: 'Change folder…', run: () => void this.link() },
      { label: 'Unlink', run: async () => { await unlinkFolder(); this.say('Folder unlinked. Your markings are kept.'); await this.refresh(); } },
    ]), 'quiet more');
    more.setAttribute('aria-label', 'Scores folder');
    more.setAttribute('aria-haspopup', 'menu');
    p.append(more);
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

  private originalOf(id: string) { return this.originals.find((s) => s.id === id); }
  private titleOf(scoreId: string) { return this.originalOf(scoreId)?.title ?? this.titles[scoreId] ?? this.saved.get(scoreId)?.title ?? 'Missing score'; }

  /** Change the setlists, save the ones that changed (with `also`, other records that go with them), and show them. */
  private async change(next: Setlist[], also: [string, unknown][] = []) {
    const before = this.setlists;
    this.setlists = next;
    this.renderSetlists();
    this.renderList();
    await saveChanged(next, before, also);
  }

  private update(s: Setlist) {
    return this.change(this.setlists.map((x) => (x.id === s.id ? s : x)));
  }

  private renderSetlists() {
    // Shown afresh whenever they change, or the scores do: keep their pages' pictures up to date.
    makePictures(this.originals, this.setlists);
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
      this.addScores(s.id);
    })));

    const list = this.setlistList;
    list.replaceChildren();
    if (!active.length) list.append(el('li', 'empty', 'No setlists yet. Use New setlist to make one.'));
    for (const s of active) list.append(this.setlistRow(s));
    // Archived setlists follow the others, in grey, only when asked for.
    if (this.showArchived) for (const s of archived) list.append(this.setlistRow(s));
  }

  /** A setlist: tap to play it; the arrow slides its scores open; ⋯ for the rest. */
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
    expand.setAttribute('aria-label', `Scores in ${s.title}`);

    const play = button('', () => {
      if (s.entries.length) void this.play(s);
      else this.toast.say('This setlist has no scores yet.');
    }, 'open');
    play.append(el('span', 'item-title setlist-title', s.title), el('span', 'meta', (s.archived ? 'Archived · ' : '') + plural(s.entries.length, 'score')));

    const more = button('⋯', () => showMenu(more, s.title, [
      { label: 'Add scores…', run: () => this.addScores(s.id) },
      { label: 'Rename…', run: () => askSetlistName('Rename setlist', s.title, 'Rename', (title) => void this.update({ ...this.get(s.id)!, title })) },
      { label: 'Duplicate', run: () => this.duplicate(s) },
      s.entries.length > 0 && { label: 'Export PDF…', run: () => this.exportPdf(s.title, s.entries) },
      s.archived
        ? { label: 'Unarchive', run: () => { void this.update({ ...this.get(s.id)!, archived: false }); this.toast.say(`Unarchived “${s.title}”.`); } }
        : { label: 'Archive', run: () => { void this.update({ ...this.get(s.id)!, archived: true }); this.toast.say(`Archived “${s.title}”.`); } },
      s.archived && { label: 'Delete…', run: () => this.confirmDelete(s) },
    ]), 'quiet more');
    more.setAttribute('aria-label', `More for ${s.title}`);
    more.setAttribute('aria-haspopup', 'menu');

    const entries = el('ol', 'entries');
    entries.setAttribute('aria-label', `Scores in ${s.title}`);
    s.entries.forEach((e, i) => entries.append(this.entryRow(s, e, i, entries)));
    if (!s.entries.length) {
      const li = el('li', 'empty-set');
      li.append(button('Add scores', () => this.addScores(s.id)));
      entries.append(li);
    }
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
    const title = this.titleOf(e.scoreId), score = this.saved.get(e.scoreId), missing = !this.originalOf(e.scoreId);
    const excerpt = score ? excerptName(score, e, this.shapes.get(e.scoreId)) : null;
    const li = el('li', 'entry');
    const handle = button('⋮⋮', () => {}, 'handle');
    handle.setAttribute('aria-label', `Move ${title}`);
    this.dragToReorder(handle, li, list, s, i);
    const open = button('', () => void this.play(s, e.id), 'open');
    open.append(el('span', 'item-title', title));
    if (score?.key) open.append(el('span', 'meta', score.key));
    if (excerpt) open.append(el('span', 'pill', excerpt));
    if (missing) open.append(el('span', 'pill missing', 'Missing'));
    const more = button('⋯', () => showMenu(more, title, [
      i > 0 && { label: 'Move up', run: () => void this.update(moveEntry(s, i, i - 1)) },
      i < s.entries.length - 1 && { label: 'Move down', run: () => void this.update(moveEntry(s, i, i + 1)) },
      !missing && { label: 'Change excerpt…', run: () => void this.chooseExcerpt(s, e) },
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
    this.toast.say(`Removed “${this.titleOf(e.scoreId)}” from “${s.title}”.`, ['Undo', () => {
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
      el('p', '', 'The scores, with their cuts and markings, stay in the library.'),
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

  /** Open "Add scores" for setlist `id`; what's chosen goes at the end. */
  private addScores(id: string) {
    const s = this.get(id);
    if (!s) return;
    openAddScores({
      setlist: s,
      originals: this.originals,
      saved: this.saved,
      open: (o) => this.openForDialog(o),
      add: (entries, scores) => {
        const now = this.get(id);
        if (!now) return;
        this.openRows.add(id);
        this.addedTo(id);
        for (const x of scores) this.remember(x);
        // The scores excerpts were chosen from too, so the spans and the cuts they name agree.
        void this.change(this.setlists.map((x) => (x.id === id ? { ...now, entries: [...now.entries, ...entries] } : x)), scores.flatMap((x) => scoreEntries(x.state)));
        this.toast.say(`Added ${plural(entries.length, 'score')} to “${now.title}”.`);
      },
    });
  }

  /** Note the setlist scores were just added to, which is the default from now on. */
  private addedTo(id: string) {
    this.lastAddedTo = id;
    void saveLastAddedTo(id);
  }

  /**
   * "Add to <default setlist>" and "Add to setlist…" for a score, or the excerpt `span` of it, called
   * `what`; the second opens a menu of setlists below `anchor`, with New setlist….
   */
  private addToItems(anchor: Element, scoreId: string, what: string, span: Span = {}): MenuItem[] {
    const add = (s: Setlist, isNew: boolean) => {
      const added = { ...s, entries: [...s.entries, { ...newEntry(scoreId), ...ends(span) }] };
      this.openRows.add(s.id);
      this.addedTo(s.id);
      void this.change(isNew ? [added, ...this.setlists] : this.setlists.map((x) => (x.id === s.id ? added : x)));
      this.toast.say(`Added “${what}” to “${s.title}”.`);
    };
    const d = defaultSetlist(this.setlists, this.lastAddedTo);
    return [
      ...(d ? [{ label: `Add to “${d.title}”`, run: () => add(this.get(d.id) ?? d, false) }] : []),
      { label: 'Add to setlist…', run: () => chooseSetlist(anchor, `Add “${what}” to`, this.setlists, add, scoreId) },
    ];
  }

  private renderList() {
    const q = this.query.trim().toLowerCase();
    const matches = (s: Original) => !q || `${s.title} ${s.folder}`.toLowerCase().includes(q);
    // Named excerpts whose names match, found under their scores.
    const hits = (s: Original) => {
      const score = this.saved.get(s.id);
      return q && score ? sortedNames(score).filter((x) => x.name.toLowerCase().includes(q)).map((x) => this.excerptHit(s, score, x)) : [];
    };
    this.list.replaceChildren();
    if (!this.originals.length) {
      this.list.append(el('li', 'empty', this.reading ? 'Reading the scores…' : this.folder.kind === 'none'
        ? 'No scores yet. Link your scores folder, add PDFs, or share a PDF to Volti from another app.'
        : 'No PDFs found in this folder or its subfolders.'));
      return;
    }
    // The top of the folder, then a list for each subfolder; while searching, only lists with matches.
    let found = false;
    for (const { folder, originals } of byFolder(this.originals)) {
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
      void kv.set(keys.closedFolders, [...closed]);
    }, 'folder-head');
    head.append(el('span', 'chev'), el('span', '', folder.split('/').join(' / ')));
    head.setAttribute('aria-expanded', String(open));
    head.setAttribute('aria-controls', list.id);
    li.append(head, list);
    return li;
  }

  /** File an added PDF under a subfolder in the library: one of the folder's, or a new one; None takes it back to the top. */
  private moveAdded(o: Original) {
    const d = showDialog(`Move “${o.title}” to a folder`);
    const input = el('input', 'name');
    input.type = 'text';
    input.value = o.folder;
    input.placeholder = 'For example, Masses/Latin';
    input.setAttribute('aria-label', 'Folder');
    // The subfolders there are, offered as you type.
    const choices = el('datalist');
    choices.id = 'folder-choices';
    for (const f of [...new Set(this.originals.map((x) => x.folder).filter(Boolean))].sort()) choices.append(Object.assign(el('option'), { value: f }));
    input.setAttribute('list', choices.id);
    const go = async (folder: string) => {
      closeOverlay();
      await fileAdded(o, folder);
      this.toast.say(tidyFolder(folder) ? `Moved “${o.title}” to ${tidyFolder(folder).split('/').join(' / ')}.` : `Moved “${o.title}” to the top of the list.`);
      await this.refresh();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void go(input.value); });
    d.append(
      input, choices,
      el('p', 'hint', 'Volti lists it under that folder, beside the scores folder’s own PDFs there. The PDF itself stays where it is.'),
      buttonRow(button('Cancel', closeOverlay), button('None', () => void go(''), 'quiet'), button('Move', () => void go(input.value), 'primary')),
    );
    focusHighlighted(input);
  }


  /** A named excerpt found by searching: its name, with its score's, as names are only unique within a score. */
  private excerptHit(o: Original, score: Score, x: ExcerptName): HTMLLIElement {
    const li = el('li', 'score hit');
    const open = button('', () => void this.readExcerpt(o, x), 'open');
    const pages = spanLabel(score.cuts, x, this.shapes.get(score.id));
    open.append(el('span', 'score-title', `${x.name} · ${o.title}`));
    if (pages) open.append(el('span', 'score-folder', pages));
    open.setAttribute('aria-label', `${x.name}, an excerpt of ${o.title}`);
    li.append(el('span', 'expand'), open);
    return li;
  }

  /** A score: tap to open it; the arrow slides its named excerpts open; ⋯ for the rest. */
  private scoreRow(s: Original): HTMLLIElement {
    const score = this.saved.get(s.id), names = score ? sortedNames(score) : [];
    const open = this.openRows.has(s.id) && names.length > 0;
    const li = el('li', 'score set' + (open ? ' open' : ''));
    const body = el('div', 'set-body');
    body.id = 'excerpts-' + ++this.rowSeq;
    body.inert = !open;
    let expand: HTMLElement = el('span', 'expand');
    if (names.length) {
      const b = button('', () => {
        const now = !this.openRows.has(s.id);
        if (now) this.openRows.add(s.id); else this.openRows.delete(s.id);
        li.classList.toggle('open', now);
        b.setAttribute('aria-expanded', String(now));
        body.inert = !now;
      }, 'expand');
      b.append(el('span', 'chev'));
      b.setAttribute('aria-expanded', String(open));
      b.setAttribute('aria-controls', body.id);
      b.setAttribute('aria-label', `Named excerpts of ${s.title}`);
      expand = b;
    }

    const title = button('', () => void this.open(s), 'open');
    title.append(el('span', 'score-title', s.title));
    const n = setlistsWith(this.setlists, s.id).length;
    const meta = [names.length ? plural(names.length, 'excerpt') : '', n ? `in ${plural(n, 'setlist')}` : ''].filter(Boolean).join(' · ');
    if (meta) title.append(el('span', 'score-folder', meta));
    if (s.location === 'imported') title.append(el('span', 'badge', 'Added'));

    const more = button('⋯', () => showMenu(more, s.title, [
      ...this.addToItems(more, s.id, s.title),
      { label: 'Add excerpt…', run: () => void this.withPages(s, (sc) => addExcerpt(sc, s.title, this.excerptHost(s.id))) },
      { label: 'Rename…', run: () => this.renameFile(s) },
      { label: 'Export PDF…', run: () => this.exportPdf(s.title, [{ scoreId: s.id }]) },
      s.location === 'imported' && { label: 'Move to folder…', run: () => this.moveAdded(s) },
      s.location === 'imported' && { label: 'Remove from Volti', run: async () => {
        await removeImported(s);
        this.say(`Removed “${s.title}”.`);
        await this.refresh();
      } },
    ]), 'quiet more');
    more.setAttribute('aria-label', `More for ${s.title}`);
    more.setAttribute('aria-haspopup', 'menu');

    const head = el('div', 'set-head');
    head.append(expand, title, more);
    li.append(head);
    if (score && names.length) {
      const list = el('ul', 'entries excerpts');
      list.setAttribute('aria-label', `Named excerpts of ${s.title}`);
      for (const x of names) list.append(this.excerptRow(s, score, x));
      const inner = el('div', 'set-inner');
      inner.append(list);
      body.append(inner);
      li.append(body);
    }
    return li;
  }

  /** A named excerpt of a score: tap to read it; ⋯ to rename, change or delete it. */
  private excerptRow(o: Original, score: Score, x: ExcerptName): HTMLLIElement {
    const li = el('li', 'excerpt');
    const pages = spanLabel(score.cuts, x, this.shapes.get(score.id));
    const open = button('', () => void this.readExcerpt(o, x), 'open');
    open.append(el('span', 'item-title', x.name));
    if (pages) open.append(el('span', 'meta', pages));
    const more = button('⋯', () => showMenu(more, x.name, [
      ...this.addToItems(more, o.id, x.name, x),
      { label: 'Rename…', run: () => renameExcerpt(score, x, this.excerptHost(o.id)) },
      { label: 'Change cuts…', run: () => void this.withPages(o, (sc) => changeExcerptCuts(sc, x, this.excerptHost(o.id))) },
      { label: 'Export PDF…', run: () => this.exportPdf(`${o.title} - ${x.name}`, [{ scoreId: o.id, first: x.first, last: x.last }]) },
      { label: 'Delete…', run: () => deleteExcerpt(score, x, this.excerptHost(o.id)) },
    ]), 'quiet more');
    more.setAttribute('aria-label', `More for ${x.name}`);
    more.setAttribute('aria-haspopup', 'menu');
    li.append(open, more);
    return li;
  }

  /** Rename a score's PDF. Its cuts, markings and setlists stay with it, as its contents don't change. */
  private renameFile(o: Original) {
    const d = showDialog(`Rename “${o.title}”`);
    const input = el('input', 'name');
    input.type = 'text';
    input.value = o.title;
    input.setAttribute('aria-label', 'File name');
    const hint = el('p', 'hint', o.location === 'folder'
      ? `Renames “${o.path.slice(o.path.lastIndexOf('/') + 1)}” in the scores folder.`
      : 'Renames the copy kept in Volti.');
    const error = el('p', 'hint error');
    error.setAttribute('aria-live', 'polite');
    const ok = async () => {
      let why = fileNameProblem(input.value);
      // Asked from this tap, which a request for access needs.
      if (!why && o.location === 'folder' && !(await allowWriting())) why = 'Volti needs permission to change files in the scores folder to rename one.';
      if (!why) {
        try {
          why = await renameOriginal(o, input.value);
        } catch (e) {
          console.error(e);
          why = `Could not rename it (${(e as Error).name}). It may have been moved or renamed already.`;
        }
      }
      error.textContent = why ?? '';
      if (why) return;
      closeOverlay();
      this.toast.say(`Renamed to “${input.value.trim()}”.`);
      await this.refresh();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void ok(); });
    d.append(input, hint, error, buttonRow(button('Cancel', closeOverlay), button('Rename', () => void ok(), 'primary')));
    focusHighlighted(input);
  }

  /** Export scores (whole or excerpts of them) as one PDF, named `title` to start with. */
  private exportPdf(title: string, what: (Span & { scoreId: string })[]) {
    const parts: ExportPart[] = [], missing: string[] = [];
    for (const { scoreId, first, last } of what) {
      const original = this.originalOf(scoreId);
      if (original) parts.push({ original, span: { first, last } });
      else missing.push(this.titleOf(scoreId));
    }
    if (!parts.length) { this.toast.say('Its scores are all missing.'); return; }
    openExportPdf({
      title,
      parts,
      missing,
      toFolder: this.folder.kind !== 'none',
      saved: (name) => {
        this.toast.say(`Saved “${name}.pdf” in Exports, in the scores folder.`);
        void this.refresh();
      },
    });
  }

  /* ---------- named excerpts ---------- */

  /** Save a score changed here (its names), with the setlists if they changed too. */
  private saveScore(score: Score, setlists = this.setlists) {
    this.saved.set(score.id, score);
    this.openRows.add(score.id);
    return this.change(setlists, [scoreEntry(score)]);
  }

  /** Changing a score's named excerpts here, saving them as they change. */
  private excerptHost(scoreId: string): ExcerptHost {
    return {
      setlists: this.setlists,
      aspects: this.shapes.get(scoreId),
      save: (score, setlists) => void this.saveScore(score, setlists),
      say: (t) => this.toast.say(t),
    };
  }

  /** Open the score for the excerpt picker, then `pick` from it. */
  private async withPages(o: Original, pick: (sc: LibraryScore) => void) {
    const sc = await this.openForDialog(o);
    if (!sc) return;
    this.remember(sc);
    pick(sc);
    whenOverlayCloses(sc.close);
  }

  /* ---------- opening the reader ---------- */

  /** Read a score from where it was left. */
  private open(s: Original) {
    return this.read({ kind: 'score', original: s }, [s], `Could not open “${s.title}”. It may have been moved or renamed.`);
  }

  /** Read a named excerpt, as a setlist entry playing it is read: only its cuts, always from its start. */
  private readExcerpt(o: Original, excerpt: ExcerptName) {
    return this.read({ kind: 'excerpt', original: o, excerpt }, [o], `Could not open “${o.title}”. It may have been moved or renamed.`);
  }

  /** Play a setlist from where it was left, or from one of its entries. */
  private play(s: Setlist, startEntry?: string) {
    const originals = s.entries.map((e) => this.originalOf(e.scoreId)).filter((x): x is Original => !!x);
    this.openRows.add(s.id);
    return this.read({ kind: 'setlist', setlistId: s.id, originals: this.originals, startEntry }, originals, `Could not open “${s.title}”.`);
  }

  /** Keep a score opened for a dialog, for naming the excerpts entries play. */
  private remember(sc: ExcerptSource) {
    this.saved.set(sc.state.score.id, sc.state.score);
    this.shapes.set(sc.state.score.id, sc.aspects);
  }

  /** Open a score's original for a dialog over the library; null, having said why, when it can't be. */
  private async openForDialog(o: Original): Promise<LibraryScore | null> {
    // Opening is a tap, so it can also grant folder access for this session.
    if (o.location === 'folder' && this.folder.kind === 'locked' && !(await this.unlock())) return null;
    this.toast.say(`Opening “${o.title}”…`);
    try {
      const sc = await openScore(o);
      this.toast.hide();
      return sc;
    } catch (e) {
      console.error(e);
      this.toast.say(e instanceof PasswordNotGiven ? `“${o.title}” needs its password to open.` : `Could not open “${o.title}”. It may have been moved or renamed.`);
      return null;
    }
  }

  /** Choose the cuts an entry plays, over the library. */
  private async chooseExcerpt(s: Setlist, e: Entry) {
    const o = this.originalOf(e.scoreId);
    if (!o) return;
    const sc = await this.openForDialog(o);
    if (!sc) return;
    openExcerptPicker({
      ...sc,
      question: `Which part of “${o.title}” does entry ${s.entries.indexOf(e) + 1} play?`,
      verb: 'This entry plays',
      named: true,
      span: e,
      done: (span) => {
        const now = this.get(s.id);
        if (!now) return;
        this.remember(sc);
        const entries = now.entries.map((x) => (x.id === e.id ? { id: x.id, scoreId: x.scoreId, ...span } : x));
        // The score too: one never opened isn't saved yet, and the span names its cuts.
        void this.change(this.setlists.map((x) => (x.id === s.id ? { ...now, entries } : x)), scoreEntries(sc.state));
      },
    });
    whenOverlayCloses(sc.close);
  }

  private async read(what: ToRead, originals: Original[], failed: string) {
    // Opening is a tap, so it can also grant folder access for this session.
    if (originals.some((s) => s.location === 'folder') && this.folder.kind === 'locked' && !(await this.unlock())) return;
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
      await openReader(what, back);
    } catch (e) {
      console.error(e);
      this.root.hidden = false;
      this.say(e instanceof PasswordNotGiven ? `${e.message} to open.` : failed);
    }
  }
}
