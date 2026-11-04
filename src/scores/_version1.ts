// Scores as stored before version 2 of the stored data, when each cut had its own ink and removed
// cuts with ink were archived, and converting one to version 2. Only stored-data steps use it.

import type { Marking } from '../markings/model';
import type { Cut } from './model';

/** A cut as stored in version 1. */
export interface V1Cut { id: string; page: number; y0: number; y1: number; pad?: number; ownInk?: boolean }

/** A score as stored in version 1 (without its id, which is its key). Other fields are carried over as they are. */
export interface V1Score { cuts: V1Cut[]; archived?: V1Cut[]; [other: string]: unknown }

/** A score's ink as stored in version 1: markings by cut id. */
export type V1Ink = Record<string, Marking[]>;

/** The same score and ink in version 2: no archived cuts and no `ownInk`; markings by page. */
export interface V2Stored { score: { cuts: Cut[]; [other: string]: unknown }; ink: Record<number, Marking[]> }

/** Whether a stored score is still in version 1: it has `archived` (every version 1 score had it), or ink kept under a cut id. */
export function _isVersion1(score: V1Score, ink: V1Ink | undefined): boolean {
  return 'archived' in score || Object.keys(ink ?? {}).some((key) => !/^\d+$/.test(key));
}

/**
 * Convert a version 1 score and its ink, as the spec's "From version 1 to 2" says: every cut pass 1
 * (no `pass` stored) and without `ownInk`; each cut's markings, played cuts in order then archived
 * ones, on the cut's page, without a pass; of markings on a page equal as JSON, the first kept;
 * ink under a cut id no cut has dropped; `archived` dropped. Pages with no markings have no entry.
 */
export function _fromVersion1(score: V1Score, ink: V1Ink | undefined): V2Stored {
  const { archived = [], cuts, ...rest } = score;
  const pages: Record<number, Marking[]> = {};
  // What is on each page already, as JSON, so an exact copy is kept once.
  const seen = new Map<number, Set<string>>();
  for (const c of [...cuts, ...archived]) {
    for (const m of ink?.[c.id] ?? []) {
      const json = JSON.stringify(m);
      const onPage = seen.get(c.page) ?? new Set<string>();
      seen.set(c.page, onPage);
      if (onPage.has(json)) continue;
      onPage.add(json);
      (pages[c.page] ??= []).push(m);
    }
  }
  return { score: { ...rest, cuts: cuts.map(({ ownInk: _, ...c }) => c) }, ink: pages };
}
