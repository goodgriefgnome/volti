// The open pages of originals, one per id for the whole app, behind the PageSource the page cache
// draws from. A source opens `content`'s pages on its first draw and is shared by every Original
// of the same id; it closes 5 s after its last draw completes, unless it is the original drawn
// most recently (the one being read), which stays open.

import type { PageSource } from '../page-cache/types';
import type { Content, OpenPages } from './_types';

/** How long an idle source stays open. */
const CLOSE_AFTER_MS = 5000;

interface Open {
  content: Content;
  open?: Promise<OpenPages>;
  /** Draws going on. */
  running: number;
  timer?: ReturnType<typeof setTimeout>;
}

const sources = new Map<string, Open>();
/** The id drawn most recently. */
let last: string | undefined;

function close(o: Open) {
  clearTimeout(o.timer);
  o.timer = undefined;
  const open = o.open;
  o.open = undefined;
  void open?.then((p) => p.destroy(), () => {});
}

/** Close `id` in 5 s if it is idle by then and not the one drawn last. */
function closeSoon(id: string) {
  const o = sources.get(id);
  if (!o || !o.open || o.running || o.timer) return;
  o.timer = setTimeout(() => {
    o.timer = undefined;
    if (!o.running && id !== last) close(o);
  }, CLOSE_AFTER_MS);
}

/**
 * The page source for an original: opens `content`'s pages on its first draw, shares them with
 * every Original of the same id, and closes them 5 s after its last draw completes, unless it is
 * the original drawn most recently.
 */
export function sourceFor(id: string, size: number, content: Content): PageSource {
  return {
    size,
    async draw(page, pxWidth, crop, signal) {
      let o = sources.get(id);
      if (!o) sources.set(id, (o = { content, running: 0 }));
      else o.content = content;
      const before = last;
      last = id;
      if (before && before !== id) closeSoon(before);
      clearTimeout(o.timer);
      o.timer = undefined;
      o.running++;
      try {
        // Opening is never cancelled: it is shared, and a failure shows to whoever asked.
        const opening = (o.open ??= o.content.pages());
        opening.catch(() => { if (o!.open === opening) o!.open = undefined; });
        const pages = await opening;
        signal.throwIfAborted();
        return await pages.draw(page, pxWidth, crop, signal);
      } finally {
        o.running--;
        closeSoon(id);
      }
    },
  };
}

/** For tests: close every source now. */
export function closeSourcesForTests() {
  for (const o of sources.values()) close(o);
  sources.clear();
  last = undefined;
}
