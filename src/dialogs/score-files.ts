// Dialogs about a score's file, from the library's score rows and a score's reader: renaming its
// PDF (or image), and filing an added one under a subfolder.

import { allowWriting } from '../originals/folder';
import { fileAdded } from '../originals/imported';
import { fileNameProblem, tidyFolder } from '../originals/names';
import { renameOriginal, type Original } from '../originals/originals';
import { askText } from '../ui/ask-text';
import { el } from '../ui/dom';

/** What the dialogs need from the screen that opens them. */
export interface ScoreFileHost {
  say(text: string): void;
  /** The file changed: read the scores again, or show the change. `renamed` is its new title, when renamed. */
  changed(renamed?: string): void | Promise<void>;
}

/** Rename a score's PDF. Its cuts, markings and setlists stay with it, as its contents don't change. */
export function renameFile(h: ScoreFileHost, o: Original) {
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
      h.say(`Renamed to “${title.trim()}”.`);
      await h.changed(title.trim());
    },
  });
}

/**
 * File an added PDF under a subfolder in the library: one of `folders` (the library's subfolders),
 * or a new one; None takes it back to the top.
 */
export function moveAdded(h: ScoreFileHost, o: Original, folders: readonly string[]) {
  askText({
    title: `Move “${o.title}” to a folder`,
    value: o.folder,
    placeholder: 'For example, Masses/Latin',
    label: 'Folder',
    okLabel: 'Move',
    // The subfolders there are.
    choices: [...folders],
    below: [el('p', 'hint', 'Volti lists it under that folder, beside the scores folder’s own PDFs there. The PDF itself stays where it is.')],
    alt: { label: 'None', text: '' },
    done: async (folder) => {
      await fileAdded(o, folder);
      h.say(tidyFolder(folder) ? `Moved “${o.title}” to ${tidyFolder(folder).split('/').join(' / ')}.` : `Moved “${o.title}” to the top of the list.`);
      await h.changed();
    },
  });
}
