// The menu under the reader's title: what can be read, listed next to what is read, and (from
// the next stage) the controls that change that list.

import { ends, sameExcerpt, sortedExcerpts } from '../scores/excerpts';
import { button, el } from '../ui/dom';
import { closeOverlay, showMenu } from '../ui/overlay';
import type { MenusHost } from './_toolbar-menus';

/** One row of the title menu. */
export interface TitleRow { label: string; current: boolean; go(): void }

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
    return reading.items.map((it, k) => ({ label: `${k + 1}. ${it.title}${itemSuffix(h, k)}`, current: k === h.k(), go: () => h.goTo(k) }));
  }
  const rows: TitleRow[] = [{ label: 'Whole score', current: reading.what.kind === 'score', go: () => h.readWhole() }];
  const cur = h.open(h.k());
  if (!cur) return rows;
  const score = cur.state.score, read = reading.what.kind === 'excerpt' ? reading.what.excerpt : undefined;
  for (const x of sortedExcerpts(score)) {
    rows.push({ label: x.name, current: !!read && sameExcerpt(score.cuts, x, read), go: () => h.playExcerpt(ends(x)) });
  }
  return rows;
}

/** Show the title menu below the title. */
export function showTitleMenu(h: MenusHost) {
  const { reading } = h;
  const heading = reading.setlist?.title ?? reading.items[0].title;
  const rows = _titleRows(h).map((row) => {
    const li = el('div', 'title-row');
    const go = button(row.label, () => { closeOverlay(); row.go(); }, 'go');
    go.setAttribute('role', 'menuitem');
    if (row.current) { li.classList.add('current'); li.setAttribute('aria-current', 'true'); }
    li.append(go);
    return li;
  });
  showMenu(h.toolbar.anchor('title'), heading, rows);
}
