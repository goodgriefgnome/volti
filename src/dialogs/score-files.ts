// Dialogs about a score's file, from the library's score rows and a score's reader: renaming its
// PDF (or image), and moving it to a subfolder (an added one is only listed there).

import { allowWriting, fileAdded, fileNameProblem, movedOriginal, moveOriginal, renamedOriginal, renameOriginal, tidyFolder, type Original } from '../originals';
import { askText, el } from '../ui';

/** A score's file changed: it is `now` that original (renamed or moved), or it is `gone`. */
export type FileChange = { now: Original } | { gone: string };

/** What the dialogs need from the screen that opens them. */
export interface ScoreFileHost {
  say(text: string): void;
  /** The file changed: show the change at once (the scores can be read again after). */
  changed(change: FileChange): void;
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
      h.changed({ now: renamedOriginal(o, title) });
    },
  });
}

/**
 * Move a score to a subfolder: one of `folders` (the library's subfolders), or a new one; None
 * takes it back to the top. An added score is only listed there (the PDF stays in Volti); a score
 * from the scores folder has its file moved there, making the folders that aren't there yet.
 */
export function moveToFolder(h: ScoreFileHost, o: Original, folders: readonly string[]) {
  const file = o.path.slice(o.path.lastIndexOf('/') + 1);
  askText({
    title: `Move “${o.title}” to a folder`,
    value: o.folder,
    placeholder: 'For example, Masses/Latin',
    label: 'Folder',
    okLabel: 'Move',
    // The subfolders there are.
    choices: [...folders],
    below: [el('p', 'hint', o.location === 'folder'
      ? `Moves “${file}” into that folder in the scores folder, making it if it isn’t there yet.`
      : 'Volti lists it under that folder, beside the scores folder’s own PDFs there. The PDF itself stays where it is.')],
    alt: { label: 'None', text: '' },
    check: o.location === 'folder' ? async (folder) => {
      // Asked from this tap, which a request for access needs.
      if (!(await allowWriting())) return 'Volti needs permission to change files in the scores folder to move one.';
      try {
        return await moveOriginal(o, tidyFolder(folder));
      } catch (e) {
        console.error(e);
        return `Could not move it (${(e as Error).name}). It may have been moved or renamed already.`;
      }
    } : undefined,
    done: async (folder) => {
      const to = tidyFolder(folder);
      if (o.location === 'imported') await fileAdded(o, to);
      h.say(to ? `Moved “${o.title}” to ${to.split('/').join(' / ')}.` : `Moved “${o.title}” to the top of the list.`);
      h.changed({ now: o.location === 'folder' ? movedOriginal(o, to) : { ...o, folder: to } });
    },
  });
}
