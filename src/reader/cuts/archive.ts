import { deleteArchived } from '../../pieces/edits';
import { el } from '../../ui/dom';
import { closeOverlay, showDialog } from '../../ui/overlay';
import type { EditorHost } from './host';
import { thumbCanvas } from './thumbs';

/** Archived cuts, to delete for good. */
export function openArchive(host: EditorHost) {
  const d = showDialog('Archived cuts');
  const list = el('ul', 'archive');
  const fill = () => {
    const s = host.state();
    list.replaceChildren();
    if (!s.piece.archived.length) list.append(el('li', 'empty', 'No archived cuts.'));
    for (const c of s.piece.archived) {
      const li = el('li');
      const n = s.ink[c.id]?.length ?? 0;
      const del = el('button', '', 'Delete for good');
      del.type = 'button';
      del.addEventListener('click', () => {
        host.commit(deleteArchived(host.state(), c.id));
        host.changed();
        fill();
      });
      li.append(thumbCanvas(host, d, c.page, c.y0, c.y1), el('span', '', `Page ${c.page + 1}, ${n} marking${n === 1 ? '' : 's'}`), del);
      list.append(li);
    }
  };
  fill();
  const close = el('button', 'primary', 'Done');
  close.type = 'button';
  close.addEventListener('click', () => closeOverlay());
  const buttons = el('div', 'buttons');
  buttons.append(close);
  d.append(el('p', 'hint', 'Cuts removed with markings on them are kept here. Insert one again from "Insert pages…", or delete it and its markings for good.'), list, buttons);
  close.focus();
}
