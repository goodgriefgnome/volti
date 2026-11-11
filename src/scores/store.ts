// Loading and saving scores and their ink in the kv store. The only place scores
// touch storage.

import { glyphKeysIn } from '../markings/placed';
import { loadGlyphs } from '../markings/store';
import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { _forPages, newScore, type Aspects, type Score, type ScoreInk, type State } from './model';
import { _fromVersion1, _isVersion1, type V1Ink, type V1Score } from './_version1';

/** A score as stored: the key gives its id. */
type StoredScore = Omit<Score, 'id'>;

/** A score as stored, without its id. */
const stored = ({ id: _, ...rest }: Score): StoredScore => rest;

/** A score as loaded: its id from the key. */
const loaded = (id: string, s: StoredScore): Score => ({ ...s, id });

/** A score as saved, or a new one for an original opened the first time, with the aspects it is given. */
export async function loadScore(id: string, aspects: Aspects): Promise<{ state: State }> {
  const [score, ink] = await Promise.all([kv.get<StoredScore>(keys.score(id)), kv.get<ScoreInk>(keys.ink(id))]);
  if (!score) return { state: { score: newScore(id, aspects), ink: {} } };
  await loadGlyphs(glyphKeysIn(ink ?? {}));
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

/**
 * The step from version 1 to 2 of the stored data: each score still in version 1 (every `score:`
 * key) is converted with its ink, both written in one transaction.
 */
export async function scoresToVersion2(): Promise<void> {
  const prefix = keys.score('');
  for (const [key, score] of await kv.entries<V1Score>(prefix)) {
    const id = key.slice(prefix.length);
    const ink = await kv.get<V1Ink>(keys.ink(id));
    if (!_isVersion1(score, ink)) continue;
    const next = _fromVersion1(score, ink);
    await kv.setMany([[keys.score(id), next.score], [keys.ink(id), next.ink]]);
  }
}

/** What a score stored by version 2 of the stored data is in version 3: without the `id`, `title` and `names` (the named excerpts before `excerpts`, not carried over) of earlier versions. */
export function _scoreToVersion3(s: StoredScore & { id?: unknown; title?: unknown; names?: unknown }): StoredScore {
  const { id: _, title: __, names: ___, ...rest } = s;
  return rest;
}

/** Part of the step from version 2 to 3 of the stored data: every score without the fields of earlier versions. */
export async function scoresToVersion3(): Promise<void> {
  const prefix = keys.score('');
  for (const [key, score] of await kv.entries<Record<string, unknown>>(prefix)) {
    if (!('id' in score || 'title' in score || 'names' in score)) continue;
    await kv.update<StoredScore>(key, (s) => s && _scoreToVersion3(s));
  }
}
