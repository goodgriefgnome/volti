// The open pages of originals, one set per id for the whole app, behind the PageSource the page
// cache draws from. An id's pages open on the first use (measuring or drawing) and are shared by
// every reference to the id; they close at once when the last reference closes. No timer.

import type { Content, OpenPages } from './_types';

/** One reference to an id's pages. */
export interface SharedPages {
  /** The id's pages, opened by the first use of any reference; a failed opening is tried again by the next. */
  use(): Promise<OpenPages>;
  /** End this reference; the last one closes the pages. Throws when called more than once. */
  close(): void;
}

interface Shared {
  content: Content;
  open?: Promise<OpenPages>;
  /** References not closed yet. */
  refs: number;
}

const shared = new Map<string, Shared>();

/**
 * A new reference to the pages of `id`. A newer reference's `content` replaces the id's while its
 * pages aren't open.
 */
export function sharePages(id: string, content: Content): SharedPages {
  let e = shared.get(id);
  if (!e) shared.set(id, (e = { content, refs: 0 }));
  else if (!e.open) e.content = content;
  const mine = e;
  mine.refs++;
  let closed = false;
  return {
    use() {
      if (closed) return Promise.reject(new Error('Used after it was closed'));
      // Opening is never cancelled: it is shared, and a failure shows to whoever asked.
      const opening = (mine.open ??= mine.content.pages());
      opening.catch(() => { if (mine.open === opening) mine.open = undefined; });
      return opening;
    },
    close() {
      if (closed) throw new Error('Closed more often than it was got');
      closed = true;
      if (--mine.refs) return;
      shared.delete(id);
      void mine.open?.then((p) => p.close(), () => {});
      mine.open = undefined;
    },
  };
}

/** For tests: close every id's pages now, as if the app had just started. */
export function resetPagesForTests() {
  for (const e of shared.values()) void e.open?.then((p) => p.close(), () => {});
  shared.clear();
}
