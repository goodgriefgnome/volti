// The pages drawn and held in memory, under a budget: least recently used go first. Evicting only
// drops the reference; a canvas handed out stays good for whoever holds it.

import { memoryBudget } from './_budget';

interface Entry { canvas: HTMLCanvasElement; bytes: number; onEvict: (canvas: HTMLCanvasElement) => void }

const bytesOf = (c: HTMLCanvasElement) => c.width * c.height * 4;

/** Pages held, least recently used first, by key (`id/page/pxWidth`). */
export class Held {
  private entries = new Map<string, Entry>();
  private widthsOf = new Map<string, Set<number>>();
  private total = 0;

  constructor(private budget: () => number = memoryBudget) {}

  /** The page, now the most recently used. */
  get(key: string): HTMLCanvasElement | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.canvas;
  }

  /** The widths held of a page. */
  widths(id: string, page: number): number[] {
    return [...(this.widthsOf.get(`${id}/${page}`) ?? [])];
  }

  /** Hold a page as the most recently used; others are evicted, oldest first, to stay in budget (never this one). */
  put(key: string, canvas: HTMLCanvasElement, onEvict: (canvas: HTMLCanvasElement) => void): void {
    this.drop(key);
    const bytes = bytesOf(canvas);
    this.entries.set(key, { canvas, bytes, onEvict });
    this.total += bytes;
    const [id, page, width] = parts(key);
    const k = `${id}/${page}`;
    this.widthsOf.set(k, (this.widthsOf.get(k) ?? new Set()).add(width));
    const budget = this.budget();
    while (this.total > budget && this.entries.size > 1) {
      const [oldest, e] = this.entries.entries().next().value!;
      this.drop(oldest);
      e.onEvict(e.canvas);
    }
  }

  private drop(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.total -= e.bytes;
    const [id, page, width] = parts(key);
    const k = `${id}/${page}`, set = this.widthsOf.get(k);
    set?.delete(width);
    if (set && !set.size) this.widthsOf.delete(k);
  }

  clear() {
    this.entries.clear();
    this.widthsOf.clear();
    this.total = 0;
  }
}

function parts(key: string): [string, number, number] {
  const [id, page, width] = key.split('/');
  return [id, Number(page), Number(width)];
}
