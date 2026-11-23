// The reader's device settings in the kv store (settings/turning.ts holds them in memory).

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { advanceFrom, setAdvance, setSmallestScalePercent, smallestScaleFrom, type Advance } from './turning';

/** Load Advance and the smallest scale; what isn't stored keeps its default. */
export async function loadTurningSettings(): Promise<void> {
  setAdvance(advanceFrom(await kv.get<unknown>(keys.advance)));
  setSmallestScalePercent(smallestScaleFrom(await kv.get<unknown>(keys.smallestPageScale)));
}

export async function saveAdvance(a: Advance): Promise<void> {
  setAdvance(a);
  await kv.set(keys.advance, a);
}

export async function saveSmallestScale(percent: number): Promise<void> {
  setSmallestScalePercent(percent);
  await kv.set(keys.smallestPageScale, percent);
}
