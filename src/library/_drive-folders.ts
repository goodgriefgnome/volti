// The folder picker for linking a Google Drive folder, from the library: My Drive's folders by
// name, opening one to see its folders, and "Use this folder". Lists through the Drive API; no
// Google Picker, so Volti loads no script from Google.

import { driveFolders } from '../originals/drive/score-fs';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
import { failed } from '../ui/failure';

interface Place { id: string; name: string }

/** Pick a folder in Google Drive, from My Drive down; null when cancelled. */
export function pickDriveFolder(): Promise<Place | null> {
  return new Promise((resolve) => {
    const d = showDialog('Pick the scores folder', 'drive-folders');
    let picked: Place | null = null;
    whenOverlayCloses(() => resolve(picked));
    /** My Drive, then each folder opened, the last being where we are. */
    const trail: Place[] = [{ id: 'root', name: 'My Drive' }];
    const crumbs = el('div', 'drive-crumbs');
    const list = el('ul', 'removed-list');
    const note = el('p', 'hint');
    note.setAttribute('aria-live', 'polite');
    const use = button('Use this folder', () => { picked = trail.at(-1)!; closeOverlay(); }, 'primary');
    d.append(crumbs, note, list, buttonRow(button('Cancel', closeOverlay), use));
    /** Taps are ignored for lists that are out of date. */
    let showing = 0;

    async function show() {
      const mine = ++showing;
      const here = trail.at(-1)!;
      crumbs.replaceChildren(...trail.flatMap((p, i) => [
        ...(i ? [el('span', 'meta', '›')] : []),
        button(p.name, () => { trail.length = i + 1; void show(); }, 'quiet'),
      ]));
      list.replaceChildren();
      note.textContent = 'Loading…';
      use.disabled = true;
      let folders: Place[];
      try {
        folders = await driveFolders(here.id);
      } catch (e) {
        if (mine !== showing) return;
        note.textContent = failed('list the folders', e);
        return;
      }
      if (mine !== showing) return;
      note.textContent = folders.length ? '' : 'No folders here.';
      use.disabled = false;
      for (const f of folders) {
        const li = el('li', 'removed-row');
        li.append(button(f.name, () => { trail.push(f); void show(); }, 'quiet'));
        list.append(li);
      }
    }
    void show();
  });
}
