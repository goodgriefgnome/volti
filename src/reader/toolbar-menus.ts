// The reader toolbar's menus and dialogs: the setlist's scores, adding to a setlist, exporting, the
// score's named excerpts, and choosing the excerpt an entry plays. What they change is the
// Reading's, and the reader shows and saves it.

import { openExcerptPicker, type ExcerptSource } from '../dialogs/excerpt-picker';
import { addExcerpt, changeExcerptCuts, deleteExcerpt, renameExcerpt, type ExcerptHost } from '../dialogs/excerpts';
import { openExportPdf } from '../dialogs/export-pdf';
import { chooseSetlist } from '../dialogs/setlists';
import { nameOf, sortedNames } from '../excerpts/names';
import { spanLabel, spanOf, type Span } from '../excerpts/span';
import type { ExportPart } from '../export/pdf';
import { folderState } from '../originals/folder';
import type { PageCache } from '../originals/pages';
import { saveLastAddedTo } from '../setlists/store';
import { button, dpr, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showMenu } from '../ui/overlay';
import type { OpenScore } from './open-scores';
import type { Reading } from './reading';
import type { Saver } from './saver';
import type { Toolbar } from './toolbar';

/** What the menus need from the reader. */
export interface MenusHost {
  reading: Reading;
  toolbar: Toolbar;
  saver: Saver;
  /** The item being read. */
  k(): number;
  /** Item k's score, once open. */
  open(k: number): OpenScore | undefined;
  /** Go to item k: its first screen, or the screen holding a cut. */
  goTo(k: number, at?: string): void;
  /** What the current item plays has changed: show it from its start. */
  replay(): void;
  /** The current score's names changed: show its title again. */
  retitle(): void;
  /** Put away the cut editor's menus and dialogs. */
  dismiss(): void;
  say(text: string): void;
}

export class ReaderMenus {
  constructor(private h: MenusHost) {}

  private get current() { return this.h.open(this.h.k()); }

  /** In a setlist: its scores, to go to one. */
  scores() {
    const { reading } = this.h;
    showMenu(this.h.toolbar.anchor('scores'), reading.setlist?.title ?? 'Scores', reading.items.map((it, k) => ({
      label: `${k + 1}. ${it.title}${this.excerptLabel(k)}`,
      checked: k === this.h.k(),
      run: () => this.h.goTo(k),
    })));
  }

  /** " · Kyrie" or " · Pages 2–3" for an entry that plays an excerpt of a score that is open; otherwise nothing. */
  private excerptLabel(k: number): string {
    const cur = this.h.open(k);
    const label = cur && this.h.reading.excerptName(k, cur.state.score, cur.aspects);
    return label ? ` · ${label}` : '';
  }

  /** In a score's own reader: add the score, whole, to the end of a setlist; in an excerpt's, the excerpt. */
  addToSetlist() {
    const { reading } = this.h, it = reading.items[0], cur = this.current;
    const what = (cur && reading.excerptName(0, cur.state.score, cur.aspects)) ?? it.title;
    chooseSetlist(this.h.toolbar.anchor('addTo'), `Add “${what}” to`, reading.setlists, (s) => {
      reading.addTo(s);
      void saveLastAddedTo(s.id);
      this.h.saver.soon();
      this.h.say(`Added to the end of “${s.title}”.`);
    }, it.scoreId);
  }

  /** Export what the reader pages through: the score, the excerpt, or the whole setlist. */
  async exportPdf() {
    const { reading } = this.h;
    this.h.dismiss();
    // The export reads the scores as saved.
    await this.h.saver.flush();
    const parts: ExportPart[] = [], missing: string[] = [];
    reading.items.forEach((it, k) => {
      if (it.original && !it.missing) parts.push({ original: it.original, span: reading.span(k) });
      else missing.push(it.title);
    });
    if (!parts.length) { this.h.say('Its scores are all missing.'); return; }
    const cur = this.current, title = reading.items[0].title;
    const excerpt = reading.what.kind === 'excerpt' && cur ? reading.excerptName(0, cur.state.score, cur.aspects) : null;
    openExportPdf({
      title: reading.setlist?.title ?? (excerpt ? `${title} - ${excerpt}` : title),
      parts,
      missing,
      toFolder: (await folderState()).kind !== 'none',
      saved: (name) => this.h.say(`Saved “${name}.pdf” in Exports, in the scores folder.`),
    });
  }

