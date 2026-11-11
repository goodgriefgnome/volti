// The Library screen: what it has read (the scores folder, the scores and their originals, the
// setlists), saving changes to them, and opening the reader. The parts it shows are their own
// files: the folder banner, the setlists and the scores, each given this as its LibraryHost.

import { chooseSetlist } from '../dialogs/setlists';
import { givePassword } from '../dialogs/passwords';
import { openExportPdf } from '../dialogs/export-pdf';
import { openScore, type LibraryScore } from '../dialogs/open-score';
import { type ExcerptHost } from '../dialogs/excerpts';
import { type ExcerptSource } from '../dialogs/thumb-strip';
import type { Excerpt } from '../scores/excerpts';
import type { ExportPart } from '../export/pdf';
import { arrivals, byFolder, titleOf } from '../originals/path-utils';
import { canLinkFolder } from '../originals/handles/device-score-fs';
import { driveOffered, driveSignedIn, signInToDrive } from '../originals/drive/score-fs';
import { folderState, linkDeviceFolder, linkDriveFolder, unlinkFolder, unlockFolder } from '../originals/linked-folder';
import { chooseDriveFolder } from './_drive-folders';
import { knownTitles, libraryFiles, scanRoot } from '../originals/library-files';
import { inboxFiles, leftInApp } from '../originals/misc-files';
import { type FolderState, type SourceFile } from '../originals/types';
import { openReader, type ToRead } from '../reader/reader';
import { knownAspects } from '../originals/read/original';
import { loadSavedScore, scoreEntry } from '../scores/store';
import { type Aspects, type NamedExcerpt, type Score } from '../scores/model';
import { addEntries, defaultSetlist, withSetlist, type Setlist } from '../setlists/model';
import { deleteSetlist, loadLastAddedTo, loadSetlists, saveChanged, saveLastAddedTo } from '../setlists/store';
import { closeOverlay, showMenu, whenOverlayCloses, type MenuItem } from '../ui/overlay';
import { el, plural } from '../ui/dom';
import { Toast } from '../ui/toast';
import { failed, failedOnce, showFailuresWith } from '../ui/failure';
import { FolderBanner } from './_folder-banner';
import type { LibraryHost } from './_host';
import { openIncoming } from './_incoming';
import { ScoresSection } from './_scores-section';
import { keepSetlistPagesOffline } from './_offline-pages';
import type { OfflineStatus } from './_offline-status';
import { SetlistsSection } from './_setlists-section';
import { hearPageCacheTrouble } from '../page-cache/cache';
import { warmUp } from '../face/watcher';

/** How long Volti has to be out of view before the scores folder is read again on coming back. */
const AWAY_MS = 30_000;

/** The Library screen: setlists, the scores in its root (the scores folder, or the app's own), and the list to open them from. */
export class Library implements LibraryHost {
  folder: FolderState = { kind: 'none' };
  originals: SourceFile[] = [];
  reading = false;
  /** How many scores are left in Volti's own folder while a folder is linked. */
  leftIn = 0;
  setlists: Setlist[] = [];
  saved = new Map<string, Score>();
  shapes = new Map<string, Aspects>();
  openRows = new Set<string>();
  toast = new Toast();
  offline = new Map<string, OfflineStatus>();
  /** Every original's title as last seen, for scores whose original is missing. */
  private titles: Record<string, string> = {};
  /** The setlist a score was last added to: see `defaultSetlist`. */
  private lastAddedTo: string | undefined;
  /** The refresh running, and whether another was asked for meanwhile. */
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;
  /** Stops following the library's files: never, while the library lives. */
  private following = new AbortController();
  /** What the status line said before a scan began counting its new files. */
  private saidBefore = '';
  /** The ids the setlists were last loaded for: undefined before the first. */
  private loadedFor: string | undefined;
  private drawing = false;

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
    // Failures of what happens in the background show on the status line (while the reader isn't open).
    showFailuresWith((t) => this.say(t));
    hearPageCacheTrouble((what, e) => failedOnce(what, e));
    void this.follow();
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

  /**
   * Show the library's files for as long as the library lives: they follow the records, which every
   * scan and every change Volti makes writes. Drawn at most once a frame.
   */
  private async follow() {
    let first = true;
    try {
      for await (const { files, left } of libraryFiles(this.following.signal)) {
        this.originals = files;
        if (left) {
          if (!this.reading) this.saidBefore = this.status.textContent ?? '';
          this.say(`Reading new scores: ${left} left…`);
        } else if (this.reading && this.status.textContent?.startsWith('Reading new scores')) this.say(this.saidBefore);
        this.reading = left > 0;
        this.draw();
        // Once the library has its first reading of the scores, get MediaPipe ready if a gesture is set.
        if (first) { first = false; void warmUp(); }
      }
    } catch (e) {
      failedOnce('follow the library\'s files', e);
    }
  }

