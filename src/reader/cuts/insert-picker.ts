import { insertArchived, insertPages, type InsertAt } from '../../pieces/edits';
import { el } from '../../ui/dom';
import { openArchive } from './archive';
import type { Editing } from './host';
import { THUMB_W, thumbCanvas } from './thumbs';

/** Pick pages, a range of them or an archived cut to insert at `at`; the strip opens at `page`. */
export function openPicker(ed: Editing, at: InsertAt, title: string, page: number) {
  const { host, popups } = ed;
  const s = host.state();
  const d = popups.openDialog(title);
  const n = host.aspects.length;
  const pick: { a: number; b: number; next: 'a' | 'b'; archived?: string } = { a: page, b: page, next: 'a' };

  const strip = el('div', 'thumbs');
  const pageButtons: HTMLButtonElement[] = [];
  // Draw thumbnails one after another, nearest the selection first, so the ones you see come first.
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => Math.abs(x - page) - Math.abs(y - page));
  for (let p = 0; p < n; p++) {
    const b = el('button', 'thumb');
    b.type = 'button';
    b.setAttribute('aria-label', `Page ${p + 1}`);
    const ph = el('div', 'thumb-space');
    ph.style.height = THUMB_W * host.aspects[p] + 'px';
    b.append(ph, el('span', '', String(p + 1)));
    b.addEventListener('click', () => {
      pick.archived = undefined;
      // A range always runs in page order: a page before the first one picked starts it instead.
      if (pick.next === 'a') { pick.a = pick.b = p; pick.next = 'b'; } else { [pick.a, pick.b] = [Math.min(pick.a, p), Math.max(pick.a, p)]; pick.next = 'a'; }
      sync();
    });
    pageButtons.push(b);
    strip.append(b);
  }
  void (async () => {
    for (const p of order) {
      if (popups.dialog !== d) return;
      const c = thumbCanvas(ed, p);
      pageButtons[p].firstChild!.replaceWith(c);
      await host.thumb(p, THUMB_W).catch(() => {});
    }
  })();
  d.append(strip);

  const archivedButtons: [string, HTMLButtonElement][] = [];
  if (s.piece.archived.length) {
    d.append(el('h3', '', 'Archived cuts'));
    const row = el('div', 'thumbs');
    for (const c of s.piece.archived) {
      const b = el('button', 'thumb');
      b.type = 'button';
      b.setAttribute('aria-label', `Archived cut from page ${c.page + 1}`);
      b.append(thumbCanvas(ed, c.page, c.y0, c.y1), el('span', '', `p. ${c.page + 1}`));
      b.addEventListener('click', () => { pick.archived = c.id; sync(); });
      archivedButtons.push([c.id, b]);
      row.append(b);
    }
    d.append(row);
  }

  const copyLabel = el('label', 'check');
  const copy = el('input');
  copy.type = 'checkbox';
  copy.checked = true;
  copyLabel.append(copy, ' Copy markings');
  const hint = el('p', 'hint');
  const cancel = el('button', '', 'Cancel');
  const ok = el('button', 'primary', 'Insert');
  cancel.type = ok.type = 'button';
  cancel.addEventListener('click', () => popups.dismiss());
  ok.addEventListener('click', () => {
    popups.dismiss();
    const now = host.state();
    if (pick.archived) {
      host.commit(insertArchived(now, at, pick.archived), pick.archived);
      host.say('Brought back the archived cut.');
      return;
    }
    const r = insertPages(now, at, pick.a, pick.b, copy.checked, host.aspects);
    host.commit(r.state, r.first);
    host.say(pick.a === pick.b ? `Inserted page ${pick.a + 1}.` : `Inserted pages ${pick.a + 1}–${pick.b + 1}.`);
  });
  const buttons = el('div', 'buttons');
  if (s.piece.archived.length) {
    const manage = el('button', 'quiet', 'Delete archived cuts…');
    manage.type = 'button';
    manage.addEventListener('click', () => openArchive(ed));
    buttons.append(manage);
  }
  buttons.append(cancel, ok);
  d.append(copyLabel, hint, buttons);

  const sync = () => {
    const lo = Math.min(pick.a, pick.b), hi = Math.max(pick.a, pick.b);
    pageButtons.forEach((b, p) => b.setAttribute('aria-pressed', String(!pick.archived && p >= lo && p <= hi)));
    for (const [id, b] of archivedButtons) b.setAttribute('aria-pressed', String(pick.archived === id));
    copyLabel.hidden = !!pick.archived;
    hint.textContent = pick.archived
      ? 'The archived cut comes back with its markings.'
      : (lo === hi ? `Page ${lo + 1}` : `Pages ${lo + 1}–${hi + 1}`)
        + (pick.next === 'b' ? '. Tap another page to insert a range.' : '. Tap a page to start again.');
  };
  sync();
  pageButtons[page]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  ok.focus();
}
