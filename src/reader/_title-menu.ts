// The menu under the reader's title: what can be read, listed next to what is read, and the
// controls that change that list (move, change and remove an entry of a setlist; add, change and
// delete a score's named excerpts). Opened by the title; it comes back after the dialogs it opens.

import { canvasesOf } from '../page-cache/cache';
import { addExcerpt, changeExcerpt, deleteExcerpt as askDeleteExcerpt, type ExcerptHost } from '../dialogs/excerpts';
import { givePassword } from '../dialogs/passwords';
import { openAddScores } from '../dialogs/add-scores';
import { openExcerptPicker } from '../dialogs/excerpt-picker';
import { openScore } from '../dialogs/open-score';
import type { ExcerptSource } from '../dialogs/thumb-strip';
import { PasswordNotGiven } from '../originals/types';
import { titleOf } from '../originals/path-utils';
import { ends, sameExcerpt, sortedExcerpts } from '../scores/excerpts';
import type { NamedExcerpt, Score } from '../scores/model';
import { loadSavedScore, saveScore } from '../scores/store';
import { addEntries, moveEntry, withSetlist } from '../setlists/model';
import { saveLastAddedTo } from '../setlists/store';
import { button, dpr, el, GRIP, icon, plural } from '../ui/dom';
import { dragToReorder } from '../ui/drag-reorder';
import { buttonRow, closeOverlay, overlayOpen, showDialog, showMenu, whenOverlayCloses } from '../ui/overlay';
import type { OpenScore } from './_open-scores';
import type { MenusHost } from './_toolbar-menus';

/** One row of the title menu. */
export interface TitleRow {
  label: string;
  /** What the row is called in the labels of its buttons: the score's title, or the excerpt's name. */
  name: string;
  current: boolean;
  go(): void;
  /** The swap button: choose other cuts (and, for an excerpt, another name). */
  change?(): void;
  /** The bin. */
  remove?(): void;
  /** In a setlist, the entry's place in it, which its grip moves from. */
  index?: number;
}

/** " · Kyrie" or " · Pages 2–3" for an entry that plays an excerpt of a score that is open; otherwise nothing. */
function itemSuffix(h: MenusHost, k: number): string {
  const cur = h.open(k);
  const label = cur && h.reading.excerptName(k, cur.state.score, cur.aspects);
  return label ? ` · ${label}` : '';
}

/** The rows: a setlist's entries, or Whole score and the score's named excerpts. */
export function _titleRows(h: MenusHost): TitleRow[] {
  const { reading } = h;
  if (reading.what.kind === 'setlist') {
    return reading.items.map((it, k) => ({
      label: `${k + 1}. ${it.title}${itemSuffix(h, k)}`,
      name: it.title,
      current: k === h.k(),
      go: () => h.goTo(k),
      change: () => void changeEntry(h, k),
      remove: () => confirmRemove(h, k),
      index: k,
    }));
  }
  const rows: TitleRow[] = [{ label: 'Whole score', name: 'whole score', current: reading.what.kind === 'score', go: () => h.readWhole() }];
  const cur = h.open(h.k());
  if (!cur) return rows;
  const score = cur.state.score, read = reading.what.kind === 'excerpt' ? reading.what.excerpt : undefined;
  for (const x of sortedExcerpts(score)) {
    rows.push({
      label: x.name,
      name: x.name,
      current: !!read && sameExcerpt(score.cuts, x, read),
      go: () => h.playExcerpt(ends(x)),
      change: () => void changeNamed(h, x),
      remove: () => deleteNamed(h, x),
    });
  }
  return rows;
}

const SWAP = 'M4 8h15l-4-4M20 16H5l4 4';
const BIN = 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12';