  /** An open score's pages, for the excerpt picker. */
  private source(cur: OpenScore, cache: PageCache): ExcerptSource {
    return { state: cur.state, aspects: cur.aspects, page: (p, w) => cache.render(p + 1, w, Math.round(w * cur.aspects[p]), dpr()) };
  }

  /** Changing the open score's named excerpts from the reader, saved with the score. */
  private excerptHost(cur: OpenScore): ExcerptHost {
    return {
      setlists: this.h.reading.setlists,
      aspects: cur.aspects,
      save: (score, setlists) => {
        cur.state = { ...cur.state, score };
        if (setlists) this.h.reading.setlists = setlists;
        this.h.saver.soon(cur);
        this.h.retitle();
      },
      say: (t) => this.h.say(t),
    };
  }

  /** In a score's own reader: its named excerpts, to go to one, add one or change them. */
  excerpts() {
    const cur = this.current, cache = cur?.cache;
    if (!cur || !cache) return;
    this.h.dismiss();
    const score = cur.state.score, title = this.h.reading.items[0].title, names = sortedNames(score);
    const d = showDialog(`Excerpts of “${title}”`);
    const list = el('ul', 'excerpt-list');
    for (const x of names) {
      const li = el('li');
      const go = button('', () => {
        closeOverlay();
        this.h.goTo(this.h.k(), score.cuts[spanOf(score.cuts, x).i0]?.id);
      }, 'open');
      go.append(el('span', 'item-title', x.name));
      const pages = spanLabel(score.cuts, x, cur.aspects);
      if (pages) go.append(el('span', 'meta', pages));
      go.setAttribute('aria-label', `Go to ${x.name}`);
      const more = button('⋯', () => showMenu(more, x.name, [
        { label: 'Rename…', run: () => renameExcerpt(cur.state.score, x, this.excerptHost(cur)) },
        { label: 'Change cuts…', run: () => changeExcerptCuts(this.source(cur, cache), x, this.excerptHost(cur)) },
        { label: 'Delete…', run: () => deleteExcerpt(cur.state.score, x, this.excerptHost(cur)) },
      ]), 'quiet more');
      more.setAttribute('aria-label', `More for ${x.name}`);
      more.setAttribute('aria-haspopup', 'menu');
      li.append(go, more);
      list.append(li);
    }
    if (!names.length) list.append(el('li', 'empty', 'No excerpts yet. Add one to name part of the score, such as the Kyrie.'));
    d.append(list, buttonRow(
      button('Add excerpt…', () => addExcerpt(this.source(cur, cache), title, this.excerptHost(cur))),
      button('Close', closeOverlay, 'primary'),
    ));
  }

  /** In a setlist: choose which of the score's cuts this entry plays. In an excerpt: change the excerpt's cuts. */
  excerpt() {
    const cur = this.current, { reading } = this.h, k = this.h.k();
    if (!cur?.cache) return;
    this.h.dismiss();
    const pages = this.source(cur, cur.cache);
    const play = (span: Span) => {
      reading.play(k, span);
      // The score too: one opened for the first time isn't saved yet, and the span names its cuts.
      this.h.saver.soon(cur);
      this.h.replay();
    };
    if (reading.what.kind === 'excerpt') {
      // Give the named excerpt being read other cuts; every setlist entry that plays it moves with
      // it. An excerpt that lost its name to an edit (it came to be the whole score) just plays other cuts.
      const span = reading.what.span, name = nameOf(cur.state.score, span);
      if (name) changeExcerptCuts(pages, name, this.excerptHost(cur), play);
      else openExcerptPicker({ ...pages, question: `Which part of “${reading.items[0].title}” to read?`, verb: 'It plays', span, done: play });
      return;
    }
    const entry = reading.entry(k);
    if (!entry) return;
    openExcerptPicker({
      ...pages,
      question: `Which part of “${reading.items[k].title}” does entry ${k + 1} play?`,
      verb: 'This entry plays',
      named: true,
      span: entry,
      done: play,
    });
  }
}
