import { openReader } from '../reader/reader';
import {
  allScores, canLinkFolder, folderState, importFiles, linkFolder, removeImported, unlinkFolder, unlockFolder,
  type FolderState, type Score,
} from '../sources/scores';
import type { Prefs } from '../storage/prefs';
import { button, el } from '../ui/dom';

/** The Library screen: the scores folder, imported scores, and the list to open them from. */
export class Library {
  private folder: FolderState = { kind: 'none' };
  private scores: Score[] = [];
  private query = '';

  private root = el('main', 'home');
  private folderPanel = el('section', 'folder');
  private list = el('ul', 'scores');
  private status = el('p', 'status');
  private search = el('input', 'search');
  private fileInput = el('input');

  constructor(private prefs: Prefs) {
    const header = el('header', 'masthead');
    const brand = el('h1', 'brand', 'Volti');
    const tagline = el('p', 'tagline', 'volti subito · turn the page');
    header.append(brand, tagline);

    this.search.type = 'search';
    this.search.id = 'search';
    this.search.placeholder = 'Find a score';
    this.search.setAttribute('aria-label', 'Find a score');
    this.search.addEventListener('input', () => { this.query = this.search.value; this.renderList(); });

    this.fileInput.type = 'file';
    this.fileInput.id = 'import-files';
    this.fileInput.accept = 'application/pdf,.pdf';
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', async () => {
      const n = await importFiles(this.fileInput.files ?? []);
      this.fileInput.value = '';
      this.say(n ? `Added ${n} score${n === 1 ? '' : 's'}.` : 'No PDFs were selected.');
      await this.refresh();
    });

    const tools = el('div', 'tools');
    tools.append(this.search, button('Add PDFs', () => this.fileInput.click()), this.fileInput);

    this.status.setAttribute('role', 'status');
    this.root.append(header, this.folderPanel, tools, this.status, this.list);
    document.body.append(this.root);
  }

  say(text: string) {
    this.status.textContent = text;
  }

  async refresh() {
    this.folder = await folderState();
    this.renderFolder();
    try {
      this.scores = await allScores(this.folder);
    } catch (e) {
      // The folder may have been moved or deleted since it was linked.
      console.error(e);
      this.say('Could not read the scores folder. Link it again if it has moved.');
      this.scores = [];
    }
    this.renderList();
  }

  private renderFolder() {
    const p = this.folderPanel;
    p.replaceChildren();
    const f = this.folder;
    if (f.kind === 'none') {
      const text = canLinkFolder()
        ? 'Link the folder on this tablet where you keep your PDF scores. Volti reads them where they are.'
        : 'This browser cannot link a folder. Add PDFs to keep copies in Volti instead.';
      p.append(el('p', '', text));
      if (canLinkFolder()) p.append(button('Link scores folder', () => void this.link(), 'primary'));
      return;
    }
    const name = el('p', 'folder-name');
    name.append(el('span', 'label', 'Scores folder'), el('strong', '', f.name));
    p.append(name);
    if (f.kind === 'locked') {
      p.append(button('Allow access', () => void this.unlock(), 'primary'));
    }
    p.append(
      button('Change', () => void this.link()),
      button('Unlink', async () => { await unlinkFolder(); this.say('Folder unlinked. Your markings are kept.'); await this.refresh(); }, 'quiet'),
    );
  }

  private async link() {
    try {
      if (await linkFolder()) await this.refresh();
    } catch (e) {
      this.say('That folder cannot be linked. Android blocks the Download folder itself and the top of internal storage; pick a folder inside them, such as Download/Scores.');
      console.error(e);
    }
  }

  private async unlock(): Promise<boolean> {
    const ok = await unlockFolder();
    if (ok) await this.refresh();
    else this.say('Volti needs access to the folder to open its scores.');
    return ok;
  }

  private renderList() {
    const q = this.query.trim().toLowerCase();
    const shown = q ? this.scores.filter((s) => `${s.title} ${s.folder}`.toLowerCase().includes(q)) : this.scores;
    this.list.replaceChildren();
    if (!this.scores.length) {
      this.list.append(el('li', 'empty', this.folder.kind === 'none'
        ? 'No scores yet. Link your scores folder, add PDFs, or share a PDF to Volti from another app.'
        : 'No PDFs found in this folder or its subfolders.'));
      return;
    }
    if (!shown.length) {
      this.list.append(el('li', 'empty', `Nothing matches “${this.query}”.`));
      return;
    }
    for (const s of shown) {
      const li = el('li', 'score');
      const open = el('button', 'open');
      open.type = 'button';
      open.append(el('span', 'score-title', s.title));
      if (s.folder) open.append(el('span', 'score-folder', s.folder));
      if (s.source === 'imported') open.append(el('span', 'badge', 'Added'));
      open.addEventListener('click', () => void this.open(s));
      li.append(open);
      if (s.source === 'imported') {
        li.append(button('Remove', async () => {
          await removeImported(s);
          this.say(`Removed “${s.title}”.`);
          await this.refresh();
        }, 'quiet'));
      }
      this.list.append(li);
    }
  }

  private async open(s: Score) {
    // Opening a score is a tap, so it can also grant folder access for this session.
    if (s.source === 'folder' && this.folder.kind === 'locked' && !(await this.unlock())) return;
    this.say('');
    this.root.hidden = true;
    try {
      await openReader(s, this.prefs, () => { this.root.hidden = false; this.search.blur(); });
    } catch (e) {
      console.error(e);
      this.root.hidden = false;
      this.say(`Could not open “${s.title}”. It may have been moved or renamed.`);
    }
  }
}
