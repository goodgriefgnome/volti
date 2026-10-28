// Loading and saving scores, their ink and reading positions in the kv store. The only place scores
// touch storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { _forPages, newScore, type Aspects, type Score, type ScoreInk, type State } from './model';

/**
 * A score as saved, or a new one for an original opened the first time. The original's page
 * shapes are kept too, for laying out the score's pages without opening it.
 */
export async function loadScore(id: string, title: string, aspects: Aspects): Promise<{ state: State; position?: string }> {
  const [score, ink, position, was] = await Promise.all([
    kv.get<Score>(keys.score(id)), kv.get<ScoreInk>(keys.ink(id)), kv.get<string>(keys.pos(id)), loadAspects(id),
  ]);
  if (!was || was.length !== aspects.length || was.some((a, i) => a !== aspects[i])) void kv.set(keys.aspects(id), [...aspects]);
  if (!score) return { state: { score: newScore(id, title, aspects), ink: {} } };
  return { state: _forPages({ score, ink: ink ?? {} }, aspects), position };
}

/** The records a score and its ink are saved as, always together. */
export const scoreEntries = (s: State): [string, unknown][] => [[keys.score(s.score.id), s.score], [keys.ink(s.score.id), s.ink]];

/** Save a score and its ink. */
export const saveScore = (s: State) => kv.setMany(scoreEntries(s));

/** The record of a score alone, for a change that leaves its ink as it is (such as naming an excerpt). */
export const scoreEntry = (s: Score): [string, unknown] => [keys.score(s.id), s];

/** A score as last saved, without opening its original: for showing what a setlist plays. */
export const loadSavedScore = (id: string) => kv.get<Score>(keys.score(id));

/** The original's page shapes as last opened; undefined if it hasn't been opened since they were kept. */
export const loadAspects = (id: string) => kv.get<Aspects>(keys.aspects(id));

export const saveScorePosition = (id: string, cutId: string) => kv.set(keys.pos(id), cutId);
