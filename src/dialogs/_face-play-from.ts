// Play from: the page a face gesture's recording plays over. A dialog over the Face gestures
// dialog shows the page picked last (kept for every gesture) and asks to start; Change… picks a
// score from the library, then one of its pages as a thumbnail, or empty staves. The page comes
// back drawn to fit the screen.

import { loadRecordingPage, saveRecordingPage, type RecordingPage } from '../face/store';
import type { PagePicture, PlayFrom } from '../face/dialog';
import { libraryFiles } from '../originals/library-files';
import { titleOf } from '../originals/path-utils';
import type { SourceFile } from '../originals/types';
import { button, dpr, el, plural } from '../ui/dom';
import { failed } from '../ui/failure';
import { buttonRow, showOnTop } from '../ui/overlay';
import { openScore, type LibraryScore } from './open-score';

/** The thumbnail's width in the Play from dialog and in the page picker, in CSS pixels. */
const THUMBNAIL_W = 96;
/** A page of empty staves is this tall for its width (A4). */
const EMPTY_ASPECT = 1.414;

/** The library's files, its first batch, as the library itself takes them after a scan. */
async function libraryScores(): Promise<SourceFile[]> {
  const stop = new AbortController();
  for await (const { files } of libraryFiles(stop.signal)) { stop.abort(); return files; }
  return [];
}

