// The screen for files coming into the library: from Add PDFs, shared from another app, put back
// from Recently removed, or left in Volti's own folder when a folder is linked. Each file is a row: a preview of its pages as a new score starts, its
// name, its folder, and what happens to it (new; already in the library, so left out; or its path
// taken, so it needs a new name or folder, or to replace the file there). Adding puts each in the
// library's root; leaving one out, or cancelling, drops it.

import { askPassword } from '../dialogs/passwords';
import { ThumbStrip } from '../dialogs/thumb-strip';
import { arrivals, fileNameProblem, folderOf, pathInFolder, pathWithTitle, subfolders, titleOf, type Arrival } from '../originals/path-utils';
import { NoAccess, PasswordNotGiven, type Original, type SourceFile } from '../originals/types';
import { readIncoming } from '../originals/misc-files';
import { newScore } from '../scores/model';
import { button, dpr, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
import type { LibraryHost } from './_host';

/** A file coming in, and where it goes to start with (its own name at the top, by default); or one already read. */
export type Arriving = { file: File; path?: string } | SourceFile;

/** A row: a file coming in, and the name and folder chosen for it. */
interface Row {
  source: SourceFile;
  /** Its file name to start with, whose ending (".pdf", ".jpg") the name typed doesn't change. */
  base: string;
  title: HTMLInputElement;
  folder: HTMLInputElement;
  replace: HTMLInputElement;
  status: HTMLElement;
  li: HTMLElement;
  arrival: Arrival<SourceFile>;
}

/** Each row's datalist of the library's subfolders shares this id. */
const FOLDERS_ID = 'incoming-folders';

/**
 * Open the screen for files coming in. `done` hears, once it closes, which were added (none when
 * it was cancelled).
 */
export async function openIncoming(lib: LibraryHost, files: readonly Arriving[], done?: (added: SourceFile[]) => void) {
  const d = showDialog(files.length === 1 ? 'Add a file' : `Add ${files.length} files`, 'wide incoming');
  const reading = el('p', 'hint', 'Reading…');
  d.append(reading);
  /** The files added so far. */
  const added: SourceFile[] = [];
  let finished = false;
  whenOverlayCloses(() => {
    finished = true;
    done?.(added);
  });

  // Read once each, and the same file only once.
  const read: SourceFile[] = [];
  for (const a of files) {
    try {
      const source = 'read' in a ? a : await readIncoming(a.file, a.path);
      if (!read.some((r) => r.id === source.id)) read.push(source);
    } catch (e) {
      console.error(e);
      lib.say(`Could not read “${'read' in a ? a.path : a.file.name}”.`);
    }
  }
  if (!d.isConnected) return;

  const folders = el('datalist');
  folders.id = FOLDERS_ID;
  for (const f of subfolders(lib.originals)) folders.append(Object.assign(el('option'), { value: f }));
  const list = el('ul', 'incoming-list');
  const error = el('p', 'hint error');
  error.setAttribute('aria-live', 'polite');
  const add = button('Add', () => void addAll(), 'primary');
  const rows: Row[] = read.map(row);

  // One folder for every row at once.
  const allFolder = folderField('Folder for every file');
  const setAll = button('Put all there', () => { for (const r of rows) r.folder.value = allFolder.value; check(); });
  const all = el('div', 'incoming-all');
  all.append(allFolder, setAll);

  reading.remove();
  d.append(folders, ...(rows.length > 1 ? [all] : []), list, error, buttonRow(button('Cancel', closeOverlay), add));
  check();

  function folderField(label: string): HTMLInputElement {
    const f = el('input', 'name folder');
    f.type = 'text';
    f.placeholder = 'Top of the library';
    f.setAttribute('list', FOLDERS_ID);
    f.setAttribute('aria-label', label);
    return f;
  }

  function row(source: SourceFile): Row {
    const path = source.path;
    const li = el('li', 'incoming-row');
    const title = el('input', 'name');
    title.type = 'text';
    title.value = titleOf(path);
    title.setAttribute('aria-label', 'File name');
    const folder = folderField('Folder');
    folder.value = folderOf(path);
    const replace = el('input');
    replace.type = 'checkbox';
    const status = el('p', 'hint');
    status.setAttribute('aria-live', 'polite');
    const leave = button('Leave out', () => { li.remove(); rows.splice(rows.indexOf(r), 1); check(); }, 'quiet');
    const preview = el('div', 'incoming-preview');
    const fields = el('div', 'incoming-fields');
    const replaceLabel = el('label', 'check replace');
    replaceLabel.append(replace, el('span', '', 'Replace it (it goes to Recently removed)'));
    fields.append(title, folder, status, replaceLabel, leave);
    li.append(preview, fields);
    list.append(li);
    for (const f of [title, folder]) f.addEventListener('input', check);
    replace.addEventListener('change', check);
    const r: Row = { source, base: path.slice(path.lastIndexOf('/') + 1), title, folder, replace, status, li, arrival: { kind: 'new' } };
    void showPreview(r, preview);
    return r;
  }

  /** Where a row's file goes, as its name and folder say now. */
  function pathOf(r: Row): string {
    return pathInFolder(pathWithTitle(r.base, r.title.value), r.folder.value);
  }

  /** The row's pages, as a new score starts: a locked PDF shows a button that asks its password. */
  async function showPreview(r: Row, box: HTMLElement, ask = false) {
    box.replaceChildren(el('p', 'hint', 'Opening…'));
    let original: Original;
    try {
      original = await r.source.read(ask ? askPassword : undefined);
    } catch (e) {
      if (e instanceof PasswordNotGiven) {
        box.replaceChildren(button('Show: it has a password', () => void showPreview(r, box, true)));
        return;
      }
      console.error(e);
      box.replaceChildren(el('p', 'hint error', 'Volti can’t read this file.'));
      return;
    }
    if (finished) return;
    const aspects = await original.aspects();
    const state = { score: newScore(r.source.id, aspects), ink: {} };
    const strip = new ThumbStrip({ state, aspects, page: async (p, w) => (await original.draw(p + 1, Math.round(w * dpr()))).canvas });
    box.replaceChildren(strip.el);
  }

  /** Work out again what happens to each file, and say so. */
  function check() {
    const now = arrivals(rows.map((r) => ({ id: r.source.id, path: pathOf(r) })), lib.originals);
    let ready = 0, blocked = false;
    rows.forEach((r, i) => {
      const a = r.arrival = now[i];
      const why = fileNameProblem(r.title.value);
      r.replace.parentElement!.hidden = !(a.kind === 'taken' && a.by);
      r.li.classList.toggle('have', a.kind === 'have');
      r.status.classList.toggle('error', !!why || (a.kind === 'taken' && !r.replace.checked));
      if (why) { r.status.textContent = why; blocked = true; return; }
      const name = pathOf(r).slice(pathOf(r).lastIndexOf('/') + 1);
      if (a.kind === 'have') r.status.textContent = `Already in the library, as “${shown(a.path)}”: left out.`;
      else if (a.kind === 'taken' && !a.by) { r.status.textContent = `Another file coming in is called “${name}” there: change its name or folder.`; blocked = true; }
      else if (a.kind === 'taken' && !r.replace.checked) { r.status.textContent = `There is another file called “${name}” there: change its name or folder, or replace it.`; blocked = true; }
      else { r.status.textContent = a.kind === 'taken' ? `Replaces “${name}”.` : 'New.'; ready++; }
    });
    // With nothing new, Done drops them all.
    add.disabled = blocked;
    add.textContent = ready ? `Add ${plural(ready, 'file')}` : blocked ? 'Add' : 'Done';
  }

  async function addAll() {
    error.textContent = '';
    add.disabled = true;
    for (const r of [...rows]) {
      const a = r.arrival;
      if (a.kind === 'have') continue;
      let why: string | null;
      try {
        // From this tap, which asking for access to the scores folder needs.
        // A file replaced goes to Recently removed first.
        if (a.kind === 'taken' && a.by) await a.by.remove();
        why = await r.source.move(pathOf(r));
      } catch (e) {
        if (!(e instanceof NoAccess)) console.error(e);
        why = e instanceof NoAccess ? 'Volti needs permission to write in the scores folder to add files.' : `Could not add it (${(e as Error).name}).`;
      }
      if (why) {
        // Those added so far are in; this one and the rest stay, to try again.
        r.status.textContent = why;
        r.status.classList.add('error');
        error.textContent = why;
        if (added.length) void lib.refresh();
        add.disabled = false;
        return;
      }
      added.push(r.source);
      r.li.remove();
      rows.splice(rows.indexOf(r), 1);
    }
    closeOverlay();
    lib.say(added.length ? `Added ${plural(added.length, 'file')}.` : 'They are all in the library already.');
    await lib.refresh();
  }
}

/** A path as the user reads it. */
const shown = (path: string) => path.split('/').join(' / ');
