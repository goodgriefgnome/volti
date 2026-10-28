// Keeping the pages setlists play offline, in the background: working out which original pages
// setlists play, at the widths this screen shows them, and telling the page cache to keep exactly
// those (it draws those not saved yet, and lets go of the rest).

import { spanCuts } from '../excerpts/span';
import { keepPagesOffline, knownAspects } from '../originals/original';
import { type Original, type SourceFile } from '../originals/types';
import type { OfflinePage } from '../page-cache/types';
import { readPageWidths } from '../render/screen';
import { loadScore } from '../scores/store';
import { pack } from '../scores/frames';
import type { Setlist } from '../setlists/model';
import { dpr } from '../ui/dom';

/** How long to wait after a change, so a burst of them is worked out once. */
const SETTLE_MS = 2000;

let timer: ReturnType<typeof setTimeout> | undefined;
/** Stops the run before when a new one starts. */
let running: AbortController | undefined;

/**
 * Bring the pages kept offline up to date with these setlists, in the background: after a setlist
 * changes, or the scores do, and at start-up.
 */
export function makePictures(originals: readonly SourceFile[], setlists: readonly Setlist[]) {
  clearTimeout(timer);
  running?.abort();
  const mine = running = new AbortController();
  timer = setTimeout(() => void make(mine.signal, originals, setlists).catch((e) => console.warn('Keeping pages offline stopped:', e)), SETTLE_MS);
}

async function make(signal: AbortSignal, originals: readonly SourceFile[], setlists: readonly Setlist[]) {
  const byId = new Map(originals.map((o) => [o.id, o]));
  const entries = setlists.filter((s) => !s.archived).flatMap((s) => s.entries);
  // The reader fills the screen.
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, scale = dpr();
  // Scores whose pages can't be worked out (never opened, and their PDF can't be now): their pages stay as they are.
  const keep: string[] = [];
  const scores: { id: string; original?: Original; pages: OfflinePage[] }[] = [];
  for (const id of new Set(entries.map((e) => e.scoreId))) {
    if (signal.aborted) return;
    const file = byId.get(id);
    const original = await file?.read().catch(() => undefined);
    const aspects = (await knownAspects(id)) ?? (await original?.aspects().catch(() => undefined));
    if (!aspects) { keep.push(id); continue; }
    const { state } = await loadScore(id, aspects);
    const widths = new Map<number, Set<number>>();
    for (const e of entries.filter((e) => e.scoreId === id)) {
      for (const [p, ws] of readPageWidths(pack(spanCuts(state.score.cuts, e), aspects), W, H, scale)) {
        for (const w of ws) widths.set(p + 1, (widths.get(p + 1) ?? new Set()).add(Math.round(w * scale)));
      }
    }
    const pages = [...widths].flatMap(([page, ws]) => [...ws].map((pxWidth) => ({ page, pxWidth, aspect: aspects[page - 1] })));
    scores.push({ id, original, pages });
  }
  if (signal.aborted) return;
  // Nothing shows the progress yet.
  for await (const _ of keepPagesOffline(scores, keep, signal)) { /* drawn in the background */ }
}
