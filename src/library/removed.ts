// Recently removed, from the library's ⋯ menu: the files removed in the last week, the latest
// first, each with where it was and when, and a button that puts it back there.

import { folderOf, NoAccess, recentlyRemoved, restoreRemoved, titleOf, type Removed } from '../originals';
import { button, buttonRow, closeOverlay, el, showDialog } from '../ui';
import type { LibraryHost } from './host';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a file was removed, as people say it: "today", "yesterday", "3 days ago". */
const removedWhen = (at: number, now = Date.now()) => {
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

export async function openRecentlyRemoved(lib: LibraryHost) {
  const removed = await recentlyRemoved();
  const d = showDialog('Recently removed');
  const hint = el('p', 'hint', removed.length
    ? 'Removed files are kept here for a week, then deleted for good. Their cuts, markings and excerpts stay.'
    : 'Nothing has been removed in the last week.');
  const error = el('p', 'hint error');
  error.setAttribute('aria-live', 'polite');
  const list = el('ul', 'removed-list');
  for (const r of removed) list.append(row(r));
  d.append(hint, ...(removed.length ? [list] : []), error, buttonRow(button('Close', closeOverlay, 'primary')));

  function row(r: Removed): HTMLElement {
    const li = el('li', 'removed-row');
    const text = el('span', 'pick-text');
    const folder = folderOf(r.path);
    text.append(el('span', 'name', titleOf(r.path)), el('span', 'meta', `${folder ? folder.split('/').join(' / ') + ' · ' : ''}removed ${removedWhen(r.at)}`));
    const restore = button('Put back', () => void putBack(), 'quiet');
    restore.setAttribute('aria-label', `Put back “${titleOf(r.path)}”`);
    li.append(text, restore);
    const putBack = async () => {
      restore.disabled = true;
      error.textContent = '';
      let why: string | null;
      try {
        // From this tap, which asking for access to the scores folder needs.
        why = await restoreRemoved(r);
      } catch (e) {
        if (!(e instanceof NoAccess)) console.error(e);
        why = e instanceof NoAccess ? 'Volti needs permission to change files in the scores folder to put one back.' : `Could not put it back (${(e as Error).name}).`;
      }
      if (why) { error.textContent = why; restore.disabled = false; return; }
      li.remove();
      lib.say(`Put back “${titleOf(r.path)}”.`);
      void lib.refresh();
      if (!list.childElementCount) closeOverlay();
    };
    return li;
  }
}
