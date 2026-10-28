// The "Export PDF" dialog, from the library's menus and the reader's toolbar: naming the file,
// exporting a score, an excerpt or a setlist, and writing it into the scores folder's Exports
// folder, or sharing it when no folder is linked.

import { drawnOriginals, exportPdf, type ExportPart } from '../export/pdf';
import { exportExists, EXPORTS, saveExport } from '../originals/device-score-fs';
import { fileNameProblem, titleOf } from '../originals/path-utils';
import { NoAccess } from '../originals/types';
import { button, el, focusHighlighted } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { askPassword } from './passwords';

export interface _ExportHost {
  /** What is exported, and the file's first name (characters a file name can't have become dashes). */
  title: string;
  parts: ExportPart[];
  /** Titles of scores left out because their originals are missing. */
  missing: string[];
  /** Write into the linked folder; otherwise share the file. */
  toFolder: boolean;
  /** The file was written into the folder, as `name`.pdf. */
  saved(name: string): void;
}

/** Said when access to write in the scores folder isn't allowed. */
const NO_ACCESS = 'Volti needs permission to write in the scores folder to export there.';

/** Ask for a file name, then export. */
export function openExportPdf(h: _ExportHost) {
  const d = showDialog(`Export “${h.title}” as PDF`);
  const input = el('input', 'name');
  input.type = 'text';
  input.value = h.title.replace(/[\\/:*?"<>|]/g, '-');
  input.setAttribute('aria-label', 'File name');
  const where = el('p', 'hint', h.toFolder
    ? `It reads as the score does with 1 page on the screen, and goes in the ${EXPORTS} folder in the scores folder.`
    : 'It reads as the score does with 1 page on the screen. Share it to save or send it.');
  const left = h.missing.length ? el('p', 'hint', `Left out, as ${h.missing.length === 1 ? 'it is' : 'they are'} missing: ${h.missing.map((t) => `“${t}”`).join(', ')}.`) : null;
  const quality = el('p', 'hint', 'Checking quality…');
  quality.setAttribute('aria-live', 'polite');
  void drawnOriginals(h.parts.map((p) => p.original)).then((drawn) => {
    const titles = (why: string) => drawn.filter((d) => d.why === why).map((d) => `“${titleOf(d.original.path)}”`).join(', ');
    const enc = titles('encryption'), bad = titles('unreadable');
    quality.textContent = !drawn.length ? 'Original quality.'
      : [enc && `Rasterized (unsupported encryption): ${enc}.`, bad && `Rasterized (could not be read as it is): ${bad}.`].filter(Boolean).join(' ');
  }, (e) => { console.error(e); quality.textContent = ''; });
  const error = el('p', 'hint error');
  error.setAttribute('aria-live', 'polite');
  const go = button('Export', () => void ok(), 'primary');
  const cancel = button('Cancel', closeOverlay);
  // A name already used in the folder is replaced on the second tap.
  let replace = '';
  input.addEventListener('input', () => { replace = ''; go.textContent = 'Export'; error.textContent = ''; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void ok(); });

  const ok = async () => {
    const name = input.value.trim(), why = fileNameProblem(name);
    if (why) { error.textContent = why; return; }
    // Asked from this tap, which a request for access to the scores folder needs.
    const exists = h.toFolder && replace !== name && (await exportExists(name).catch((e) => {
      if (e instanceof NoAccess) return null;
      throw e;
    }));
    if (exists === null) { error.textContent = NO_ACCESS; return; }
    if (exists) {
      replace = name;
      go.textContent = 'Replace';
      error.textContent = `There is already “${name}.pdf” in ${EXPORTS}. Tap Replace to write over it.`;
      return;
    }
    error.textContent = '';
    go.disabled = input.disabled = true;
    go.textContent = 'Exporting…';
    let bytes: Uint8Array;
    try {
      bytes = await exportPdf(h.parts, name, askPassword, (done, of) => { if (of > 1) go.textContent = `Exporting ${done} of ${of}…`; });
    } catch (e) {
      console.error(e);
      error.textContent = 'Could not export it. A score may have been moved or renamed.';
      go.disabled = input.disabled = false;
      go.textContent = 'Export';
      return;
    }
    if (!d.isConnected) return;
    const file = new File([bytes as BlobPart], name + '.pdf', { type: 'application/pdf' });
    if (h.toFolder) {
      try {
        await saveExport(name, file);
      } catch (e) {
        if (!(e instanceof NoAccess)) console.error(e);
        error.textContent = e instanceof NoAccess ? NO_ACCESS : `Could not write it into ${EXPORTS}.`;
        go.disabled = input.disabled = false;
        go.textContent = 'Export';
        return;
      }
      closeOverlay();
      h.saved(name);
      return;
    }
    // Sharing needs a fresh tap: making the PDF may take longer than a tap is good for.
    ready(file);
  };

  const ready = (file: File) => {
    const done = el('p', '', `“${file.name}” is ready.`);
    // Where the browser can't share files, it downloads it instead.
    const share = navigator.canShare?.({ files: [file] })
      ? button('Share', () => void navigator.share({ files: [file], title: file.name }).then(closeOverlay, (e: DOMException) => { if (e.name !== 'AbortError') error.textContent = 'Could not share it.'; }), 'primary')
      : button('Download', () => {
        const url = URL.createObjectURL(file);
        Object.assign(el('a'), { href: url, download: file.name }).click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        closeOverlay();
      }, 'primary');
    d.replaceChildren(d.querySelector('h2')!, done, error, buttonRow(button('Close', closeOverlay), share));
    share.focus();
  };

  d.append(input, where, quality, ...(left ? [left] : []), error, buttonRow(cancel, go));
  focusHighlighted(input);
}
