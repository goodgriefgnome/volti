// Dialogs about a score's file, from the library's score rows and a score's reader: renaming its
// PDF (or image), and moving it to a subfolder.

import { fileNameProblem, folderOf, pathInFolder, pathWithTitle, titleOf } from '../originals/path-utils';
import { NoAccess, type SourceFile } from '../originals/types';
import { askText } from '../ui/ask-text';
import { el } from '../ui/dom';

/** A score's file changed: it is `now` that original (renamed or moved), or it is `gone`. */
export type FileChange = { now: SourceFile } | { gone: string };

/** What the dialogs need from the screen that opens them. */
export interface ScoreFileHost {
  say(text: string): void;
  /** The file changed: show the change at once (the scores can be read again after). */
  changed(change: FileChange): void;
}

/** Rename a score's PDF. Its cuts, markings and setlists stay with it, as its contents don't change. */
export function renameFile(h: ScoreFileHost, o: SourceFile) {
  askText({
    title: `Rename “${titleOf(o.path)}”`,
    value: titleOf(o.path),
    label: 'File name',
    okLabel: 'Rename',
    below: [el('p', 'hint', `Renames “${o.path.slice(o.path.lastIndexOf('/') + 1)}”.`)],
    check: async (title) => {
      const why = fileNameProblem(title);
      if (why) return why;
      try {
        // From this tap, which the original's request for access to the scores folder needs.
        return await o.move(pathWithTitle(o.path, title));
      } catch (e) {
        if (e instanceof NoAccess) return 'Volti needs permission to change files in the scores folder to rename one.';
        console.error(e);
        return `Could not rename it (${(e as Error).name}). It may have been moved or renamed already.`;
      }
    },
    done: async (title) => {
      h.say(`Renamed to “${title.trim()}”.`);
      h.changed({ now: o });
    },
  });
}

/**
 * Move a score to a subfolder: one of `folders` (the library's subfolders), or a new one; None
 * takes it back to the top. Its file is moved there, making the folders that aren't there yet.
 */
export function moveToFolder(h: ScoreFileHost, o: SourceFile, folders: readonly string[]) {
  const file = o.path.slice(o.path.lastIndexOf('/') + 1);
  askText({
    title: `Move “${titleOf(o.path)}” to a folder`,
    value: folderOf(o.path),
    placeholder: 'For example, Masses/Latin',
    label: 'Folder',
    okLabel: 'Move',
    // The subfolders there are.
    choices: [...folders],
    below: [el('p', 'hint', `Moves “${file}” into that folder, making it if it isn’t there yet.`)],
    alt: { label: 'None', text: '' },
    check: async (folder) => {
      try {
        // From this tap, which the original's request for access to the scores folder needs.
        return await o.move(pathInFolder(o.path, folder));
      } catch (e) {
        if (e instanceof NoAccess) return 'Volti needs permission to change files in the scores folder to move one.';
        console.error(e);
        return `Could not move it (${(e as Error).name}). It may have been moved or renamed already.`;
      }
    },
    done: async () => {
      const to = folderOf(o.path);
      h.say(to ? `Moved “${titleOf(o.path)}” to ${to.split('/').join(' / ')}.` : `Moved “${titleOf(o.path)}” to the top of the list.`);
      h.changed({ now: o });
    },
  });
}
