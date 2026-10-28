// How much of each setlist is saved for offline, and why the rest isn't: worked out from the pages
// each setlist needs and the pages saved so far. Pure: no DOM, no storage; _offline-pages.ts
// gathers the pages, and _setlists-section.ts shows the result.

/** Why a score's pages can't be saved now. */
export type Blocked = 'access' | 'password' | 'missing';

export type OfflineStatus =
  | { kind: 'saving'; done: number; of: number }
  | { kind: 'ready' }
  /** `title` and `left` are the first blocked score's: its name, and how many of its pages aren't saved. */
  | { kind: 'blocked'; done: number; of: number; why: Blocked; title: string; left: number };

/** A page's key in `needs` and `saved`. */
export const pageKey = (id: string, page: number, pxWidth: number) => `${id}/${page}/${pxWidth}`;

/**
 * Each setlist's status, from the pages each needs (keys as `${id}/${page}/${pxWidth}`), the pages
 * saved so far, whether the keeper has finished, and why each blocked score is blocked.
 *
 * - All its pages saved: `ready`, even while the keeper is still running.
 * - Otherwise, while it runs: `saving`.
 * - Otherwise, once it has finished: `blocked`, with the reason of the first score in the setlist
 *   whose pages are missing; a score not in `blocked` (drawing its pages failed) is `missing`.
 *
 * A setlist that needs no pages has no status.
 */
export function offlineStatus(
  needs: ReadonlyMap<string, readonly string[]>,
  saved: ReadonlySet<string>,
  finished: boolean,
  blocked: ReadonlyMap<string, { why: Blocked; title: string }>,
): Map<string, OfflineStatus> {
  const out = new Map<string, OfflineStatus>();
  for (const [setlist, keys] of needs) {
    if (!keys.length) continue;
    const done = keys.filter((k) => saved.has(k)).length, of = keys.length;
    if (done === of) out.set(setlist, { kind: 'ready' });
    else if (!finished) out.set(setlist, { kind: 'saving', done, of });
    else {
      const first = keys.find((k) => !saved.has(k))!, id = first.slice(0, first.indexOf('/'));
      const left = keys.filter((k) => !saved.has(k) && k.startsWith(id + '/')).length;
      out.set(setlist, { kind: 'blocked', done, of, left, ...(blocked.get(id) ?? { why: 'missing', title: '' }) });
    }
  }
  return out;
}

/** What a status says, in a toast and to screen readers. */
export function offlineText(s: OfflineStatus): string {
  if (s.kind === 'saving') return `${s.done} of ${s.of} pages saved for offline.`;
  if (s.kind === 'ready') return 'Ready to play offline.';
  if (s.why === 'access') return `Volti needs access to the scores folder to save the rest (${s.of - s.done} pages).`;
  if (s.why === 'password') return `“${s.title}” needs its password before its pages can be saved.`;
  return s.left ? `“${s.title}” can’t be found, so ${s.left} of its pages can’t be saved.` : `“${s.title}” can’t be found, so its pages can’t be saved.`;
}
