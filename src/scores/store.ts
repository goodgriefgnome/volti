// Loading and saving scores and their ink in the kv store. The only place scores
// touch storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { _forPages, newScore, type Aspects, type Score, type ScoreInk, type State } from './model';

/** A score as stored: the key gives its id. */
type StoredScore = Omit<Score, 'id'>;

/** A score as stored, without its id. */
const stored = ({ id: _, ...rest }: Score): StoredScore => rest;

/** A score as loaded: its id from the key, and no `id` or `title` an earlier version stored in it. */
const loaded = (id: string, s: StoredScore): Score => {
  const { id: _, title: __, ...rest } = s as StoredScore & { id?: string; title?: string };
  return { ...rest, id };
};

/** A score as saved, or a new one for an original opened the first time, with the page shapes it is given. */
export async function loadScore(id: string, aspects: Aspects): Promise<{ state: State }> {
  const [score, ink] = await Promise.all([kv.get<StoredScore>(keys.score(id)), kv.get<ScoreInk>(keys.ink(id))]);
  if (!score) return { state: { score: newScore(id, aspects), ink: {} } };
  return { state: _forPages({ score: loaded(id, score), ink: ink ?? {} }, aspects) };
}

/** The records a score and its ink are saved as, always together. */
export const scoreEntries = (s: State): [string, unknown][] => [[keys.score(s.score.id), stored(s.score)], [keys.ink(s.score.id), s.ink]];

/** Save a score and its ink. */
export const saveScore = (s: State) => kv.setMany(scoreEntries(s));

/** The record of a score alone, for a change that leaves its ink as it is (such as naming an excerpt). */
export const scoreEntry = (s: Score): [string, unknown] => [keys.score(s.id), stored(s)];

/** A score as last saved, without opening its original: for showing what a setlist plays. */
export const loadSavedScore = async (id: string): Promise<Score | undefined> => {
  const score = await kv.get<StoredScore>(keys.score(id));
  return score && loaded(id, score);
};
