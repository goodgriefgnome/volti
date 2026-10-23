// The "Add scores" dialog: picking scores to add to the end of a setlist, each whole, as its named
// excerpts, or as excerpts chosen in its preview. "New setlist" and a setlist's ⋯ › Add scores
// both open it.

import { byFolder, type Original } from '../originals/originals';
import type { ExcerptName, Score } from '../scores/model';
import { newId, type Entry, type Setlist, type Span } from '../setlists/model';
import { ends, excerptName, nameOf, sameSpan, sortedNames } from '../setlists/names';
import { button, el, plural } from '../ui/dom';
import { ExcerptStrip, namedExcerptMenu, type ExcerptSource } from '../ui/excerpt-picker';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
import type { LibraryScore } from './open-score';

export interface AddScoresHost {
  setlist: Setlist;
  /** The library's scores, in the order shown. */
  originals: readonly Original[];
  /** Scores as last saved, for their named excerpts. */
  saved: ReadonlyMap<string, Score>;
  /** Open a score to preview; null if it can't be (having said why). */
  open(o: Original): Promise<LibraryScore | null>;
  /** Add these entries to the end of the setlist; `scores` are the ones they choose excerpts of. */
  add(entries: Entry[], scores: ExcerptSource[]): void;
}

/**
 * One entry to add: the whole score, a named excerpt ticked under it, or an excerpt chosen in its
 * preview.
 */
interface Choice { span: Span; label: string | null; named?: boolean; src?: ExcerptSource }

/** A row's title, with what else it says ("in this setlist"), wrapping beside its checkbox. */
function pickText(title: string, meta = ''): HTMLElement {
  const t = el('span', 'pick-text');
  t.append(el('span', 'pick-title', title));
  if (meta) t.append(el('span', 'meta', meta));
  return t;
}

/**
 * Scores as checkboxes, each with its named excerpts under it; the ticked ones go at the end, in
 * library order. Preview shows a score's pages, to add other excerpts of it instead of the whole
 * score: several, for a setlist that comes back to the score (the Kyrie, another piece, then the
 * Gloria).
 */
