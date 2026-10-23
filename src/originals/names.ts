// Names of PDF files and folders: a score's title from its file's name, the name an added PDF is
// kept under, what a file name can't be, and folder paths tidied. Pure.

/** A score's title: its file's name without ".pdf". */
export const titleOf = (name: string) => name.replace(/\.pdf$/i, '');

/** Whether a file's name says it is a PDF. */
export const isPdfName = (name: string) => /\.pdf$/i.test(name);

/** The name to keep an added PDF under: its own, with ".pdf" added if it hasn't one. */
export const importName = (name: string) => (isPdfName(name) ? name : name + '.pdf');

/** A name for a new file that no other has (`taken` is lower case): "Mass.pdf", then "Mass (2).pdf". */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  const base = titleOf(name);
  for (let n = 1; ; n++) {
    const next = n === 1 ? `${base}.pdf` : `${base} (${n}).pdf`;
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
