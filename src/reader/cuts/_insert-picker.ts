// The dialog for inserting pages of the original, one or a range, into the played order.

import { insertPages, type InsertAt } from '../../scores/edits';
import { button, el } from '../../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../../ui/overlay';
import type { EditorHost } from './_host';
import { THUMB_W, thumbCanvas } from './_thumbs';

/** Pick original pages, one or a range, to insert at `at`; the strip opens at `page`. */
export function openPicker(host: EditorHost, at: InsertAt, title: string, page: number) {
  const d = showDialog(title);
  const n = host.aspects().length;
  const pick: { a: number; b: number; next: 'a' | 'b' } = { a: page, b: page, next: 'a' };

  const strip = el('div', 'thumbs');
  const pageButtons: HTMLButtonElement[] = [];
  // Draw thumbnails one after another, nearest the selection first, so the ones you see come first.
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => Math.abs(x - page) - Math.abs(y - page));
  for (let p = 0; p < n; p++) {
    const b = button('', () => {
      // A range always runs in page order: a page before the first one picked starts it instead.
      if (pick.next === 'a') { pick.a = pick.b = p; pick.next = 'b'; } else { [pick.a, pick.b] = [Math.min(pick.a, p), Math.max(pick.a, p)]; pick.next = 'a'; }
      sync();
    }, 'thumb');
    b.setAttribute('aria-label', `Original page ${p + 1}`);
    const ph = el('div', 'thumb-space');
    ph.style.height = THUMB_W * host.aspects()[p] + 'px';
    b.append(ph, el('span', '', String(p + 1)));
    pageButtons.push(b);
    strip.append(b);
  }
  void (async () => {
    for (const p of order) {
      if (!d.isConnected) return;
      const c = thumbCanvas(host, d, p);
      pageButtons[p].firstChild!.replaceWith(c);
      try { for await (const _ of host.thumbs(p, THUMB_W)) { /* drawn into its canvas by thumbCanvas */ } } catch { /* shown blank */ }
    }
  })();
  d.append(strip);

  const hint = el('p', 'hint');
  const ok = button('Insert', () => {
    closeOverlay();
    const r = insertPages(host.state(), at, pick.a, pick.b);
    host.commit(r.state, r.first);
    host.say(pick.a === pick.b ? `Inserted original page ${pick.a + 1}.` : `Inserted original pages ${pick.a + 1}–${pick.b + 1}.`);
  }, 'primary');
  d.append(hint, buttonRow(button('Cancel', closeOverlay), ok));

  const sync = () => {
    const lo = Math.min(pick.a, pick.b), hi = Math.max(pick.a, pick.b);
    pageButtons.forEach((b, p) => b.setAttribute('aria-pressed', String(p >= lo && p <= hi)));
    hint.textContent = (lo === hi ? `Original page ${lo + 1}` : `Original pages ${lo + 1}–${hi + 1}`)
      + (pick.next === 'b' ? '. Tap another to insert a range.' : '. Tap one to start again.');
  };
  sync();
  pageButtons[page]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  ok.focus();
}
