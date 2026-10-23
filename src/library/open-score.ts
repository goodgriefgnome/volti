// Opening a score in the library, for a dialog that shows its pages (choosing an excerpt) without
// the reader. The reader opens scores its own way, in reader/open-scores.ts.

import type { ExcerptSource } from '../dialogs/excerpt-picker';
import { askPassword } from '../dialogs/passwords';
import { openOriginal } from '../originals/open';
import type { Original } from '../originals/originals';
import { loadSavedScore, loadScore, saveScore } from '../scores/store';
import { dpr } from '../ui/dom';

/** A score and its original, open until `close`. */
export interface LibraryScore extends ExcerptSource {
  close(): void;
}

/**
 * Open a score and its original. A score opened for the first time is saved straight away, so
 * the cut ids an excerpt chosen now names are the ones the score keeps.
 */
export async function openScore(o: Original): Promise<LibraryScore> {
  const cache = await openOriginal(o, askPassword);
  try {
    const aspects = await cache.allAspects();
    const fresh = !(await loadSavedScore(o.id));
    const { state } = await loadScore(o.id, o.title, aspects);
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