/** A round icon button in a row, with its label for screen readers and a tooltip. */
function iconButton(cls: string, d: string, label: string, run?: () => void): HTMLButtonElement {
  const b = button('', () => { closeOverlay(); run?.(); }, `${cls} quiet`);
  b.append(icon(d));
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

/** Show the title menu below the title. */
export function showTitleMenu(h: MenusHost) {
  const { reading } = h, inSetlist = reading.what.kind === 'setlist';
  const heading = reading.setlist?.title ?? reading.items[0].title;
  const list = el('div', 'title-list');
  for (const row of _titleRows(h)) {
    const li = el('div', 'title-row');
    if (row.current) { li.classList.add('current'); li.setAttribute('aria-current', 'true'); }
    if (row.index !== undefined) {
      const grip = button('', () => {}, 'grip quiet');
      grip.append(icon(GRIP));
      grip.setAttribute('aria-label', `Move ${row.name}`);
      const i = row.index;
      dragToReorder(grip, li, list, i, (to) => {
        const s = reading.setlist;
        if (!s) return;
        reading.setlists = withSetlist(reading.setlists, moveEntry(s, i, to));
        h.saver.soon();
        h.relisted(reading.items[h.k()]?.entryId);
        showTitleMenu(h);
      });
      li.append(grip);
    }
    const go = button(row.label, () => { closeOverlay(); row.go(); }, 'go');
    go.setAttribute('role', 'menuitem');
    li.append(go);
    if (row.change) li.append(iconButton('swap', SWAP, inSetlist ? `Change excerpt of ${row.name}` : `Change ${row.name}`, row.change));
    if (row.remove) li.append(iconButton('bin', BIN, inSetlist ? `Remove ${row.name} from setlist` : `Delete ${row.name}`, row.remove));
    list.append(li);
  }
  const add = button('+', () => { closeOverlay(); if (inSetlist) void addScores(h); else void addNamed(h); }, 'menu-action quiet');
  const addLabel = inSetlist ? 'Add scores…' : 'Add excerpt…';
  add.setAttribute('aria-label', addLabel);
  add.title = addLabel;
  showMenu(h.toolbar.anchor('title'), heading, [list], undefined, add);
}

/** What `reopenAfter` gives back: ways to say the menu should wait for, or not come back at all. */
interface Reopen {
  /** The menu comes back only once `p` is done (the reader has gone to the entry it will show). */
  after(p: Promise<unknown>): void;
  /** The menu doesn't come back (the reader is leaving). */
  cancel(): void;
}

/** Open the title menu again once the dialog opened now closes, unless another took its place. */
function reopenAfter(h: MenusHost): Reopen {
  let wait: Promise<unknown> = Promise.resolve(), cancelled = false;
  whenOverlayCloses(() => setTimeout(() => {
    void wait.then(() => { if (!cancelled && !overlayOpen()) showTitleMenu(h); });
  }));
  return { after: (p) => { wait = p; }, cancel: () => { cancelled = true; } };
}

/** An open score's pages, for the excerpt picker. */
function source(cur: OpenScore): ExcerptSource {
  return { state: cur.state, aspects: cur.aspects, pages: (p, w) => canvasesOf(cur.drawProgressive!(p + 1, Math.round(w * dpr()))) };
}

/** Changing the open score's named excerpts from the reader, saved with the score. */
function excerptHost(h: MenusHost, cur: OpenScore): ExcerptHost {
  return {
    setlists: h.reading.setlists,
    aspects: cur.aspects,
    save: (score, setlists) => {
      cur.state = { ...cur.state, score };
      if (setlists) h.reading.setlists = setlists;
      h.saver.soon(cur);
      h.retitle();
    },
    say: (t) => h.say(t),
  };
}

/** Change which of the score's cuts entry `k` plays. */
async function changeEntry(h: MenusHost, k: number) {
  const { reading } = h, it = reading.items[k];
  if (!(await h.access())) { showTitleMenu(h); return; }
  const cur = await h.ensure(k), entry = reading.entry(k);
  if (!cur?.draw || !entry) {
    h.say(`Could not open “${it.title}”.`);
    showTitleMenu(h);
    return;
  }
  openExcerptPicker({
    ...source(cur),
    question: `Which part of “${it.title}” does entry ${k + 1} play?`,
    verb: 'This entry plays',
    named: true,
    excerpt: entry,
    done: (excerpt) => {
      reading.play(k, excerpt);
      // The score too: one opened for the first time isn't saved yet, and the excerpt names its cuts.
      h.saver.soon(cur);
      if (k === h.k()) h.replay(); else void h.relisted(reading.items[h.k()]?.entryId);
    },
  });
  reopenAfter(h);
}

/** Ask before taking entry `k` out of the setlist. */
function confirmRemove(h: MenusHost, k: number) {
  const { reading } = h, s = reading.setlist, it = reading.items[k];
  if (!s || !it) return;
  const d = showDialog(`Remove “${it.title}” from “${s.title}”?`);
  const again = reopenAfter(h);
  d.append(buttonRow(button('Cancel', closeOverlay), button('Remove', () => { closeOverlay(); removeEntry(h, k, again); }, 'danger')));
}

/**
 * Take entry `k` out of the setlist. Removing the entry being read reads the next (or the one
 * before); with none left, back to the library. With Undo.
 */
function removeEntry(h: MenusHost, k: number, again: Reopen) {
  const { reading } = h, s = reading.setlist, e = reading.entry(k);
  if (!s || !e) return;
  const title = reading.items[k].title, at = s.entries.indexOf(e), wasRead = k === h.k();
  const readId = reading.items[h.k()]?.entryId;
  reading.setlists = withSetlist(reading.setlists, { ...s, entries: s.entries.filter((x) => x !== e) });
  h.saver.soon();
  again.after(wasRead ? h.relisted(undefined, at) : h.relisted(readId));
  if (!reading.setlist?.entries.length) { again.cancel(); return; }
  h.say(`Removed “${title}” from “${s.title}”.`, ['Undo', () => {
    const now = reading.setlist;
    if (!now) return;
    const entries = [...now.entries];
    entries.splice(Math.min(at, entries.length), 0, e);
    reading.setlists = withSetlist(reading.setlists, { ...now, entries });
    h.saver.soon();
    void h.relisted(wasRead ? e.id : readId);
  }]);
}

/** Add scores to the end of the setlist read, as from the library. */
async function addScores(h: MenusHost) {
  const { reading } = h, originals = h.library;
  // The scores as saved: a preview opens them from there.
  await h.saver.flush();
  const saved = await Promise.all(originals.map((o) => loadSavedScore(o.id)));
  const s = reading.setlist;
  if (!s) { showTitleMenu(h); return; }
  openAddScores({
    setlist: s,
    originals,
    saved: new Map(saved.filter((x): x is Score => !!x).map((x) => [x.id, x])),
    givePassword: (o) => givePassword(o).catch((e) => { console.error(e); h.say(`Could not open “${titleOf(o.path)}”.`); return false; }),
    open: (o) => openScore(o).catch((e) => {
      console.error(e);
      h.say(e instanceof PasswordNotGiven ? `“${titleOf(o.path)}” needs its password to open.` : `Could not open “${titleOf(o.path)}”.`);
      return null;
    }),
    add: (entries, scores) => {
      const now = reading.setlist;
      if (!now) return;
      // The scores excerpts were chosen from too, so the excerpts and the cuts they name agree.
      for (const x of scores) void saveScore(x.state).catch((e) => { console.error('Could not save a score:', e); h.say('Could not save the excerpts chosen.'); });
      reading.setlists = withSetlist(reading.setlists, addEntries(now, entries));
      void saveLastAddedTo(now.id).catch((e) => console.warn('Could not save the setlist last added to:', e));
      h.saver.soon();
      void h.relisted(reading.items[h.k()]?.entryId);
      h.say(`Added ${plural(entries.length, 'score')} to “${now.title}”.`);
    },
  });
  reopenAfter(h);
}

/** Name part of the score, in the excerpt picker. */
async function addNamed(h: MenusHost) {
  if (!(await h.access())) { showTitleMenu(h); return; }
  const cur = h.open(h.k());
  if (!cur?.draw) { showTitleMenu(h); return; }
  addExcerpt(source(cur), h.reading.items[0].title, excerptHost(h, cur));
  reopenAfter(h);
}

/** Change the name and the cuts of a named excerpt, following it if it is the one read. */
async function changeNamed(h: MenusHost, x: NamedExcerpt) {
  if (!(await h.access())) { showTitleMenu(h); return; }
  const cur = h.open(h.k());
  if (!cur?.draw) { showTitleMenu(h); return; }
  const { reading } = h, read = reading.what.kind === 'excerpt' ? reading.what.excerpt : undefined;
  const isRead = !!read && sameExcerpt(cur.state.score.cuts, x, read);
  changeExcerpt(source(cur), x, excerptHost(h, cur), (to) => {
    if (!isRead) return;
    reading.play(h.k(), to);
    h.saver.soon(cur);
    h.replay();
  });
  reopenAfter(h);
}

/**
 * Delete a named excerpt, asking first. Deleting the one being read goes on to the next of the
 * score's (or the one before); with none left, back to the library.
 */
function deleteNamed(h: MenusHost, x: NamedExcerpt) {
  const cur = h.open(h.k());
  if (!cur) return;
  const { reading } = h, host = excerptHost(h, cur), score = cur.state.score;
  const read = reading.what.kind === 'excerpt' ? reading.what.excerpt : undefined;
  const isRead = !!read && sameExcerpt(score.cuts, x, read);
  const at = sortedExcerpts(score).findIndex((n) => n.name === x.name);
  askDeleteExcerpt(score, x, {
    ...host,
    save: (next, setlists) => {
      host.save(next, setlists);
      if (!isRead) return;
      const left = sortedExcerpts(next), after = left[at] ?? left[at - 1];
      if (after) h.playExcerpt(ends(after)); else { again.cancel(); h.leave(); }
    },
  });
  const again = reopenAfter(h);
}
