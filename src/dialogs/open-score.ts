// Opening a score in the library, for a dialog that shows its pages (choosing an excerpt) without
// the reader. The reader opens scores its own way, in reader/_open-scores.ts.

import type { ExcerptSource } from './thumb-strip';
import { askPassword } from '../dialogs/passwords';
import { type SourceFile } from '../originals/types';
import { loadSavedScore, loadScore, saveScore } from '../scores/store';
import { dpr } from '../ui/dom';

/** A score and its original's pages. */
export type LibraryScore = ExcerptSource;

/**
 * Open a score and read its file, asking for its password if need be. A score opened for the first
 * time is saved straight away, so the cut ids an excerpt chosen now names are the ones the score keeps.
 */
export async function openScore(o: SourceFile): Promise<LibraryScore> {
  const original = await o.read(askPassword);
  const aspects = await original.aspects();
  const fresh = !(await loadSavedScore(o.id));
  const { state } = await loadScore(o.id, aspects);
  if (fresh) await saveScore(state);
  return {
    state,
    aspects,
    page: async (p, w) => (await original.draw(p + 1, Math.round(w * dpr()))).canvas,
  };
}