  /** Draw the scores at the next frame; the setlists too, when the scores are not being read and their set changed. */
  private draw() {
    if (this.drawing) return;
    this.drawing = true;
    requestAnimationFrame(() => {
      this.drawing = false;
      const ids = this.originals.map((o) => o.id).join();
      if (this.loadedFor === undefined || (!this.reading && ids !== this.loadedFor)) void this.loadSetlists().then(() => this.scoresSection.render());
      else this.scoresSection.render();
    });
  }

  /** The library's files as the records say now, for after a scan. */
  private async currentFiles(): Promise<SourceFile[]> {
    const stop = new AbortController();
    for await (const { files } of libraryFiles(stop.signal)) { stop.abort(); return files; }
    return [];
  }

  private async readOriginals() {
    this.folder = await folderState();
    this.leftIn = this.folder.kind === 'none' ? 0 : (await leftInApp().catch(() => [])).length;
    this.banner.render();
    try {
      await scanRoot();
    } catch (e) {
      // The folder may have been moved or deleted since it was linked.
      this.say(failed('read the scores folder', e));
    }
    this.originals = await this.currentFiles();
    await this.loadSetlists();
    this.scoresSection.render();
  }

  private async loadSetlists() {
    [this.setlists, this.titles, this.lastAddedTo] = await Promise.all([loadSetlists(), knownTitles(), loadLastAddedTo()]);
    await this.scoresSection.load();
    this.loadedFor = this.originals.map((o) => o.id).join();
    // Every score's, for its named excerpts, and those of scores in setlists that are missing.
    const ids = [...new Set([...this.originals.map((o) => o.id), ...this.setlists.flatMap((s) => s.entries.map((e) => e.scoreId))])];
    const [saved, shapes] = await Promise.all([Promise.all(ids.map(loadSavedScore)), Promise.all(ids.map(knownAspects))]);
    this.saved = new Map(saved.filter((x): x is Score => !!x).map((x) => [x.id, x]));
    this.shapes = new Map(ids.flatMap((id, i) => (shapes[i] ? [[id, shapes[i]] as const] : [])));
    this.renderSetlists();
  }

  /* ---------- the scores folder ---------- */

  /** Link a scores folder: on the tablet or in Google Drive, whichever there is; a menu when both. */
  async link() {
    const device = canLinkFolder(), drive = driveOffered();
    if (device && drive) {
      showMenu(this.banner.el, 'Link scores folder', [
        { label: 'A folder on this tablet', run: () => void this.linkOnDevice() },
        { label: 'A folder in Google Drive', run: () => void this.linkInDrive() },
      ]);
    } else if (drive) await this.linkInDrive();
    else if (device) await this.linkOnDevice();
  }

  /** From a tap: sign in to Google if need be (which leaves the page, coming back to the chooser), then choose the folder. */
  private async linkInDrive() {
    if (!(await driveSignedIn())) { await signInToDrive('link'); return; }
    await this.chooseDriveFolder();
  }

  /** The folder chooser, then linking what is chosen and reading it. */
  async chooseDriveFolder() {
    const picked = await chooseDriveFolder();
    if (!picked) return;
    try {
      await linkDriveFolder(picked.id, picked.name);
    } catch (e) {
      this.say(failed('link the folder', e));
      return;
    }
    await this.refresh();
    await this.moveLeftIn(false);
  }

  private async linkOnDevice() {
    try {
      if (!(await linkDeviceFolder())) return;
    } catch (e) {
      this.say(failed('link the folder', e));
      return;
    }
    await this.refresh();
    await this.moveLeftIn(false);
  }

  /**
   * Move the scores in Volti's own folder into the linked folder, at their paths, overwriting
   * nothing: one the folder has already is dropped, and those whose paths the folder has for
   * different files open in the screen for incoming files, from the ⋯ menu (`asked`); on linking,
   * the status line says how many clash, and points to the ⋯ menu. One left out stays in Volti's
   * folder, out of the library, until this is done again from the ⋯ menu. It acts on the whole
   * scan of the linked folder: from the ⋯ menu it asks for access first (the tap counts), then scans.
   */
  async moveLeftIn(asked: boolean) {
    if (asked) {
      if (this.folder.kind === 'locked' && !(await unlockFolder())) { this.say('Volti has no access to the scores folder.'); return; }
      this.say('Checking the scores folder…');
      await this.refresh();
    }
    const left = await leftInApp();
    if (!left.length) { if (asked) this.say(''); return this.countLeftIn(); }
    const what = arrivals(left, this.originals);
    const taken: SourceFile[] = [];
    let moved = 0;
    if (left.length > 1) this.say(`Moving ${plural(left.length, 'score')} into the scores folder…`);
    try {
      for (const [i, f] of left.entries()) {
        const a = what[i];
        if (a.kind === 'taken') { taken.push(f); continue; }
        // One the folder has already is only dropped from Volti's folder.
        if (a.kind === 'have') { await f.remove(); continue; }
        // Taken after all, by a file the library doesn't list.
        if (await f.move(f.path)) { taken.push(f); continue; }
        moved++;
      }
    } catch (e) {
      this.say(failed('move the scores into the scores folder', e));
      return this.countLeftIn();
    }
    const movedSaid = moved ? `Moved ${plural(moved, 'score')} into the scores folder.` : '';
    if (asked || !taken.length) this.say(movedSaid);
    else this.say(`${movedSaid ? movedSaid + ' ' : ''}${taken.length} ${taken.length === 1 ? 'has' : 'have'} the same name as files there: see the ⋯ menu.`);
    await this.countLeftIn();
    // Moving one in drops it from Volti's folder.
    if (asked && taken.length) void openIncoming(this, taken);
  }

