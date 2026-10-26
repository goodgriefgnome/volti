// The pages of an original, drawn and kept: the page cache, which draws pages a couple at a time,
// those for the screen first, keeps those around the current screen, and uses saved pictures where
// there are some. What draws the pages is a PageSource: pdf.js (pdf.ts), as an original is always
// read as a PDF.

/** An original's pages, to draw. Pages are numbered from 1. */
export interface PageSource {
  readonly pages: number;
  /** Page height / width. */
  aspect(num: number): Promise<number>;
  /** Draw a page `width` device pixels wide. */
  draw(num: number, width: number): Promise<HTMLCanvasElement>;
  /** Draw a page `pageWidth` pixels wide, and cut `region` (in those pixels) out of it. */
  region(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement>;
  destroy(): void;
}

/** Saved pictures of a score's pages, by page number and width in device pixels: looked at before a page is drawn. */
export interface PagePictures {
  get(num: number, width: number): Promise<HTMLCanvasElement | null>;
  /** Offered each page drawn for reading: kept if it is one to keep. */
  put(num: number, width: number, canvas: HTMLCanvasElement): void;
}

/**
 * How soon a page is wanted: `now` on the screen, `ahead` on a neighbouring screen, `later` in
 * the background (it also waits while any page is drawn for the screen, in any score).
 */
export type When = 'now' | 'ahead' | 'later';

/** Pages being drawn for the screen, in any score, and what waits for there to be none. */
let forScreen = 0;
let quiet: (() => void)[] = [];
const whenQuiet = () => (forScreen ? new Promise<void>((go) => quiet.push(go)) : Promise.resolve());
function screenDrawn() {
  if (--forScreen) return;
  const waiting = quiet;
  quiet = [];
  for (const go of waiting) go();
}

/** Pages drawn at once: two overlap well (the worker reads one while the other is painted); more only use up memory. */
const AT_ONCE = 2;

/**
 * Renders pages to canvases and keeps the ones around the current spread,
 * so turning to a neighbouring spread shows a page that is already drawn.
 */
export class PageCache {
  private cache = new Map<string, Promise<HTMLCanvasElement>>();
  private aspects = new Map<number, number>();
  /** Draws waiting for a turn: pages wanted now go before the rest. */
  private waiting: { now: (() => void)[]; later: (() => void)[] } = { now: [], later: [] };
  private drawing = 0;
  /** Saved pictures of the pages, used instead of drawing them. */
  pictures?: PagePictures;

  constructor(private opened: Promise<PageSource>) {
    opened.catch(() => {}); // a failure shows where a page is drawn
  }

  /** A cache for an original still opening: drawing a page waits for it, but a saved picture doesn't. */
  static opening(cache: Promise<PageCache>): PageCache {
    return new PageCache(cache.then((c) => c.opened));
  }

  /** Page height / width. */
  async aspect(num: number): Promise<number> {
    let a = this.aspects.get(num);
    if (a === undefined) {
      a = await (await this.opened).aspect(num);
      this.aspects.set(num, a);
    }
    return a;
  }

  /** Height / width of every page, in order. */
  async allAspects(): Promise<number[]> {
    const n = (await this.opened).pages;
    return Promise.all(Array.from({ length: n }, (_, i) => this.aspect(i + 1)));
  }

  private key(num: number, cssW: number, cssH: number) { return `${num}@${cssW}x${cssH}`; }

  has(num: number, cssW: number, cssH: number) { return this.cache.has(this.key(num, cssW, cssH)); }

  /** Wait for a turn to draw, then hand it on when done. */
  private async turn<T>(when: When, draw: (waited: boolean) => Promise<T>): Promise<T> {
    if (when === 'later') await whenQuiet();
    const waited = this.drawing >= AT_ONCE;
    if (waited) await new Promise<void>((go) => this.waiting[when === 'now' ? 'now' : 'later'].push(go));
    else this.drawing++;
    if (when === 'now') forScreen++;
    try {
      return await draw(waited);
    } finally {
      if (when === 'now') screenDrawn();
      const next = this.waiting.now.shift() ?? this.waiting.later.shift();
      if (next) next(); // the turn passes straight on
      else this.drawing--;
    }
  }

  /**
   * A page, from its saved picture or drawn, a couple at a time. A page not wanted `now` waits for
   * any that is, so drawing ahead never holds up the page asked for for long. One drawn to `save`
   * (read at a size the reader shows, not a thumbnail) is offered to the saved pictures.
   */
  render(num: number, cssW: number, cssH: number, dpr: number, when: When = 'now', save = false): Promise<HTMLCanvasElement> {
    const k = this.key(num, cssW, cssH);
    let p = this.cache.get(k);
    if (p) return p;
    // Size the result in whole screen pixels, so the browser never has to stretch it.
    const width = Math.round(cssW * dpr);
    p = (async () => {
      const saved = await this.pictures?.get(num, width);
      if (saved) return saved;
      const canvas = await this.turn(when, (waited) => {
        // Turned past while it waited: no longer kept, so not worth drawing.
        if (when === 'ahead' && waited && !this.cache.has(k)) throw new Error('No longer wanted');
        return this.opened.then((s) => s.draw(num, width));
      });
      if (save) this.pictures?.put(num, width, canvas);
      return canvas;
    })();
    this.cache.set(k, p);
    p.catch(() => this.cache.delete(k));
    return p;
  }

  /**
   * Draw part of a page for a zoomed-in close-up: the page is drawn `pageWidth` pixels wide and
   * `region` (in those pixels) is cut out of it. Not cached, as it changes with every pan and pinch.
   */
  async renderRegion(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    return (await this.opened).region(num, pageWidth, region);
  }

  /** Drop everything except the given pages at the given size. */
  keepOnly(nums: number[], sizeOf: (num: number) => { w: number; h: number } | undefined) {
    const keep = new Set(nums.map((n) => { const s = sizeOf(n); return s && this.key(n, s.w, s.h); }));
    for (const k of this.cache.keys()) if (!keep.has(k)) this.cache.delete(k);
  }

  destroy() {
    this.cache.clear();
    void this.opened.then((s) => s.destroy(), () => {});
  }
}