/** A canvas `w` CSS pixels wide of empty staves: five lines each, evenly spaced, on white. */
function emptyStaves(w: number): HTMLCanvasElement {
  const scale = dpr();
  const h = w * EMPTY_ASPECT;
  const c = el('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2a2d34';
  g.lineWidth = Math.max(0.5, w * 0.0016);
  const gap = w * 0.0125;
  const pitch = gap * 4 + w * 0.075;
  const margin = w * 0.08;
  for (let top = margin; top + gap * 4 <= h - margin; top += pitch) {
    for (let line = 0; line < 5; line++) {
      const y = top + line * gap;
      g.beginPath();
      g.moveTo(margin, y);
      g.lineTo(w - margin, y);
      g.stroke();
    }
  }
  return c;
}

/** A copy of a canvas, so the picture outlives the page cache's. */
function copyOf(from: HTMLCanvasElement): HTMLCanvasElement {
  const c = el('canvas');
  c.width = from.width;
  c.height = from.height;
  c.getContext('2d')!.drawImage(from, 0, 0);
  return c;
}

/** The last canvas page `page` (from 0) of `score` draws, `w` CSS pixels wide. */
async function pageCanvas(score: LibraryScore, page: number, w: number): Promise<HTMLCanvasElement> {
  let last: HTMLCanvasElement | undefined;
  for await (const c of score.pages(page, w)) last = c;
  if (!last) throw new Error(`Nothing drawn for page ${page + 1}`);
  return copyOf(last);
}

/** The page shown to fit the screen, `page` of the score in `file`, or empty staves. */
async function pictureOf(page: RecordingPage, files: SourceFile[]): Promise<PagePicture> {
  const screenW = (aspect: number) => Math.max(1, Math.floor(Math.min(innerWidth, innerHeight / aspect)));
  if ('empty' in page) return emptyStaves(screenW(EMPTY_ASPECT));
  const file = files.find((f) => f.id === page.scoreId);
  if (!file) throw new Error('The score is no longer in the library.');
  const score = await openScore(file);
  try {
    return await pageCanvas(score, page.page, screenW(score.aspects[page.page] ?? EMPTY_ASPECT));
  } finally {
    score.close();
  }
}

export const playFrom: PlayFrom = (name, start) => {
  /** What to take away, innermost last: the Play from dialog, the pickers. */
  const open = new Set<() => void>();
  const closeAll = () => { for (const close of [...open]) close(); };
  /** A dialog over the Face gestures dialog, taken away by `closeAll` too. */
  const over = (title: string) => {
    const d = showOnTop(title);
    const close = () => { open.delete(close); d.close(); };
    open.add(close);
    return { dialog: d.dialog, close };
  };

  let files: SourceFile[] = [];
  let picked: RecordingPage | undefined;

  /** The dialog asking to start, or (with no page picked yet, or the one picked gone) straight to Change…. */
  const ask = () => {
    const page = picked;
    const file = page && !('empty' in page) ? files.find((f) => f.id === page.scoreId) : undefined;
    if (!page || (!('empty' in page) && !file)) return pick(false);
    const { dialog, close } = over(`Record “${name}”`);
    const thumbnail = el('div', 'face-play-thumbnail');
    const label = el('div', 'face-play-text');
    label.append(el('strong', '', 'empty' in page ? 'Empty staves' : titleOf(file!.path)));
    if (!('empty' in page)) label.append(el('span', '', `page ${page.page + 1}`));
    label.append(button('Change…', () => { close(); pick(true); }, 'quiet'));
    const row = el('div', 'face-play-from');
    row.append(thumbnail, label);
    const problem = el('p', 'hint error');
    const startButton = button('Start', () => {
      startButton.disabled = true;
      pictureOf(page, files).then((picture) => { close(); start(picture); }, (e) => { problem.textContent = failed('open the page', e); startButton.disabled = false; });
    }, 'primary');
    dialog.append(row, el('p', 'hint', 'Trials follow one another until you tap the screen.'), problem, buttonRow(button('Cancel', close), startButton));
    // The thumbnail is drawn after the dialog is up.
    void thumbnailOf(page, files).then((c) => { if (thumbnail.isConnected) thumbnail.append(c); }, () => {});
  };

  /** The picked page's thumbnail. */
  async function thumbnailOf(page: RecordingPage, all: SourceFile[]): Promise<HTMLCanvasElement> {
    if ('empty' in page) return emptyStaves(THUMBNAIL_W);
    const file = all.find((f) => f.id === page.scoreId)!;
    const score = await openScore(file);
    try {
      return await pageCanvas(score, page.page, THUMBNAIL_W);
    } finally {
      score.close();
    }
  }

  /** Pick a page: the library's scores by title, then the score's pages; coming back to `ask` (`back` is whether there is a page to go back to). */
  function pick(back: boolean) {
    const { dialog, close } = over('Pick a page');
    const cancel = () => { close(); if (back) ask(); };
    const pickPage = (page: RecordingPage) => {
      picked = page;
      void saveRecordingPage(page).catch((e) => failed('save the page', e));
      close();
      ask();
    };
    const scores = el('div', 'face-pick-list');
    const showScores = () => {
      dialog.replaceChildren(el('h2', '', 'Pick a page'), scores, buttonRow(button('Cancel', cancel)));
    };
    for (const file of [...files].sort((a, b) => titleOf(a.path).localeCompare(titleOf(b.path)))) scores.append(button(titleOf(file.path), () => void showPages(file), 'quiet'));
    scores.append(button('Empty staves', () => pickPage({ empty: true }), 'quiet'));
    showScores();

    /** One score's pages as thumbnails. */
    async function showPages(file: SourceFile) {
      let score: LibraryScore;
      try {
        score = await openScore(file);
      } catch (e) {
        dialog.append(el('p', 'hint error', failed('open the score', e)));
        return;
      }
      const grid = el('div', 'face-pick-pages');
      let leaving = false;
      /** The score is closed once, when the pages are left or the dialogs are taken away. */
      const release = () => { if (!leaving) { leaving = true; score.close(); } open.delete(release); };
      open.add(release);
      const leave = (then: () => void) => { release(); then(); };
      dialog.replaceChildren(el('h2', '', titleOf(file.path)), el('p', 'hint', plural(score.aspects.length, 'page')), grid, buttonRow(button('Back', () => leave(showScores)), button('Cancel', () => leave(cancel))));
      for (let p = 0; p < score.aspects.length; p++) {
        const cell = button('', () => leave(() => pickPage({ scoreId: file.id, page: p })), 'face-pick-page');
        cell.setAttribute('aria-label', `Page ${p + 1}`);
        cell.style.aspectRatio = `1 / ${score.aspects[p]}`;
        grid.append(cell);
      }
      // Each page's first drawing, one after another; the first yield is a stand-in, quick and rough, which a thumbnail needs no better than.
      void (async () => {
        for (const [p, cell] of [...grid.children].entries()) {
          if (leaving || !grid.isConnected) return;
          try {
            const it = score.pages(p, THUMBNAIL_W)[Symbol.asyncIterator]();
            const r = await it.next();
            void it.return?.().catch(() => {});
            if (!r.done && !leaving) cell.append(copyOf(r.value));
          } catch { /* a page that can't be drawn stays blank */ }
        }
      })();
    }
  }

  void (async () => {
    try {
      files = await libraryScores();
    } catch { /* the library can't be listed: only empty staves */ }
    picked = await loadRecordingPage().catch(() => undefined);
    ask();
  })();

  return { close: closeAll };
};