  /** How many scores are left in Volti's own folder, counted again, and the banner drawn. */
  private async countLeftIn() {
    this.leftIn = (await leftInApp().catch(() => [])).length;
    this.banner.render();
  }

  async unlock(): Promise<boolean> {
    // A folder in Google Drive is unlocked by signing in, which leaves the page.
    if (this.folder.kind === 'locked' && this.folder.place === 'drive') { await signInToDrive('unlock'); return false; }
    const ok = await unlockFolder();
    if (ok) { void this.refresh(); await this.addShared(); } else this.say('Volti has no access to the scores folder.');
    return ok;
  }

  /**
   * Open the files shared to Volti, waiting in the inbox, in the screen for incoming files. Those
   * not added, left out or cancelled, go to Recently removed as it closes. They wait while access
   * to the scores folder isn't allowed, and that is said.
   */
  async addShared() {
    const files = await inboxFiles();
    if (!files.length) return;
    if ((await folderState()).kind === 'locked') { this.say('Files shared to Volti open here once access to the scores folder is allowed.'); return; }
    void openIncoming(this, files, (added) => { for (const f of files) if (!added.includes(f)) void f.remove(); });
  }

  async unlink() {
    await unlinkFolder();
    this.say('Folder unlinked. Your markings are kept.');
    await this.refresh();
  }

  /* ---------- showing and changing ---------- */

  originalOf(id: string) { return this.originals.find((s) => s.id === id); }
  titleOf(scoreId: string) { const o = this.originalOf(scoreId); return (o && titleOf(o.path)) ?? this.titles[scoreId] ?? 'Missing score'; }
  setlist(id: string) { return this.setlists.find((s) => s.id === id); }

  /** Keep the setlists' pages saved offline, and show how much is. */
  private keepOffline() {
    keepSetlistPagesOffline(this.originals, this.setlists, (s) => {
      this.offline = s;
      this.setlistsSection.showOffline();
    });
  }

  private renderSetlists() {
    // Shown afresh whenever they change, or the scores do: keep their pages saved offline.
    this.keepOffline();
    this.setlistsSection.render();
  }

  render() {
    this.renderSetlists();
    this.scoresSection.render();
  }

  /** Show the setlists changed, and save them with `also`; a save that fails is said, and shows again what is stored. */
  async change(next: Setlist[], also: [string, unknown][] = []) {
    const before = this.setlists;
    this.setlists = next;
    this.render();
    try {
      await saveChanged(next, before, also);
    } catch (e) {
      this.say(failed('save the change', e));
      await this.loadSetlists().then(() => this.render(), () => {});
    }
  }

  update(s: Setlist) {
    return this.change(withSetlist(this.setlists, s));
  }

  async deleteSetlist(s: Setlist): Promise<boolean> {
    try {
      await deleteSetlist(this.setlists, s.id);
    } catch (e) {
      this.say(failed('delete', e, s.title));
      return false;
    }
    this.setlists = this.setlists.filter((x) => x.id !== s.id);
    this.render();
    return true;
  }

  addedTo(id: string) {
    this.lastAddedTo = id;
    void saveLastAddedTo(id).catch((e) => failedOnce('save the setlist last added to', e));
  }

  /**
   * "Add to <default setlist>" and "Add to setlist…" for a score, or `excerpt` of it, called
   * `what`; the second opens a menu of setlists below `anchor`, with New setlist….
   */
  addToItems(anchor: Element, scoreId: string, what: string, excerpt: Excerpt = {}): MenuItem[] {
    const add = async (s: Setlist) => {
      const o = this.originalOf(scoreId);
      if (o && !(await this.givePassword(o))) return;
      s = this.setlist(s.id) ?? s;
      this.openRows.add(s.id);
      this.addedTo(s.id);
      void this.change(withSetlist(this.setlists, addEntries(s, [{ scoreId, excerpt }])));
      this.toast.say(`Added “${what}” to “${s.title}”.`);
    };
    const d = defaultSetlist(this.setlists, this.lastAddedTo);
    return [
      ...(d ? [{ label: `Add to “${d.title}”`, run: () => void add(d) }] : []),
      { label: 'Add to setlist…', run: () => chooseSetlist(anchor, `Add “${what}” to`, this.setlists, (s) => void add(s), scoreId) },
    ];
  }

