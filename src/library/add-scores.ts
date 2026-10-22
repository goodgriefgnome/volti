// The "Add scores" dialog: picking scores to add to the end of a setlist. "New setlist" and a
// setlist's ⋯ › Add scores both open it.

import type { Original } from '../originals/originals';
import { newEntry, type Entry, type Setlist } from '../setlists/model';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';

export interface AddScoresHost {
  setlist: Setlist;
  /** The library's scores, in the order shown. */
  originals: readonly Original[];
  /** Add these entries to the end of the setlist. */
  add(entries: Entry[]): void;
}

/** Scores as checkboxes; the ticked ones go at the end, in library order, each played whole. */
export function openAddScores(h: AddScoresHost) {
  const s = h.setlist;
  const chosen = new Set<string>();
  const d = showDialog(`Add scores to “${s.title}”`);
  const list = el('div', 'picklist');
  const add = button('Add', () => {
    closeOverlay();
    h.add(h.originals.map((x) => x.id).filter((x) => chosen.has(x)).map(newEntry));
  }, 'primary');
  add.disabled = true;
  const fill = (q: string) => {
    list.replaceChildren();
    const shown = h.originals.filter((x) => `${x.title} ${x.folder}`.toLowerCase().includes(q.trim().toLowerCase()));
    if (!shown.length) list.append(el('p', 'empty', h.originals.length ? `Nothing matches “${q}”.` : 'No scores yet.'));
    for (const sc of shown) {
      const label = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = chosen.has(sc.id);
      box.addEventListener('change', () => {
        if (box.checked) chosen.add(sc.id); else chosen.delete(sc.id);
        add.disabled = !chosen.size;
        add.textContent = chosen.size ? `Add ${plural(chosen.size, 'score')}` : 'Add';
      });
      const has = s.entries.some((e) => e.scoreId === sc.id);
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
