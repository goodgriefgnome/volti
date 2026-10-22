// The "Add scores" dialog: picking scores to add to the end of a setlist, each whole or as one or
// more excerpts chosen in its preview. "New setlist" and a setlist's ⋯ › Add scores both open it.

import type { Original } from '../originals/originals';
import { newId, type Entry, type Setlist, type Span } from '../setlists/model';
import { excerptName } from '../setlists/names';
import { button, el, plural } from '../ui/dom';
import { ExcerptStrip, namedExcerptMenu, type ExcerptSource } from '../ui/excerpt-picker';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
import type { LibraryScore } from './open-score';

export interface AddScoresHost {
  setlist: Setlist;
  /** The library's scores, in the order shown. */
  originals: readonly Original[];
  /** Open a score to preview; null if it can't be (having said why). */
  open(o: Original): Promise<LibraryScore | null>;
  /** Add these entries to the end of the setlist; `scores` are the ones they choose excerpts of. */
  add(entries: Entry[], scores: ExcerptSource[]): void;
}

/** One entry to add: the whole score, or an excerpt chosen in its preview. */
interface Choice { span: Span; label: string | null; src?: ExcerptSource }

/**
 * Scores as checkboxes; the ticked ones go at the end, in library order. Preview shows a score's
 * pages, to add excerpts of it instead of the whole score: several, for a setlist that comes back
 * to the score (the Kyrie, another piece, then the Gloria).
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

  const fill = (q: string) => {
    list.replaceChildren();
    const shown = h.originals.filter((x) => `${x.title} ${x.folder}`.toLowerCase().includes(q.trim().toLowerCase()));
    if (!shown.length) list.append(el('p', 'empty', h.originals.length ? `Nothing matches “${q}”.` : 'No scores yet.'));
    for (const sc of shown) list.append(row(sc));
  };

  const row = (sc: Original) => {
    const r = el('div', 'pick-row');
    const label = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    const mine = chosen.get(sc.id) ?? [];
    box.checked = mine.length > 0;
    box.addEventListener('change', () => {
      if (box.checked) chosen.set(sc.id, [{ span: {}, label: null }]); else chosen.delete(sc.id);
      redraw();
    });
    const redraw = () => { sync(); r.replaceWith(row(sc)); };
    const has = s.entries.filter((e) => e.scoreId === sc.id).length;
    label.append(box, el('span', '', sc.title), el('span', 'meta', has ? `in this setlist${has > 1 ? ` ${has}×` : ''}` : sc.folder));
    const preview = button('Preview', () => void showPreview(sc), 'quiet');
    preview.setAttribute('aria-label', `Preview ${sc.title}`);
    r.append(label, preview);
    // Excerpts chosen, each with a button to take it out again.
    if (mine.some((c) => c.label)) {
      const pills = el('div', 'chosen');
      mine.forEach((c, i) => {
        const pill = button(`${c.label ?? 'Whole score'} ×`, () => {
          const left = mine.filter((_, k) => k !== i);
          if (left.length) chosen.set(sc.id, left); else chosen.delete(sc.id);
          redraw();
        }, 'pill');
        pill.setAttribute('aria-label', `Don't add ${c.label ?? 'the whole score'}`);
        pills.append(pill);
      });
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
  const showPreview = async (o: Original) => {
    const sc = await h.open(o);
    if (!sc || !d.isConnected) { sc?.close(); return; }
    closePreview();
    open = sc;
    const strip = new ExcerptStrip(sc, {}, 'Adds');
    const use = button('Add this excerpt', () => {
      const span = strip.span, label = excerptName(sc.state.score, span, sc.aspects);
      // An excerpt takes the place of the whole score ticked on its own; the same one twice is once.
      const was = (chosen.get(o.id) ?? []).filter((c) => c.label && (c.span.first !== span.first || c.span.last !== span.last));
      chosen.set(o.id, [...was, { span, label, src: sc }]);
      sync();
      back();
    }, 'primary');
    heading.textContent = o.title;
    const menu = namedExcerptMenu(strip, sc.state.score);
    previewView.replaceChildren(...(menu ? [menu] : []), strip.el, strip.hint, buttonRow(button('Whole score', () => strip.set({})), el('span', 'grow'), button('Back', back), use));
    listView.hidden = true;
    previewView.hidden = false;
    strip.reveal();
    use.focus();
  };

  const find = el('input', 'search');
  find.type = 'search';
  find.placeholder = 'Find a score';
  find.setAttribute('aria-label', 'Find a score');
  find.addEventListener('input', () => fill(find.value));
  fill('');
  listView.append(
    el('p', 'hint', 'They go at the end, in the order shown. Preview a score to add only part of it, or several parts.'),
    find, list, buttonRow(button('Cancel', closeOverlay), add),
  );
  d.append(listView, previewView);
  find.focus();
}
