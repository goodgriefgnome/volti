import { kv } from '../lib/idb';
import type { ScoreInk } from './model';

export const loadInk = async (scoreId: string): Promise<ScoreInk> => (await kv.get<ScoreInk>('ink:' + scoreId)) ?? {};

/** Saves at most every half second while writing, and immediately on flush(). */
export function inkSaver(scoreId: string, ink: () => ScoreInk) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => { timer = undefined; return kv.set('ink:' + scoreId, ink()); };
  return {
    soon() { timer ??= setTimeout(save, 500); },
    async flush() { if (timer) { clearTimeout(timer); await save(); } },
  };
}
