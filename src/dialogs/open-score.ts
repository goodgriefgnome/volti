// Opening a score in the library, for a dialog that shows its pages (choosing an excerpt) without
// the reader. The reader opens scores its own way, in reader/_open-scores.ts.

import type { ExcerptSource } from './thumb-strip';
import { askPassword } from '../dialogs/passwords';
import { titleOf } from '../originals/path-utils';
import { type SourceFile } from '../originals/types';
import { loadSavedScore, loadScore, saveScore } from '../scores/store';
import { dpr } from '../ui/dom';

/** A score and its original's pages, open until `close`. */
export interface LibraryScore extends ExcerptSource {
  close(): void;
}

/**
 * Open a score and read its file, asking for its password if need be. A score opened for the first
 * time is saved straight away, so the cut ids an excerpt chosen now names are the ones the score keeps.
 */
export async function openScore(o: SourceFile): Promise<LibraryScore> {
  const cache = await (await o.read(askPassword)).pages();
  try {
    const aspects = await cache.allAspects();
    const fresh = !(await loadSavedScore(o.id));
    const { state } = await loadScore(o.id, titleOf(o.path), aspects);
    if (fresh) await saveScore(state);
    return {
      state,
      aspects,
      page: (p, w) => cache.render(p + 1, w, Math.round(w * aspects[p]), dpr()),
      close: () => cache.destroy(),
    };
  } catch (e) {
    cache.destroy();
    throw e;
  }
}
