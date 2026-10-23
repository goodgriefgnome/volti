// Dialogs only the library's score rows open: renaming a score's PDF, and filing an added PDF
// under a subfolder.

import { allowWriting } from '../originals/folder';
import { fileAdded } from '../originals/imported';
import { fileNameProblem, tidyFolder } from '../originals/names';
import { renameOriginal, type Original } from '../originals/originals';
import { askText } from '../ui/ask-text';
import { el } from '../ui/dom';
import type { LibraryHost } from './host';

/** Rename a score's PDF. Its cuts, markings and setlists stay with it, as its contents don't change. */
export function renameFile(lib: LibraryHost, o: Original) {
  askText({
    title: `Rename “${o.title}”`,
    value: o.title,
    label: 'File name',
    okLabel: 'Rename',
    below: [el('p', 'hint', o.location === 'folder'
      ? `Renames “${o.path.slice(o.path.lastIndexOf('/') + 1)}” in the scores folder.`
      : 'Renames the copy kept in Volti.')],
    check: async (title) => {
      const why = fileNameProblem(title);
      if (why) return why;
      // Asked from this tap, which a request for access needs.
      if (o.location === 'folder' && !(await allowWriting())) return 'Volti needs permission to change files in the scores folder to rename one.';
      try {
        return await renameOriginal(o, title);
      } catch (e) {
        console.error(e);
        return `Could not rename it (${(e as Error).name}). It may have been moved or renamed already.`;
      }
    },
    done: async (title) => {
      lib.toast.say(`Renamed to “${title.trim()}”.`);
      await lib.refresh();
    },
  });
}

/** File an added PDF under a subfolder in the library: one of the folder's, or a new one; None takes it back to the top. */
export function moveAdded(lib: LibraryHost, o: Original) {
  askText({
    title: `Move “${o.title}” to a folder`,
    value: o.folder,
    placeholder: 'For example, Masses/Latin',
    label: 'Folder',
    okLabel: 'Move',
    // The subfolders there are.
    choices: [...new Set(lib.originals.map((x) => x.folder).filter(Boolean))].sort(),
    below: [el('p', 'hint', 'Volti lists it under that folder, beside the scores folder’s own PDFs there. The PDF itself stays where it is.')],
    alt: { label: 'None', text: '' },
    done: async (folder) => {
      await fileAdded(o, folder);
      lib.toast.say(tidyFolder(folder) ? `Moved “${o.title}” to ${tidyFolder(folder).split('/').join(' / ')}.` : `Moved “${o.title}” to the top of the list.`);
      await lib.refresh();
    },
  });
}
