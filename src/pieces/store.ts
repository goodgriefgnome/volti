import { kv } from '../lib/idb';
import type { ScoreInk } from '../ink/model';
import { newPiece, type Aspects, type PieceInk, type Piece, type State } from './model';

/*
 * Keys, one piece per score for now, so the piece id is the score id:
 *   piece:<id>  the Piece
 *   ink:<id>    PieceInk, strokes by cut id (before pieces: ScoreInk, strokes by page number)
 *   pos:<id>    the id of the first cut on the screen you were reading
 * The piece and its ink are always written together, so a piece record means the ink is by cut.
 */

/** A score from before pieces: one cut per page, carrying that page's ink and reading position. */
export function migrate(id: string, title: string, aspects: Aspects, ink: ScoreInk | undefined, page: number | undefined): { state: State; position?: string } {
  const piece = newPiece(id, id, title, aspects);
  const byCut: PieceInk = {};
  piece.cuts = piece.cuts.map((c) => {
    const strokes = ink?.[c.page + 1];
    if (!strokes?.length) return c;
    byCut[c.id] = strokes;
    return { ...c, ownInk: true };
  });
  return { state: { piece, ink: byCut }, position: page ? piece.cuts[page - 1]?.id : undefined };
}

/** Drop cuts of pages the file no longer has; a piece left with nothing starts again from the pages. */
export function forPages(s: State, aspects: Aspects): State {
  const ok = (c: { page: number }) => c.page < aspects.length;
  const piece: Piece = { ...s.piece, cuts: s.piece.cuts.filter(ok), archived: s.piece.archived.filter(ok) };
  if (!piece.cuts.length) piece.cuts = newPiece(piece.id, piece.sourceId, piece.title, aspects).cuts;
  return { ...s, piece };
}

export async function loadPiece(id: string, title: string, aspects: Aspects): Promise<{ state: State; position?: string }> {
  const piece = await kv.get<Piece>('piece:' + id);
  if (piece) {
    const [ink, position] = await Promise.all([kv.get<PieceInk>('ink:' + id), kv.get<string>('pos:' + id)]);
    return { state: forPages({ piece: { ...piece, archived: piece.archived ?? [] }, ink: ink ?? {} }, aspects), position };
  }
  const [ink, page] = await Promise.all([kv.get<ScoreInk>('ink:' + id), kv.get<number>('page:' + id)]);
  const m = migrate(id, title, aspects, ink, page);
  await kv.setMany([['piece:' + id, m.state.piece], ['ink:' + id, m.state.ink], ['pos:' + id, m.position]]);
  return m;
}

/** Saves at most every half second while editing, and immediately on flush(). */
export function pieceSaver(id: string, state: () => State) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    const s = state();
    return kv.setMany([['piece:' + id, s.piece], ['ink:' + id, s.ink]]);
  };
  return {
    soon() { timer ??= setTimeout(save, 500); },
    async flush() { if (timer) { clearTimeout(timer); await save(); } },
  };
}

export const savePosition = (id: string, cutId: string) => kv.set('pos:' + id, cutId);
