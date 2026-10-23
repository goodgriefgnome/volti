// The dialog listing a score's archived cuts, to delete them for good.

import { deleteArchived } from '../../scores/edits';
import { button, el, plural } from '../../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../../ui/overlay';
import type { EditorHost } from './host';
import { thumbCanvas } from './thumbs';

/** Archived cuts, to delete for good. */
export function openArchive(host: EditorHost) {
  const d = showDialog('Archived cuts');
  const list = el('ul', 'archive');
  const fill = () => {
    const s = host.state();
    list.replaceChildren();
    if (!s.score.archived.length) list.append(el('li', 'empty', 'No archived cuts.'));
    for (const c of s.score.archived) {
      const li = el('li');
      const del = button('Delete for good', () => {
        host.commit(deleteArchived(host.state(), c.id));
        host.changed();
        fill();
      });
      li.append(thumbCanvas(host, d, c.page, c.y0, c.y1), el('span', '', `Original page ${c.page + 1}, ${plural(s.ink[c.id]?.length ?? 0, 'marking')}`), del);
      list.append(li);
    }
  };
  fill();
  const close = button('Done', closeOverlay, 'primary');
  d.append(el('p', 'hint', 'Cuts removed with markings on them are kept here. Insert one again from "Insert original pages…", or delete it and its markings for good.'), list, buttonRow(close));
  close.focus();
}
