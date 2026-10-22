// The "Add scores" dialog: picking scores to add to the end of a setlist, each whole or as an
// excerpt chosen in its preview. "New setlist" and a setlist's ⋯ › Add scores both open it.

import type { Original } from '../originals/originals';
import type { State } from '../scores/model';
import { newId, spanLabel, type Entry, type Setlist, type Span } from '../setlists/model';
import { button, el, plural } from '../ui/dom';
import { ExcerptStrip } from '../ui/excerpt-picker';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
import type { LibraryScore } from './open-score';

export interface AddScoresHost {
  setlist: Setlist;
  /** The library's scores, in the order shown. */
  originals: readonly Original[];
  /** Open a score to preview; null if it can't be (having said why). */
  open(o: Original): Promise<LibraryScore | null>;
  /** Add these entries to the end of the setlist; `scores` are the ones they choose excerpts of. */
  add(entries: Entry[], scores: State[]): void;
}

/** What is chosen of one score: the whole of it, or an excerpt chosen in its preview. */
interface Choice { span: Span; label: string | null; state?: State }

/**
 * Scores as checkboxes; the ticked ones go at the end, in library order. Preview shows a score's
 * pages, to choose an excerpt of it instead of the whole score.
 */
export function openAddScores(h: AddScoresHost) {
  const s = h.setlist;
  const chosen = new Map<string, Choice>();
  const d = showDialog(`Add scores to “${s.title}”`);
  const heading = d.querySelector('h2')!;
  const listView = el('div', 'view');
  const list = el('div', 'picklist');
  const add = button('Add', () => {
    closeOverlay();
    const picked = h.originals.filter((o) => chosen.has(o.id)).map((o) => [o.id, chosen.get(o.id)!] as const);
    h.add(
      picked.map(([scoreId, c]) => ({ id: newId(), scoreId, ...c.span })),
      picked.flatMap(([, c]) => (c.state ? [c.state] : [])),
    );
  }, 'primary');
  const sync = () => {
    add.disabled = !chosen.size;
    add.textContent = chosen.size ? `Add ${plural(chosen.size, 'score')}` : 'Add';
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
    box.checked = chosen.has(sc.id);
    box.addEventListener('change', () => {
      if (box.checked) chosen.set(sc.id, { span: {}, label: null }); else chosen.delete(sc.id);
      sync();
      r.replaceWith(row(sc));
    });
    const c = chosen.get(sc.id);
    const has = s.entries.some((e) => e.scoreId === sc.id);
    label.append(box, el('span', '', sc.title));
    if (c?.label) label.append(el('span', 'pill', c.label));
    label.append(el('span', 'meta', has ? 'already in this setlist' : sc.folder));
    const preview = button('Preview', () => void showPreview(sc), 'quiet');
    preview.setAttribute('aria-label', `Preview ${sc.title}`);
    r.append(label, preview);
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
    const strip = new ExcerptStrip(sc, chosen.get(o.id)?.span ?? {});
    const use = button('Use this excerpt', () => {
      const span = strip.span, cuts = sc.state.score.cuts;
      chosen.set(o.id, { span, label: spanLabel(cuts, span), state: sc.state });
      sync();
      back();
    }, 'primary');
    heading.textContent = o.title;
    previewView.replaceChildren(strip.el, strip.hint, buttonRow(button('Whole score', () => strip.set({})), el('span', 'grow'), button('Back', back), use));
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
    el('p', 'hint', 'They go at the end, in the order shown. Preview a score to play only part of it.'),
    find, list, buttonRow(button('Cancel', closeOverlay), add),
  );
  d.append(listView, previewView);
  find.focus();
}
