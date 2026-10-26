// The screen for files coming into the library: from Add PDFs, shared from another app, or put back
// from Recently removed. Each file is a row: a preview of its pages as a new score starts, its
// name, its folder, and what happens to it (new; already in the library, so left out; or its path
// taken, so it needs a new name or folder, or to replace the file there). Adding puts each in the
// library's root; leaving one out, or cancelling, drops it.

import { askPassword, ThumbStrip } from '../dialogs';
import {
  arrivals, fileNameProblem, folderOf, NoAccess, pathInFolder, pathWithTitle, PasswordNotGiven, previewIncoming, putIncoming,
  readIncoming, subfolders, titleOf, type Arrival, type Incoming, type PageCache,
} from '../originals';
import { newScore } from '../scores';
import { button, buttonRow, closeOverlay, dpr, el, plural, showDialog, whenOverlayCloses } from '../ui';
import type { LibraryHost } from './host';

/** A file coming in, and where it goes to start with (its own name at the top, by default). */
export interface Arriving { file: File; path?: string }

/** A row: a file coming in, and the name and folder chosen for it. */
interface Row {
  incoming: Incoming;
  /** Its file name to start with, whose ending (".pdf", ".jpg") the name typed doesn't change. */
  base: string;
  title: HTMLInputElement;
  folder: HTMLInputElement;
  replace: HTMLInputElement;
  status: HTMLElement;
  li: HTMLElement;
  arrival: Arrival;
}

/** Each row's datalist of the library's subfolders shares this id. */
const FOLDERS_ID = 'incoming-folders';

/**
 * Open the screen for files coming in. `done` hears, once it closes, which were added (none when
 * it was cancelled).
 */
export async function openIncoming(lib: LibraryHost, files: readonly Arriving[], done?: (added: Arriving[]) => void) {
  const d = showDialog(files.length === 1 ? 'Add a file' : `Add ${files.length} files`, 'wide incoming');
  const reading = el('p', 'hint', 'Reading…');
  d.append(reading);
  const caches: PageCache[] = [];
  /** The files added so far. */
  const added: Arriving[] = [];
  let finished = false;
  whenOverlayCloses(() => {
    finished = true;
    for (const c of caches) c.destroy();
    done?.(added);
  });

  // Read once each, and the same file only once.
  const read: { arriving: Arriving; incoming: Incoming }[] = [];
  for (const arriving of files) {
    try {
      const incoming = await readIncoming(arriving.file);
      if (!read.some((r) => r.incoming.id === incoming.id)) read.push({ arriving, incoming });
    } catch (e) {
      console.error(e);
      lib.say(`Could not read “${arriving.file.name}”.`);
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
  const rows: Row[] = read.map(({ arriving, incoming }) => row(arriving, incoming));
  const by = new Map(rows.map((r, i) => [r, read[i].arriving]));

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

  function row(arriving: Arriving, incoming: Incoming): Row {
    const name = incoming.file.name, path = arriving.path ?? name;
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
    const r: Row = { incoming, base: path.slice(path.lastIndexOf('/') + 1), title, folder, replace, status, li, arrival: { kind: 'new' } };
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
    let cache: PageCache;
    try {
      cache = await previewIncoming({ id: r.incoming.id, path: pathOf(r) }, r.incoming.file, ask ? askPassword : undefined);
    } catch (e) {
      if (e instanceof PasswordNotGiven) {
        box.replaceChildren(button('Show: it has a password', () => void showPreview(r, box, true)));
        return;
      }
      console.error(e);
      box.replaceChildren(el('p', 'hint error', 'Volti can’t read this file.'));
      return;
    }
    if (finished) { cache.destroy(); return; }
    caches.push(cache);
    const aspects = await cache.allAspects();
    const state = { score: newScore(r.incoming.id, r.title.value, aspects), ink: {} };
    const strip = new ThumbStrip({ state, aspects, page: (p, w) => cache.render(p + 1, w, Math.round(w * aspects[p]), dpr()) });
    box.replaceChildren(strip.el);
  }

  /** Work out again what happens to each file, and say so. */
  function check() {
    const library = lib.originals.map((o) => ({ id: o.id, path: o.path }));
    const now = arrivals(rows.map((r) => ({ id: r.incoming.id, path: pathOf(r) })), library);
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
        why = await putIncoming(r.incoming, pathOf(r), a.kind === 'taken' ? a.by : undefined);
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
      added.push(by.get(r)!);
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
