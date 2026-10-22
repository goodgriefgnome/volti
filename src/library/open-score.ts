// Opening a score in the library, for a dialog that shows its pages (choosing an excerpt) without
// the reader. The reader opens scores its own way, in reader/open-scores.ts.

import type { Original } from '../originals/originals';
import { openPdf } from '../originals/pdf';
import { loadScore } from '../scores/store';
import type { ExcerptSource } from '../ui/excerpt-picker';

/** A score and its original, open until `close`. */
export interface LibraryScore extends ExcerptSource {
  close(): void;
}

export async function openScore(o: Original): Promise<LibraryScore> {
  const cache = await openPdf(await o.getFile());
  try {
    const aspects = await cache.allAspects();
    const { state } = await loadScore(o.id, o.title, aspects);
    const dpr = window.devicePixelRatio || 1;
    return {
      state,
      aspects,
      page: (p, w) => cache.render(p + 1, w, Math.round(w * aspects[p]), dpr),
      close: () => cache.destroy(),
    };
  } catch (e) {
    cache.destroy();
    throw e;
  }
}
