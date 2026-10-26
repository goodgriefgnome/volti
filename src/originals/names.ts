// Names of originals' files (PDFs and images) and folders: a score's title and folder from its
// file's path, the paths a rename or a move gives, the name a file coming in is kept under, what a
// file name can't be, folders as the user reads them, and folder paths tidied. A name says which files are scores, never how one is
// read: that is what its contents say. Pure.

/** An original's file name ending: ".pdf", or an image's. */
const ENDING = /\.(pdf|jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/** The file name at the end of a path ("Masses/Mass in G.pdf" → "Mass in G.pdf"). */
export const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A score's title: its file's name without ".pdf" (or its image ending), whatever folder it is in. */
export const titleOf = (path: string) => nameOf(path).replace(ENDING, '');

/** The folder a path is in ("Masses/Latin/Mass.pdf" → "Masses/Latin"), '' at the top. */
export const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** The path an original at `path` has once renamed to `title`: in the same folder, with the same ending. */
export const pathWithTitle = (path: string, title: string) => joinPath(folderOf(path), title.trim() + (endingOf(nameOf(path)) || '.pdf'));

/** The path an original at `path` has once moved into `folder` ('' for the top), with the same name. */
export const pathInFolder = (path: string, folder: string) => joinPath(tidyFolder(folder), nameOf(path));

const joinPath = (folder: string, name: string) => (folder ? folder + '/' : '') + name;

/** A path tidied: its folders' names trimmed, empty ones dropped. */
export const tidyPath = (path: string) => joinPath(tidyFolder(folderOf(path)), nameOf(path));

/** Whether a file's name says it is an original: a PDF or an image. */
export const isOriginalName = (name: string) => ENDING.test(name);

/** Why a file can't be moved to `path`, as Volti wouldn't find it there; null when it can. */
export const unfoundName = (path: string) =>
  isOriginalName(path) ? null : `“${nameOf(path)}” doesn’t end in .pdf or an image’s ending, so Volti wouldn’t find it.`;

/** A folder as the user reads it, for saying where a file is: "Masses / Latin", or the top. */
export const shownFolder = (folder: string) => (folder ? folder.split('/').join(' / ') : 'the top of the library');

/** The ending of an original's file name (".pdf", ".jpg"), or "". */
export const endingOf = (name: string) => ENDING.exec(name)?.[0] ?? '';

/**
 * The name to keep a file coming in under: its own, with an ending added if it hasn't one (".pdf",
 * or for an image, one for its type).
 */
export function importName(name: string, type = ''): string {
  if (isOriginalName(name)) return name;
  const image = /^image\/(\w+)/.exec(type)?.[1];
  return name + (image ? '.' + (image === 'jpeg' ? 'jpg' : image) : '.pdf');
}

/** Why `title` can't be a file name, or null if it can. */
export function fileNameProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return 'Type a name.';
  if (/[\\/:*?"<>|]/.test(t)) return 'A file name can\'t have any of \\ / : * ? " < > |';
  if (t.startsWith('.')) return 'A file name can\'t start with a dot.';
  return null;
}

/** A folder path tidied: parts trimmed, empty ones dropped, joined with "/". */
export const tidyFolder = (path: string) => path.split('/').map((p) => p.trim()).filter(Boolean).join('/');
