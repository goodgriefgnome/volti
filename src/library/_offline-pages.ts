// Keeping the pages setlists play offline, in the background: working out, score by score, which
// original pages setlists play, at the widths this screen shows them in either orientation, telling
// the page cache to keep exactly those (and let go of the rest), drawing those not saved yet, and
// telling how much of each setlist is saved. An original is read only while it is used.

import { excerptCuts } from '../scores/excerpts';
import { knownAspects, savePageOffline } from '../originals/original';
import { knownTitles } from '../originals/library-files';
import { titleOf } from '../originals/path-utils';
import { NoAccess, PasswordNotGiven, type Original, type SourceFile } from '../originals/types';
import { pinOffline } from '../page-cache/cache';
import type { PinnedKey, PinnedPage } from '../page-cache/types';
import { offlinePageWidths } from '../render/screen';
import { loadScore } from '../scores/store';
import { pack } from '../scores/frames';
import type { Entry, Setlist } from '../setlists/model';
import { dpr } from '../ui/dom';
import { offlineStatus, pageKey, type Blocked, type OfflineStatus } from './_offline-status';

/** How long to wait after a change, so a burst of them is worked out once. */
const SETTLE_MS = 2000;
/** The least time between two reports of the progress. */
const HEARD_MS = 250;

let timer: ReturnType<typeof setTimeout> | undefined;
/** Stops the run before when a new one starts. */
let running: AbortController | undefined;

/**
 * Bring the pages kept offline up to date with these setlists, in the background: after a setlist
 * changes, or the scores do, and at start-up. `heard` is told each setlist's status after each
 * progress, at most every 250 ms, and once more when the run ends. Archived setlists aren't kept,
 * so they get none.
 */
export function keepSetlistPagesOffline(originals: readonly SourceFile[], setlists: readonly Setlist[], heard: (s: Map<string, OfflineStatus>) => void) {
  clearTimeout(timer);
  running?.abort();
  const mine = running = new AbortController();
  timer = setTimeout(() => void make(mine.signal, originals, setlists, heard).catch((e) => console.warn('Keeping pages offline stopped:', e)), SETTLE_MS);
}

async function make(signal: AbortSignal, originals: readonly SourceFile[], setlists: readonly Setlist[], heard: (s: Map<string, OfflineStatus>) => void) {
  const byId = new Map(originals.map((o) => [o.id, o]));
  const titles = await knownTitles();
  const live = setlists.filter((s) => !s.archived);
  const entries = live.flatMap((s) => s.entries);
  // The screen's size, not the library's window: the reader fills the screen (status bar and address
  // bar included), which the library doesn't, and a saved page only serves a request of about its width.
  // Either way up, as Android swaps the two with the orientation.
  const W = screen.width, H = screen.height, scale = dpr();
  // Scores whose pages can't be worked out (never opened, and their PDF can't be now): their pages stay as they are.
  const unknown: string[] = [];
  const scores = new Map<string, PinnedPage[]>();
  /** Why each score's pages may not be saved; a score that can be read but whose pages fail to draw is `missing`. */
  const blocked = new Map<string, { why: Blocked; title: string }>();
  /** The pages each entry plays. */
  const entryKeys = new Map<Entry, string[]>();
  /** Read a score's original, if it can be, noting why in `blocked` if not. */
  const read = async (id: string): Promise<Original | undefined> => {
    const file = byId.get(id);
    if (!file) return undefined;
    try { return await file.read(); } catch (e) {
      blocked.set(id, { ...blocked.get(id)!, why: e instanceof NoAccess ? 'access' : e instanceof PasswordNotGiven ? 'password' : 'missing' });
      return undefined;
    }
  };
  for (const id of new Set(entries.map((e) => e.scoreId))) {
    if (signal.aborted) return;
    const file = byId.get(id);
    blocked.set(id, { why: 'missing', title: (file && titleOf(file.path)) ?? titles[id] ?? 'Missing score' });
    let aspects = await knownAspects(id);
    if (!aspects) {
      const original = await read(id);
      try { aspects = await original?.aspects().catch(() => undefined); } finally { original?.close(); }
    }
    if (!aspects) { unknown.push(id); continue; }
    const { state } = await loadScore(id, aspects);
    const widths = new Map<number, Set<number>>();
    for (const e of entries.filter((e) => e.scoreId === id)) {
      const keys: string[] = [];
      for (const [p, ws] of offlinePageWidths(pack(excerptCuts(state.score.cuts, e), aspects), W, H, scale)) {
        for (const w of ws) {
          const pxWidth = Math.round(w * scale);
          widths.set(p + 1, (widths.get(p + 1) ?? new Set()).add(pxWidth));
          keys.push(pageKey(id, p + 1, pxWidth));
        }
      }
      entryKeys.set(e, keys);
    }
    scores.set(id, [...widths].flatMap(([page, ws]) => [...ws].map((pxWidth) => ({ page, pxWidth, aspect: aspects![page - 1] }))));
  }
  if (signal.aborted) return;

  const needs = new Map(live.map((s) => [s.id, [...new Set(s.entries.flatMap((e) => entryKeys.get(e) ?? []))]]));
  const saved = new Set<string>();
  const statuses = (finished: boolean) => {
    const out = offlineStatus(needs, saved, finished, blocked);
    // A score never opened has no pages to count: its setlist waits for it, whatever the others do.
    for (const s of live) {
      const missing = s.entries.find((e) => unknown.includes(e.scoreId));
      if (!missing) continue;
      const keys = needs.get(s.id)!;
      out.set(s.id, { kind: 'blocked', done: keys.filter((k) => saved.has(k)).length, of: keys.length, left: 0, ...blocked.get(missing.scoreId)! });
    }
    return out;
  };
  let last = 0, pending: ReturnType<typeof setTimeout> | undefined;
  const tell = (finished: boolean) => {
    clearTimeout(pending);
    pending = undefined;
    last = Date.now();
    heard(statuses(finished));
  };
  const keyed = (id: string, p: PinnedPage): PinnedKey => ({ id, page: p.page, pxWidth: p.pxWidth });
  for (const k of await pinOffline([...scores].flatMap(([id, pages]) => pages.map((p) => keyed(id, p))), unknown)) saved.add(pageKey(k.id, k.page, k.pxWidth));
  if (signal.aborted) return;
  tell(false);

  for (const [id, pages] of scores) {
    const todo = pages.filter((p) => !saved.has(pageKey(id, p.page, p.pxWidth)));
    if (!todo.length) continue;
    if (signal.aborted) return;
    if (!byId.has(id)) { blocked.set(id, { ...blocked.get(id)!, why: 'missing' }); continue; }
    const original = await read(id);
    if (!original) continue;
    try {
      for (const p of todo) {
        if (signal.aborted) return;
        try { await savePageOffline(original, p, signal); } catch (e) {
          if (!signal.aborted) console.warn('Could not draw a page to keep offline:', e);
          continue;
        }
        saved.add(pageKey(id, p.page, p.pxWidth));
        if (signal.aborted) return;
        const wait = HEARD_MS - (Date.now() - last);
        if (wait <= 0) tell(false);
        else pending ??= setTimeout(() => { pending = undefined; if (!signal.aborted) tell(false); }, wait);
      }
    } finally { original.close(); }
  }
  clearTimeout(pending);
  if (!signal.aborted) tell(true);
}
