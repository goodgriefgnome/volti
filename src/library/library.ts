// The Library screen: what it has read (the scores folder, the scores and their originals, the
// setlists), saving changes to them, and opening the reader. The parts it shows are their own
// files: the folder banner, the setlists and the scores, each given this as its LibraryHost.

import { chooseSetlist, givePassword, openExportPdf, openScore, type ExcerptHost, type ExcerptSource, type FileChange, type LibraryScore } from '../dialogs';
import type { Span } from '../excerpts';
import type { ExportPart } from '../export';
import { allOriginals, arrivals, byFolder, dropInbox, dropLeftInApp, leftInApp, byTitle, folderState, knownTitles, linkFolder, lockedOriginals, NoAccess, PasswordNotGiven, peekInbox, putIncoming, titleOf, unlinkFolder, unlockFolder, type FolderState, type LeftInApp, type Original } from '../originals';
import { makePictures } from '../pictures';
import { openReader, type ToRead } from '../reader';
import { loadAspects, loadSavedScore, scoreEntry, type Aspects, type ExcerptName, type Score } from '../scores';
import { addEntries, defaultSetlist, deleteSetlist, loadLastAddedTo, loadSetlists, saveChanged, saveLastAddedTo, withSetlist, type Setlist } from '../setlists';
import { closeOverlay, el, plural, Toast, whenOverlayCloses, type MenuItem } from '../ui';
import { FolderBanner } from './folder-banner';
import type { LibraryHost } from './host';
import { openIncoming, type Arriving } from './incoming';
import { ScoresSection } from './scores-section';
import { SetlistsSection } from './setlists-section';

/** How long Volti has to be out of view before the scores folder is read again on coming back. */
const AWAY_MS = 30_000;
/** Said when access to the scores folder isn't allowed, so a score in it can't be opened. */
const NO_ACCESS = 'Volti needs access to the folder to open its scores.';

/** The Library screen: setlists, the scores in its root (the scores folder, or the app's own), and the list to open them from. */
export class Library implements LibraryHost {
  folder: FolderState = { kind: 'none' };
  originals: Original[] = [];
  reading = false;
  /** How many scores are left in Volti's own folder while a folder is linked. */
  leftIn = 0;
  setlists: Setlist[] = [];
  saved = new Map<string, Score>();
  shapes = new Map<string, Aspects>();
  openRows = new Set<string>();
  locked = new Set<string>();
  toast = new Toast();
  /** Every original's title as last seen, for scores whose original is missing. */
  private titles: Record<string, string> = {};
  /** The setlist a score was last added to: see `defaultSetlist`. */
  private lastAddedTo: string | undefined;
  /** The refresh running, and whether another was asked for meanwhile. */
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;

  private root = el('main', 'library');
  private status = el('p', 'status');
  private banner = new FolderBanner(this);
  private setlistsSection = new SetlistsSection(this);
  private scoresSection = new ScoresSection(this);

