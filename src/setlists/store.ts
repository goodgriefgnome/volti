// Loading, saving and deleting setlists in the kv store, and the setlist scores were last added to.
// The only place setlists touch storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import type { Setlist } from './model';

export async function loadSetlists(): Promise<Setlist[]> {
  const ids = (await kv.get<string[]>(keys.setlists)) ?? [];
  const all = await Promise.all(ids.map((id) => kv.get<Setlist>(keys.setlist(id))));
  return all.filter((s): s is Setlist => !!s);
}

const setlistEntry = (s: Setlist): [string, unknown] => [keys.setlist(s.id), s];
const orderEntry = (all: readonly Setlist[]): [string, unknown] => [keys.setlists, all.map((s) => s.id)];

/** The records to write for the setlists that changed since `before`, and their order. */
export function _changedEntries(all: readonly Setlist[], before: readonly Setlist[] = []): [string, unknown][] {
  const was = new Map(before.map((s) => [s.id, s]));
  return [orderEntry(all), ...all.filter((s) => was.get(s.id) !== s).map(setlistEntry)];
}

/** Save the setlists that changed since `before`, with any other records that must agree with them. */
export const saveChanged = (all: readonly Setlist[], before: readonly Setlist[] = [], also: [string, unknown][] = []) =>
  kv.setMany([...also, ..._changedEntries(all, before)]);

export async function deleteSetlist(all: readonly Setlist[], id: string): Promise<void> {
  await kv.setMany([orderEntry(all.filter((s) => s.id !== id))]);
  await kv.del(keys.setlist(id));
}

/** The setlist a score was last added to (see `defaultSetlist`). */
export const loadLastAddedTo = () => kv.get<string>(keys.lastAddedTo);
export const saveLastAddedTo = (id: string) => kv.set(keys.lastAddedTo, id);
