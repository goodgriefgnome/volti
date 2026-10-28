// What the reader remembers, in the kv store: the one thing last read and where in it. The only
// place the reader touches storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import type { LastRead } from './_last-read';

export const loadLastRead = () => kv.get<LastRead>(keys.lastRead);
export const saveLastRead = (last: LastRead) => kv.set(keys.lastRead, last);