  constructor() {
    const header = el('header', 'masthead');
    const name = el('div', 'brand-line');
    name.append(el('h1', 'brand', 'Volti'), el('p', 'tagline', 'volti subito · turn the page'));
    header.append(name, this.banner.el);

    const setlistsHead = el('div', 'section-head');
    setlistsHead.append(el('h2', '', 'Setlists'), this.setlistsSection.tools);
    const scoresHead = el('div', 'section-head');
    scoresHead.append(el('h2', '', 'Scores'));

    this.status.setAttribute('role', 'status');
    this.toast.el.classList.add('fixed');
    this.root.append(header, this.status, setlistsHead, this.setlistsSection.list, scoresHead, this.scoresSection.tools, this.scoresSection.list);
    document.body.append(this.root, this.toast.el);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) closeOverlay(); });
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** A new version of the app is ready: offer it, beside the scores folder's tools. `take` switches to it. */
  offerUpdate(take: () => void) {
    this.banner.offerUpdate(take);
  }

  say(text: string) {
    this.status.textContent = text;
  }

  /* ---------- reading what there is ---------- */

  /** When Volti went out of view, to read the scores folder again on coming back after a while. */
  private hiddenAt = 0;

  /**
   * Coming back to Volti, after PDFs may have been added in the Files app: read the scores folder
   * again, quietly, with the library showing; not after a quick switch.
   */
  private onVisible = () => {
    if (document.visibilityState === 'hidden') { this.hiddenAt = Date.now(); return; }
    if (this.root.hidden || this.folder.kind !== 'ready' || Date.now() - this.hiddenAt < AWAY_MS) return;
    void this.refresh();
  };

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

  async checkFolder() {
    const before = new Set(this.originals.map((o) => o.id));
    if (this.folder.kind === 'locked') { if (!(await this.unlock())) return; } else await this.refresh();
    const found = this.originals.filter((o) => !before.has(o.id)).length;
    this.toast.say(found ? `Found ${plural(found, 'new score')}.` : 'No new scores.');
  }

  filesChanged(changes: readonly FileChange[]) {
    if (!changes.length) return;
    const now = new Map(changes.flatMap((c) => ('now' in c ? [[c.now.id, c.now] as const] : [])));
    const gone = new Set(changes.flatMap((c) => ('gone' in c ? [c.gone] : [])));
    this.originals = this.originals.filter((o) => !gone.has(o.id)).map((o) => now.get(o.id) ?? o).sort(byTitle);
    this.render();
    // Then read them again, in case anything else changed or went wrong.
    void this.refresh();
  }

  private async readOriginals() {
    this.folder = await folderState();
    this.leftIn = this.folder.kind === 'none' ? 0 : (await leftInApp().catch(() => [])).length;
    this.banner.render();
    const before = this.status.textContent;
    let shown = false;
    try {
      // New PDFs are read whole to know them: show the others meanwhile, and each as it is read.
      const originals = await allOriginals(this.folder, (originals, left) => {
        this.originals = originals;
        this.reading = left > 0;
        this.say(left ? `Reading new scores: ${left} left…` : before ?? '');
        if (!shown) { shown = true; void this.loadSetlists().then(() => this.scoresSection.render()); } else this.scoresSection.render();
      });
      this.originals = originals;
    } catch (e) {
      // The folder may have been moved or deleted since it was linked.
      console.error(e);
      this.say('Could not read the scores folder. Link it again if it has moved.');
      this.originals = [];
    }
    await this.loadSetlists();
    this.scoresSection.render();
  }

  private async loadSetlists() {
    [this.setlists, this.titles, this.lastAddedTo] = await Promise.all([loadSetlists(), knownTitles(), loadLastAddedTo()]);
    await this.scoresSection.load();
    // Every score's, for its named excerpts, and those of scores in setlists that are missing.
    const ids = [...new Set([...this.originals.map((o) => o.id), ...this.setlists.flatMap((s) => s.entries.map((e) => e.scoreId))])];
    const [saved, shapes] = await Promise.all([Promise.all(ids.map(loadSavedScore)), Promise.all(ids.map(loadAspects))]);
    this.saved = new Map(saved.filter((x): x is Score => !!x).map((x) => [x.id, x]));
    this.shapes = new Map(ids.flatMap((id, i) => (shapes[i] ? [[id, shapes[i]] as const] : [])));
    this.renderSetlists();
    void this.findLocked();
  }

  /** Work out which scores are locked, in the background (new PDFs are looked at once), and show them. */
  private async findLocked() {
    const readable = () => this.folder.kind !== 'locked';
    const locked = await lockedOriginals(this.originals, readable).catch((e) => { console.warn(e); return this.locked; });
    if ([...locked].join() === [...this.locked].join()) return;
    this.locked = locked;
    this.scoresSection.render();
  }

  /* ---------- the scores folder ---------- */

  async link() {
    try {
      if (!(await linkFolder())) return;
    } catch (e) {
      this.say('That folder cannot be linked. Android blocks the Download folder itself and the top of internal storage; pick a folder inside them, such as Download/Scores.');
      console.error(e);
      return;
    }
    await this.refresh();
    await this.moveLeftIn();
  }

  /**
   * Move the scores in Volti's own folder into the linked folder, at their paths, overwriting
   * nothing: one the folder has already is dropped, and those whose paths the folder has for
   * different files open in the screen for incoming files. One left out there stays in Volti's
   * folder, out of the library, until this is done again from the library's ⋯ menu.
   */
  async moveLeftIn() {
    const left = await leftInApp();
    if (!left.length) return;
    const what = arrivals(left, this.originals.map((o) => ({ id: o.id, path: o.path })));
    const taken: LeftInApp[] = [];
    let moved = 0;
    if (left.length > 1) this.say(`Moving ${plural(left.length, 'score')} into the scores folder…`);
    try {
      for (const [i, f] of left.entries()) {
        const a = what[i];
        if (a.kind === 'taken') { taken.push(f); continue; }
        if (a.kind === 'new') {
          // Taken after all, by a file the library doesn't list.
          if (await putIncoming(f, f.path)) { taken.push(f); continue; }
          moved++;
        }
        await dropLeftInApp(f);
      }
    } catch (e) {
      if (!(e instanceof NoAccess)) console.error(e);
      this.say(e instanceof NoAccess ? 'Volti needs permission to write in the scores folder to move its scores there.' : 'Could not move all the scores into the scores folder.');
      await this.refresh();
      return;
    }
    this.say(moved ? `Moved ${plural(moved, 'score')} into the scores folder.` : '');
    await this.refresh();
    if (!taken.length) return;
    const arriving = new Map<Arriving, LeftInApp>(taken.map((f) => [{ file: f.file, path: f.path }, f]));
    void openIncoming(this, [...arriving.keys()], (added) => {
      void Promise.all(added.map((a) => dropLeftInApp(arriving.get(a)!))).then(() => this.refresh());
    });
  }

  async unlock(): Promise<boolean> {
    const ok = await unlockFolder();
    if (ok) { await this.refresh(); await this.addShared(); } else this.say(NO_ACCESS);
    return ok;
  }

  /**
   * Open the files shared to Volti, waiting in the inbox, in the screen for incoming files, which
   * drops them from the inbox as it closes. They wait while access to the scores folder isn't
   * allowed, and that is said.
   */
  async addShared() {
    const files = await peekInbox();
    if (!files.length) return;
    if ((await folderState()).kind === 'locked') { this.say('Files shared to Volti open here once access to the scores folder is allowed.'); return; }
    void openIncoming(this, files.map((file) => ({ file })), () => void dropInbox(files.length));
  }

  async unlink() {
    await unlinkFolder();
    this.say('Folder unlinked. Your markings are kept.');
    await this.refresh();
  }

  /* ---------- showing and changing ---------- */

  originalOf(id: string) { return this.originals.find((s) => s.id === id); }
  titleOf(scoreId: string) { const o = this.originalOf(scoreId); return (o && titleOf(o.path)) ?? this.titles[scoreId] ?? this.saved.get(scoreId)?.title ?? 'Missing score'; }
  setlist(id: string) { return this.setlists.find((s) => s.id === id); }

  private renderSetlists() {
    // Shown afresh whenever they change, or the scores do: keep their pages' pictures up to date.
    makePictures(this.originals, this.setlists);
    this.setlistsSection.render();
  }

  render() {
    this.renderSetlists();
    this.scoresSection.render();
  }

  async change(next: Setlist[], also: [string, unknown][] = []) {
    const before = this.setlists;
    this.setlists = next;
    this.render();
    await saveChanged(next, before, also);
  }

  update(s: Setlist) {
    return this.change(withSetlist(this.setlists, s));
  }

  async deleteSetlist(s: Setlist) {
    await deleteSetlist(this.setlists, s.id);
    this.setlists = this.setlists.filter((x) => x.id !== s.id);
    this.render();
  }

  addedTo(id: string) {
    this.lastAddedTo = id;
    void saveLastAddedTo(id);
  }

  /**
   * "Add to <default setlist>" and "Add to setlist…" for a score, or the excerpt `span` of it, called
   * `what`; the second opens a menu of setlists below `anchor`, with New setlist….
   */
  addToItems(anchor: Element, scoreId: string, what: string, span: Span = {}): MenuItem[] {
    const add = async (s: Setlist) => {
      const o = this.originalOf(scoreId);
      if (o && !(await this.givePassword(o))) return;
      s = this.setlist(s.id) ?? s;
      this.openRows.add(s.id);
      this.addedTo(s.id);
      void this.change(withSetlist(this.setlists, addEntries(s, [{ scoreId, span }])));
      this.toast.say(`Added “${what}” to “${s.title}”.`);
    };
    const d = defaultSetlist(this.setlists, this.lastAddedTo);
    return [
      ...(d ? [{ label: `Add to “${d.title}”`, run: () => void add(d) }] : []),
      { label: 'Add to setlist…', run: () => chooseSetlist(anchor, `Add “${what}” to`, this.setlists, (s) => void add(s), scoreId) },
    ];
  }

  exportPdf(title: string, what: (Span & { scoreId: string })[]) {
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

  /* ---------- named excerpts, and scores opened for dialogs ---------- */

  /** Save a score changed here (its names), with the setlists if they changed too. */
  private saveScore(score: Score, setlists = this.setlists) {
    this.saved.set(score.id, score);
    this.openRows.add(score.id);
    return this.change(setlists, [scoreEntry(score)]);
  }

  excerptHost(scoreId: string): ExcerptHost {
    return {
      setlists: this.setlists,
      aspects: this.shapes.get(scoreId),
      save: (score, setlists) => void this.saveScore(score, setlists),
      say: (t) => this.toast.say(t),
    };
  }

  async withPages(o: Original, pick: (sc: LibraryScore) => void) {
    const sc = await this.openForDialog(o);
    if (!sc) return;
    this.remember(sc);
    pick(sc);
    whenOverlayCloses(sc.close);
  }

  remember(sc: ExcerptSource) {
    this.saved.set(sc.state.score.id, sc.state.score);
    this.shapes.set(sc.state.score.id, sc.aspects);
  }

  async openForDialog(o: Original): Promise<LibraryScore | null> {
    this.toast.say(`Opening “${titleOf(o.path)}”…`);
    try {
      // Opening is a tap, so it can also allow access to the scores folder for this session.
      const sc = await openScore(o);
      this.toast.hide();
      this.accessAllowed();
      return sc;
    } catch (e) {
      if (e instanceof NoAccess) { this.toast.say(NO_ACCESS); return null; }
      console.error(e);
      this.toast.say(e instanceof PasswordNotGiven ? `“${titleOf(o.path)}” needs its password to open.` : `Could not open “${titleOf(o.path)}”. It may have been moved or renamed.`);
      return null;
    }
  }

  async givePassword(o: Original): Promise<boolean> {
    if (!this.locked.has(o.id)) return true;
    try {
      if (!(await givePassword(o))) return false;
    } catch (e) {
      if (e instanceof NoAccess) { this.toast.say(NO_ACCESS); return false; }
      console.error(e);
      this.toast.say(`Could not open “${titleOf(o.path)}”. It may have been moved or renamed.`);
      return false;
    }
    this.accessAllowed();
    return this.unlocked(o);
  }

  /** A score was read from the scores folder, so access to it may just have been allowed: then read it again. */
  private accessAllowed() {
    if (this.folder.kind === 'locked') void this.refresh();
  }

  private unlocked(o: Original) {
    if (this.locked.delete(o.id)) this.scoresSection.render();
    return true;
  }

  /* ---------- opening the reader ---------- */

  open(s: Original) {
    // In the library's order, to turn on to the next score from this one's end.
    const library = byFolder(this.originals).flatMap((l) => l.originals);
    void this.read({ kind: 'score', original: s, library }, `Could not open “${titleOf(s.path)}”. It may have been moved or renamed.`);
  }

  /** Read a named excerpt, as a setlist entry playing it is read: only its cuts, always from its start. */
  readExcerpt(o: Original, excerpt: ExcerptName) {
    void this.read({ kind: 'excerpt', original: o, excerpt }, `Could not open “${titleOf(o.path)}”. It may have been moved or renamed.`);
  }

  play(s: Setlist, startEntry?: string) {
    this.openRows.add(s.id);
    void this.read({ kind: 'setlist', setlistId: s.id, originals: this.originals, startEntry }, `Could not open “${s.title}”.`);
  }

  private async read(what: ToRead, failed: string) {
    this.say('');
    closeOverlay();
    this.toast.hide();
    // Hidden, the library leaves nothing to scroll and its place is lost: note it, to go back to.
    const scrolled = window.scrollY;
    this.root.hidden = true;
    const back = (fileChanges: FileChange[]) => {
      this.root.hidden = false;
      // Access allowed in the reader: read the scores folder now it can be.
      void folderState().then((f) => { if (f.kind !== this.folder.kind) void this.refresh(); });
      this.scoresSection.search.blur();
      window.scrollTo(0, scrolled);
      // A score renamed, moved or removed in the reader: show it, then read the scores again.
      if (fileChanges.length) { this.filesChanged(fileChanges); window.scrollTo(0, scrolled); }
      // Redrawn with what may have changed in the reader, then back where it was.
      else void this.loadSetlists().then(() => { this.scoresSection.render(); window.scrollTo(0, scrolled); });
    };
    try {
      // Opening is a tap, so a score's original can ask for access to the scores folder for this
      // session. A setlist plays without it from its saved pictures, asking for a page that isn't.
      await openReader(what, back);
    } catch (e) {
      this.root.hidden = false;
      if (e instanceof NoAccess) { this.say(NO_ACCESS); return; }
      console.error(e);
      this.say(e instanceof PasswordNotGiven ? `${e.message} to open.` : failed);
    }
  }
}
