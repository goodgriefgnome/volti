import type { Stroke } from '../markings/stroke';
import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { newPiece, type Aspects, type PieceInk, type Piece, type State } from './model';

/** Ink from before pieces: strokes by page number. */
export type ScoreInk = Record<number, Stroke[]>;

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
  const piece = await kv.get<Piece>(keys.piece(id));
  if (piece) {
    const [ink, position] = await Promise.all([kv.get<PieceInk>(keys.ink(id)), kv.get<string>(keys.pos(id))]);
    return { state: forPages({ piece: { ...piece, archived: piece.archived ?? [] }, ink: ink ?? {} }, aspects), position };
  }
  const [ink, page] = await Promise.all([kv.get<ScoreInk>(keys.ink(id)), kv.get<number>(keys.oldPage(id))]);
  const m = migrate(id, title, aspects, ink, page);
  await kv.setMany([[keys.piece(id), m.state.piece], [keys.ink(id), m.state.ink], [keys.pos(id), m.position]]);
  return m;
}

/** The records a piece and its ink are saved as, always together. */
export const pieceEntries = (s: State): [string, unknown][] => [[keys.piece(s.piece.id), s.piece], [keys.ink(s.piece.id), s.ink]];

/** A piece as last saved, without opening its file: for showing what a setlist plays. */
export const loadSavedPiece = (id: string) => kv.get<Piece>(keys.piece(id));

export const savePosition = (id: string, cutId: string) => kv.set(keys.pos(id), cutId);
