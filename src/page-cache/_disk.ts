// The pages saved in OPFS, as WebP, under `page-cache-<EPOCH>/` with an index.json that says what
// each file is, how big, whether a setlist keeps it (pinned), and when it was last used. Pinned
// pages are never evicted; the others go least recently used first. Anything that goes wrong with
// storage means the page isn't saved, never that a page can't be drawn.

/**
 * Bumped when page drawing changes noticeably: pages saved under another epoch are deleted, the
 * pinned ones too.
 */
const EPOCH = 1;
const DIR = `page-cache-${EPOCH}`;
const INDEX = 'index.json';
/** The folder of the saved pictures before the page cache, deleted. */
const OLD_DIR = 'page-pictures';
const SAVE_DELAY_MS = 5000;

interface Entry { id: string; page: number; w: number; bytes: number; pinned: boolean; used: number }

const nameOf = (id: string, page: number, w: number) => `${id}-${page}-${w}.webp`;
const keyOf = (id: string, page: number, w: number) => `${id}/${page}/${w}`;

export class Saved {
  private loaded?: Promise<{ dir: FileSystemDirectoryHandle; index: Map<string, Entry> } | null>;
  private writing = new Map<string, Promise<void>>();
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;

  /** The saved pages' folder and what is in it; null where there is no OPFS. Old folders go on the first call. */
  private load() {
    return (this.loaded ??= (async () => {
      try {
        const root = await navigator.storage.getDirectory();
        for await (const name of root.keys()) {
          const old = name === OLD_DIR || (/^page-cache-\d+$/.test(name) && name !== DIR);
          if (old) await root.removeEntry(name, { recursive: true }).catch(() => {});
        }
        const dir = await root.getDirectoryHandle(DIR, { create: true });
        const index = new Map<string, Entry>();
        try {
          const text = await (await (await dir.getFileHandle(INDEX)).getFile()).text();
          for (const e of JSON.parse(text) as Entry[]) index.set(nameOf(e.id, e.page, e.w), e);
        } catch { /* none yet, or unreadable: nothing is known saved */ }
        // Files not in the index (a crash before it was written) are of no use.
        for await (const name of dir.keys()) if (name !== INDEX && !index.has(name)) await dir.removeEntry(name).catch(() => {});
        return { dir, index };
      } catch (e) {
        console.warn('No saved pages:', e);
        return null;
      }
    })());
  }

  /** Write index.json soon (at once when `now`), after any write before it. */
  private persist(now: boolean) {
    this.dirty = true;
    clearTimeout(this.timer);
    const go = () => {
      this.saving = this.saving.then(async () => {
        const l = await this.load();
        if (!l || !this.dirty) return;
        this.dirty = false;
        try {
          const w = await (await l.dir.getFileHandle(INDEX, { create: true })).createWritable();
          await w.write(JSON.stringify([...l.index.values()]));
          await w.close();
        } catch (e) {
          console.warn('Could not save the index of saved pages:', e);
        }
      });
    };
    if (now) go();
    else this.timer = setTimeout(go, SAVE_DELAY_MS);
  }

  /** The widths saved of a page. */
  async widths(id: string, page: number): Promise<number[]> {
    const l = await this.load();
    return l ? [...l.index.values()].filter((e) => e.id === id && e.page === page).map((e) => e.w) : [];
  }

  /** A saved page, as a canvas; null if it isn't saved or can't be read. */
  async read(id: string, page: number, pxWidth: number): Promise<HTMLCanvasElement | null> {
    const l = await this.load();
    const name = nameOf(id, page, pxWidth), e = l?.index.get(name);
    if (!l || !e) return null;
    try {
      const bitmap = await createImageBitmap(await (await l.dir.getFileHandle(name)).getFile());
      const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
      canvas.getContext('2d', { alpha: false })!.drawImage(bitmap, 0, 0);
      bitmap.close();
      e.used = Date.now();
      this.persist(false);
      return canvas;
    } catch (err) {
      console.warn('Could not read a saved page:', err);
      l.index.delete(name);
      void l.dir.removeEntry(name).catch(() => {});
      this.persist(false);
      return null;
    }
  }

  /** Save a page, pinned if a setlist keeps it; one saved already is only marked used (and pinned). */
  async write(id: string, page: number, pxWidth: number, canvas: HTMLCanvasElement, pinned: boolean): Promise<void> {
    const l = await this.load();
    if (!l) return;
    const name = nameOf(id, page, pxWidth), have = l.index.get(name);
    if (have) {
      have.used = Date.now();
      if (pinned && !have.pinned) { have.pinned = true; this.persist(true); }
      return;
    }
    const going = this.writing.get(name);
    if (going) {
      await going;
      return this.write(id, page, pxWidth, canvas, pinned);
    }
    const job = (async () => {
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
        if (!blob) throw new Error('Could not encode it');
        const w = await (await l.dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(blob);
        await w.close();
        l.index.set(name, { id, page, w: pxWidth, bytes: blob.size, pinned, used: Date.now() });
        this.persist(true);
      } catch (e) {
        console.warn('Could not save a page:', e);
        void l.dir.removeEntry(name).catch(() => {});
      }
    })();
    this.writing.set(name, job);
    try { await job; } finally { this.writing.delete(name); }
  }

  /**
   * Keep exactly the pages in `set` (keys `id/page/pxWidth`) pinned. Those of the ids in `keep`
   * stay as they are; the other pinned pages become ordinary ones.
   */
  async pin(set: Set<string>, keep: Set<string>): Promise<void> {
    const l = await this.load();
    if (!l) return;
    for (const e of l.index.values()) if (!keep.has(e.id)) e.pinned = set.has(keyOf(e.id, e.page, e.w));
    this.persist(true);
  }

  /** Whether any page of `id` is saved. */
  async has(id: string): Promise<boolean> {
    const l = await this.load();
    return !!l && [...l.index.values()].some((e) => e.id === id);
  }

  /** The room the saved pages take: those pinned for setlists, and the rest. */
  async bytes(): Promise<{ setlists: number; other: number }> {
    const out = { setlists: 0, other: 0 };
    const l = await this.load();
    if (l) for (const e of l.index.values()) out[e.pinned ? 'setlists' : 'other'] += e.bytes;
    return out;
  }

  /** Delete the pages that aren't pinned, least recently used first, until all take no more than `budget` bytes (or only pinned ones are left). */
  async evictTo(budget: number): Promise<void> {
    const l = await this.load();
    if (!l) return;
    let total = 0;
    for (const e of l.index.values()) total += e.bytes;
    if (total <= budget) return;
    const others = [...l.index.values()].filter((e) => !e.pinned).sort((a, b) => a.used - b.used);
    for (const e of others) {
      if (total <= budget) break;
      const name = nameOf(e.id, e.page, e.w);
      l.index.delete(name);
      total -= e.bytes;
      await l.dir.removeEntry(name).catch(() => {});
    }
    this.persist(true);
  }
}
