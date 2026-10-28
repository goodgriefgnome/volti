// Making the saved pictures in the background: working out which original pages setlists play, at
// the widths this screen shows them, drawing those not saved yet, and deleting the rest.

import { spanCuts } from '../excerpts/span';
import { titleOf } from '../originals/path-utils';
import { type SourceFile } from '../originals/types';
import { readPageWidths } from '../render/screen';
import { loadAspects, loadScore } from '../scores/store';
import { pack } from '../scores/frames';
import type { Setlist } from '../setlists/model';
import { dpr } from '../ui/dom';
import { _hasPicture, picturesOf, _setWanted, _tidyPictures } from './pictures';

/** How long to wait after a change, so a burst of them is worked out once. */
const SETTLE_MS = 2000;

/** A score whose pages are to be drawn: each at a width in CSS pixels, and its height. */
interface Job { original: SourceFile; pages: { num: number; w: number; h: number }[] }

let timer: ReturnType<typeof setTimeout> | undefined;
/** Bumped by each new start, which stops the one before. */
let run = 0;

/**
 * Bring the saved pictures up to date with these setlists, in the background: after a setlist
 * changes, or the scores do, and at start-up.
 */
export function makePictures(originals: readonly SourceFile[], setlists: readonly Setlist[]) {
  clearTimeout(timer);
  const mine = ++run;
  timer = setTimeout(() => void make(mine, originals, setlists).catch((e) => console.warn('Saving pictures stopped:', e)), SETTLE_MS);
}

async function make(mine: number, originals: readonly SourceFile[], setlists: readonly Setlist[]) {
  const byId = new Map(originals.map((o) => [o.id, o]));
  const entries = setlists.filter((s) => !s.archived).flatMap((s) => s.entries);
  // The reader fills the screen.
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, scale = dpr();
  const keep = new Map<string, Set<number>>();
  // Scores whose pages can't be worked out (never opened, and their PDF can't be now): their pictures stay.
  const unsure = new Set<string>();
  const jobs: Job[] = [];
  for (const id of new Set(entries.map((e) => e.scoreId))) {
    if (mine !== run) return;
    const original = byId.get(id);
    let aspects = await loadAspects(id);
    if (!aspects) {
      const cache = original && (await original.read().then((o) => o.pages()).catch(() => null));
      if (!cache) { unsure.add(id); continue; }
      try { aspects = await cache.allAspects(); } finally { cache.destroy(); }
    }
    const { state } = await loadScore(id, (original && titleOf(original.path)) ?? '', aspects);
    const widths = new Map<number, Set<number>>();
    for (const e of entries.filter((e) => e.scoreId === id)) {
      for (const [p, ws] of readPageWidths(pack(spanCuts(state.score.cuts, e), aspects), W, H, scale)) {
        for (const w of ws) widths.set(p + 1, (widths.get(p + 1) ?? new Set()).add(w));
      }
    }
    keep.set(id, new Set(widths.keys()));
    if (!original) continue;
    const pages: Job['pages'] = [];
    for (const [num, ws] of widths) {
      for (const w of ws) if (!(await _hasPicture(id, num, Math.round(w * scale)))) pages.push({ num, w, h: Math.round(w * aspects[num - 1]) });
    }
    if (pages.length) jobs.push({ original, pages });
  }
  if (mine !== run) return;
  _setWanted(keep);
  await _tidyPictures(keep, unsure);
  // Two scores at a time: each PDF has its own pdf.js worker, so they overlap; more would use up memory.
  const worker = async () => {
    for (let job = jobs.shift(); job && mine === run; job = jobs.shift()) await draw(job);
  };
  const draw = async ({ original, pages }: Job) => {
    const cache = await original.read().then((o) => o.pages()).catch(() => null);
    if (!cache) return;
    cache.pictures = picturesOf(original.id);
    try {
      for (const { num, w, h } of pages) {
        if (mine !== run) return;
        await cache.render(num, w, h, scale, 'later', true).catch((e) => console.warn('Could not draw a page to save:', e));
        cache.keepOnly([], () => undefined); // drawn and saved: no need to keep it here
      }
    } finally {
      cache.destroy();
    }
  };
  await Promise.all([worker(), worker()]);
}