  exportPdf(title: string, what: (Excerpt & { scoreId: string })[]) {
    const parts: ExportPart[] = [], missing: string[] = [];
    for (const { scoreId, first, last } of what) {
      const original = this.originalOf(scoreId);
      if (original) parts.push({ original, excerpt: { first, last } });
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

  async withPages(o: SourceFile, pick: (sc: LibraryScore) => void) {
    const sc = await this.openForDialog(o);
    if (!sc) return;
    this.remember(sc);
    pick(sc);
    whenOverlayCloses(() => sc.close());
  }

  remember(sc: ExcerptSource) {
    this.saved.set(sc.state.score.id, sc.state.score);
    this.shapes.set(sc.state.score.id, sc.aspects);
  }

  async openForDialog(o: SourceFile): Promise<LibraryScore | null> {
    this.toast.say(`Opening “${titleOf(o.path)}”…`);
    try {
      // Opening is a tap, so it can also allow access to the scores folder for this session.
      const sc = await openScore(o);
      this.toast.hide();
      this.accessAllowed();
      return sc;
    } catch (e) {
      this.toast.say(failed('open', e, titleOf(o.path)));
      return null;
    }
  }

  async givePassword(o: SourceFile): Promise<boolean> {
    try {
      if (!(await givePassword(o))) return false;
    } catch (e) {
      this.toast.say(failed('open', e, titleOf(o.path)));
      return false;
    }
    this.accessAllowed();
    return true;
  }

  /** A score was read from the scores folder, so access to it may just have been allowed: then read it again. */
  private accessAllowed() {
    if (this.folder.kind === 'locked') void this.refresh();
    // The scores can be read now, so the setlists' pages missing offline can be drawn.
    this.keepOffline();
  }

  /* ---------- opening the reader ---------- */

  open(s: SourceFile) {
    // In the library's order, to turn on to the next score from this one's end.
    const library = byFolder(this.originals).flatMap((l) => l.originals);
    void this.read({ kind: 'score', original: s, library }, titleOf(s.path));
  }

  /** Read a named excerpt, as a setlist entry playing it is read: only its cuts, always from its start. */
  readExcerpt(o: SourceFile, named: NamedExcerpt) {
    void this.read({ kind: 'excerpt', original: o, excerpt: named }, titleOf(o.path));
  }

  play(s: Setlist, startEntry?: string) {
    this.openRows.add(s.id);
    void this.read({ kind: 'setlist', setlistId: s.id, originals: this.originals, startEntry }, s.title);
  }

  private async read(what: ToRead, title: string) {
    // Asked for first, as the tap is handled. Full screen uses up the tap, which asking for access
    // to a locked scores folder needs: then the reader asks for full screen itself, after. A
    // setlist with all its pages saved plays from them without asking; one without asks here.
    const asking = this.folder.kind === 'locked' && what.kind === 'setlist' && this.offline.get(what.setlistId)?.kind !== 'ready'
      ? unlockFolder().catch(() => false) : undefined;
    const fullscreen = this.folder.kind === 'locked' && (what.kind !== 'setlist' || asking) ? undefined : document.documentElement.requestFullscreen?.().catch(() => {});
    this.say('');
    closeOverlay();
    this.toast.hide();
    // Hidden, the library leaves nothing to scroll and its place is lost: note it, to go back to.
    const scrolled = window.scrollY;
    this.root.hidden = true;
    const back = () => {
      this.root.hidden = false;
      // Access allowed in the reader: read the scores folder now it can be.
      void folderState().then((f) => { if (f.kind !== this.folder.kind) void this.refresh(); });
      this.scoresSection.search.blur();
      window.scrollTo(0, scrolled);
      // Redrawn with what may have changed in the reader (a score renamed, moved or removed is in the records), then back where it was.
      void this.loadSetlists().then(() => { this.scoresSection.render(); window.scrollTo(0, scrolled); });
    };
    try {
      // Opening is a tap, so a score's original can ask for access to the scores folder for this
      // session. A setlist has asked already, if it needs to; in the reader, only the toolbar asks,
      // and a turn to a page that can't be shown at all.
      await asking;
      await openReader(what, back, fullscreen);
    } catch (e) {
      // Leave full screen first, as `Reader.close()` does, so the library's scroll isn't undone.
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      this.root.hidden = false;
      this.say(failed('open', e, title));
    }
  }
}