export function openAddScores(h: AddScoresHost) {
  const s = h.setlist;
  /** By score, the entries to add, in the order chosen. */
  const chosen = new Map<string, Choice[]>();
  const count = () => [...chosen.values()].reduce((n, c) => n + c.length, 0);
  const d = showDialog(`Add scores to “${s.title}”`);
  const heading = d.querySelector('h2')!;
  const listView = el('div', 'view');
  const list = el('div', 'picklist');
  const add = button('Add', () => {
    closeOverlay();
    const picked = h.originals.flatMap((o) => (chosen.get(o.id) ?? []).map((c) => [o.id, c] as const));
    h.add(
      picked.map(([scoreId, c]) => ({ id: newId(), scoreId, ...c.span })),
      [...new Set(picked.flatMap(([, c]) => (c.src ? [c.src] : [])))],
    );
  }, 'primary');
  const sync = () => {
    const n = count();
    add.disabled = !n;
    add.textContent = n ? `Add ${plural(n, 'score')}` : 'Add';
  };
  sync();

  /** The score's named excerpts to list: all of them, or when searching, those that match unless the score does. */
  const namesShown = (sc: Original, q: string) => {
    const score = h.saved.get(sc.id), names = score ? sortedNames(score) : [];
    return !q || `${sc.title} ${sc.folder}`.toLowerCase().includes(q) ? names : names.filter((x) => x.name.toLowerCase().includes(q));
  };

  /** The subfolder lists opened in this dialog; they start closed. */
  const openFolders = new Set<string>();
  const fill = (search: string) => {
    list.replaceChildren();
    const q = search.trim().toLowerCase();
    const shown = h.originals.filter((x) => `${x.title} ${x.folder}`.toLowerCase().includes(q) || namesShown(x, q).length);
    if (!shown.length) list.append(el('p', 'empty', h.originals.length ? `Nothing matches “${search}”.` : 'No scores yet.'));
    // As in the library: the top of the folder, then a list for each subfolder, opened by its heading.
    for (const { folder, originals } of byFolder(shown)) {
      const rows = originals.map((sc) => row(sc, namesShown(sc, q)));
      if (!folder) { list.append(...rows); continue; }
      const open = !!q || openFolders.has(folder);
      const group = el('div', 'pick-folder' + (open ? ' open' : ''));
      const body = el('div', 'pick-folder-body');
      body.hidden = !open;
      body.append(...rows);
      const head = button('', () => {
        const now = Boolean(body.hidden);
        body.hidden = !now;
        group.classList.toggle('open', now);
        head.setAttribute('aria-expanded', String(now));
        if (!q) { if (now) openFolders.add(folder); else openFolders.delete(folder); }
      }, 'folder-head');
      head.append(el('span', 'chev'), el('span', '', folder.split('/').join(' / ')));
      head.setAttribute('aria-expanded', String(open));
      group.append(head, body);
      list.append(group);
    }
  };

  /** Tick or untick one choice of a score. */
  const toggle = (scoreId: string, c: Choice, on: boolean, same: (x: Choice) => boolean) => {
    const rest = (chosen.get(scoreId) ?? []).filter((x) => !same(x));
    const next = on ? [...rest, c] : rest;
    if (next.length) chosen.set(scoreId, next); else chosen.delete(scoreId);
  };

  const row = (sc: Original, names: ExcerptName[]): HTMLElement => {
    const r = el('div', 'pick-row');
    const label = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    const mine = chosen.get(sc.id) ?? [];
    box.checked = mine.some((c) => !c.named);
    box.addEventListener('change', () => {
      // Ticked alone, the whole score; unticked, it and the excerpts chosen in its preview.
      if (box.checked) toggle(sc.id, { span: {}, label: null }, true, (c) => !c.label);
      else toggle(sc.id, { span: {}, label: null }, false, (c) => !c.named);
      redraw();
    });
    const redraw = () => { sync(); r.replaceWith(row(sc, names)); };
    const has = s.entries.filter((e) => e.scoreId === sc.id).length;
    label.append(box, pickText(sc.title, has ? `in this setlist${has > 1 ? ` ${has}×` : ''}` : ''));
    const preview = button('Preview', () => void showPreview(sc), 'quiet');
    preview.setAttribute('aria-label', `Preview ${sc.title}`);
    r.append(label, preview);
    // Named excerpts, indented under their score, each with its own Preview.
    const score = h.saved.get(sc.id);
    for (const x of score ? names : []) {
      const sub = el('div', 'pick-sub');
      const named = el('label', 'check excerpt');
      const b = el('input');
      b.type = 'checkbox';
      const isIt = (c: Choice) => !!c.named && sameSpan(score!.cuts, c.span, x);
      b.checked = mine.some(isIt);
      b.addEventListener('change', () => {
        toggle(sc.id, { span: ends(x), label: x.name, named: true }, b.checked, isIt);
        redraw();
      });
      named.append(b, pickText(x.name));
      const look = button('Preview', () => void showPreview(sc, x), 'quiet');
      look.setAttribute('aria-label', `Preview ${x.name}`);
      sub.append(named, look);
      r.append(sub);
    }
    // Excerpts chosen in the preview, each with a button to take it out again.
    const previewed = mine.filter((c) => c.label && !c.named);
    if (previewed.length) {
      const pills = el('div', 'chosen');
      for (const c of previewed) {
        const pill = button(`${c.label} ×`, () => {
          toggle(sc.id, c, false, (x) => x === c);
          redraw();
        }, 'pill');
        pill.setAttribute('aria-label', `Don't add ${c.label}`);
        pills.append(pill);
      }
      r.append(pills);
    }
    return r;
  };

  // The preview takes the dialog's place, as one dialog is open at a time.
  const previewView = el('div', 'view');
  previewView.hidden = true;
  let open: LibraryScore | null = null;
  const closePreview = () => { open?.close(); open = null; };
  whenOverlayCloses(closePreview);
  const back = () => {
    closePreview();
    previewView.hidden = true;
    listView.hidden = false;
    heading.textContent = `Add scores to “${s.title}”`;
    fill(find.value);
  };
  /** Show a score's pages to choose an excerpt of it, starting from `span` (a named excerpt, say). */
  const showPreview = async (o: Original, span: Span = {}) => {
    const sc = await h.open(o);
    if (!sc || !d.isConnected) { sc?.close(); return; }
    closePreview();
    open = sc;
    const strip = new ExcerptStrip(sc, span, 'Adds');
    const use = button('Add this excerpt', () => {
      const span = strip.span, score = sc.state.score, name = nameOf(score, span);
      // An excerpt takes the place of the whole score ticked on its own; the same one twice is once.
      // A named excerpt is ticked under its score, rather than shown apart.
      const was = (chosen.get(o.id) ?? []).filter((c) => c.label && !sameSpan(score.cuts, c.span, span));
      const choice: Choice = name ? { span: ends(name), label: name.name, named: true, src: sc } : { span, label: excerptName(score, span, sc.aspects), src: sc };
      chosen.set(o.id, [...was, choice]);
      sync();
      back();
    }, 'primary');
    heading.textContent = o.title;
    previewView.replaceChildren(namedExcerptMenu(strip, sc.state.score), strip.el, strip.hint, buttonRow(button('Back', back), use));
    listView.hidden = true;
    previewView.hidden = false;
    strip.reveal();
    use.focus();
  };

  const find = el('input', 'search');
  find.type = 'search';
  find.placeholder = 'Find a score or excerpt';
  find.setAttribute('aria-label', 'Find a score or excerpt');
  find.addEventListener('input', () => fill(find.value));
  fill('');
  listView.append(
    el('p', 'hint', 'They go at the end, in the order shown. Tick a score or its named excerpts, or preview a score to add other parts of it.'),
    find, list, buttonRow(button('Cancel', closeOverlay), add),
  );
  d.append(listView, previewView);
  find.focus();
}
