import { kv } from '../lib/idb';
import type { Setlist } from './model';

/*
 * Keys:
 *   setlists        string[], setlist ids, newest first
 *   setlist:<id>    the Setlist
 *   pos:set:<id>    { entry, cut }: the first cut on the screen you were reading
 * Cuts and markings are only ever stored in the piece.
 */

export interface SetlistPosition { entry: string; cut?: string }

export async function loadSetlists(): Promise<Setlist[]> {
  const ids = (await kv.get<string[]>('setlists')) ?? [];
  const all = await Promise.all(ids.map((id) => kv.get<Setlist>('setlist:' + id)));
  return all.filter((s): s is Setlist => !!s);
}

const setlistEntry = (s: Setlist): [string, unknown] => ['setlist:' + s.id, s];
const orderEntry = (all: readonly Setlist[]): [string, unknown] => ['setlists', all.map((s) => s.id)];

/** The records to write for the setlists that changed since `before`, and their order. */
export function changedEntries(all: readonly Setlist[], before: readonly Setlist[] = []): [string, unknown][] {
  const was = new Map(before.map((s) => [s.id, s]));
  return [orderEntry(all), ...all.filter((s) => was.get(s.id) !== s).map(setlistEntry)];
}

export const saveChanged = (all: readonly Setlist[], before: readonly Setlist[] = []) => kv.setMany(changedEntries(all, before));

export async function deleteSetlist(all: readonly Setlist[], id: string): Promise<void> {
  await kv.setMany([orderEntry(all.filter((s) => s.id !== id))]);
  await kv.del('setlist:' + id);
  await kv.del('pos:set:' + id);
}

export const loadPosition = (id: string) => kv.get<SetlistPosition>('pos:set:' + id);
export const savePosition = (id: string, p: SetlistPosition) => kv.set('pos:set:' + id, p);
