// Keeping the pages setlists play offline, in the background: working out which original pages
// setlists play, at the widths this screen shows them, and telling the page cache to keep exactly
// those (it draws those not saved yet, and lets go of the rest), and telling how much of each
// setlist is saved.

import { excerptCuts } from '../scores/excerpts';
import { keepPagesOffline, knownAspects } from '../originals/original';
import { knownTitles } from '../originals/library-files';
import { titleOf } from '../originals/path-utils';
import { NoAccess, PasswordNotGiven, type Original, type SourceFile } from '../originals/types';
import type { OfflinePage } from '../page-cache/types';
import { readPageWidths } from '../render/screen';
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
  // The reader fills the screen.
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, scale = dpr();
  // Scores whose pages can't be worked out (never opened, and their PDF can't be now): their pages stay as they are.
  const keep: string[] = [];
  const scores: { id: string; original?: Original; pages: OfflinePage[] }[] = [];
  /** Why each score's pages may not be saved; a score that can be read but whose pages fail to draw is `missing`. */
  const blocked = new Map<string, { why: Blocked; title: string }>();
  /** The pages each entry plays. */
  const entryKeys = new Map<Entry, string[]>();
  for (const id of new Set(entries.map((e) => e.scoreId))) {
    if (signal.aborted) return;
    const file = byId.get(id);
    let why: Blocked = 'missing', original: Original | undefined;
    if (file) {
      try { original = await file.read(); } catch (e) { why = e instanceof NoAccess ? 'access' : e instanceof PasswordNotGiven ? 'password' : 'missing'; }
    }
    blocked.set(id, { why, title: (file && titleOf(file.path)) ?? titles[id] ?? 'Missing score' });
    const aspects = (await knownAspects(id)) ?? (await original?.aspects().catch(() => undefined));
    if (!aspects) { keep.push(id); continue; }
    const { state } = await loadScore(id, aspects);
    const widths = new Map<number, Set<number>>();
    for (const e of entries.filter((e) => e.scoreId === id)) {
      const keys: string[] = [];
      for (const [p, ws] of readPageWidths(pack(excerptCuts(state.score.cuts, e), aspects), W, H, scale)) {
        for (const w of ws) {
          const pxWidth = Math.round(w * scale);
          widths.set(p + 1, (widths.get(p + 1) ?? new Set()).add(pxWidth));
          keys.push(pageKey(id, p + 1, pxWidth));
        }
      }
      entryKeys.set(e, keys);
    }
    const pages = [...widths].flatMap(([page, ws]) => [...ws].map((pxWidth) => ({ page, pxWidth, aspect: aspects[page - 1] })));
    scores.push({ id, original, pages });
  }
  if (signal.aborted) return;

  const needs = new Map(live.map((s) => [s.id, [...new Set(s.entries.flatMap((e) => entryKeys.get(e) ?? []))]]));
  const saved = new Set<string>();
  const statuses = (finished: boolean) => {
    const out = offlineStatus(needs, saved, finished, blocked);
    // A score never opened has no pages to count: its setlist waits for it, whatever the others do.
    for (const s of live) {
      const unknown = s.entries.find((e) => keep.includes(e.scoreId));
      if (!unknown) continue;
      const keys = needs.get(s.id)!;
      out.set(s.id, { kind: 'blocked', done: keys.filter((k) => saved.has(k)).length, of: keys.length, left: 0, ...blocked.get(unknown.scoreId)! });
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
  for await (const progress of keepPagesOffline(scores, keep, signal)) {
    for (const k of progress.saved) saved.add(pageKey(k.id, k.page, k.pxWidth));
    if (signal.aborted) return;
    const wait = HEARD_MS - (Date.now() - last);
    if (wait <= 0) tell(false);
    else pending ??= setTimeout(() => { pending = undefined; if (!signal.aborted) tell(false); }, wait);
  }
  clearTimeout(pending);
  if (!signal.aborted) tell(true);
}
