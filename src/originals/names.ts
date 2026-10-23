// Names of originals' files (PDFs and images) and folders: a score's title from its file's name, the
// name an added file is kept under, what a file name can't be, and folder paths tidied. Pure.

const IMAGE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
/** An original's file name ending: ".pdf", or an image's. */
const ENDING = /\.(pdf|jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/** A score's title: its file's name without ".pdf" (or its image ending). */
export const titleOf = (name: string) => name.replace(ENDING, '');

/** Whether a file's name says it is an image, read as a score of one page. */
export const isImageName = (name: string) => IMAGE.test(name);

/** Whether a file's name says it is an original: a PDF or an image. */
export const isOriginalName = (name: string) => ENDING.test(name);

/** Whether a file is an original, by its name or else its type. */
export const isOriginalFile = (f: File) => isOriginalName(f.name) || f.type === 'application/pdf' || f.type.startsWith('image/');

/** The ending of an original's file name (".pdf", ".jpg"), or "". */
export const endingOf = (name: string) => ENDING.exec(name)?.[0] ?? '';

/**
 * The name to keep an added file under: its own, with an ending added if it hasn't one (".pdf",
 * or for an image, one for its type).
 */
export function importName(name: string, type = ''): string {
  if (isOriginalName(name)) return name;
  const image = /^image\/(\w+)/.exec(type)?.[1];
  return name + (image ? '.' + (image === 'jpeg' ? 'jpg' : image) : '.pdf');
}

/** A name for a new file that no other has (`taken` is lower case): "Mass.pdf", then "Mass (2).pdf". */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  const base = titleOf(name), ending = endingOf(name) || '.pdf';
  for (let n = 1; ; n++) {
    const next = n === 1 ? `${base}${ending}` : `${base} (${n})${ending}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
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
