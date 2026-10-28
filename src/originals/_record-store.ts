// The records of the originals Volti knows, kept in IndexedDB under `original:<id>`: the only code
// that reads or writes those keys. It keeps a copy of every record in memory so the rest of
// originals/ can look one up without waiting. The service worker loads this module too, so no DOM
// and no pdf.js. The rules about records are in _record-model.ts, and STORAGE.md.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import type { OriginalRecord } from './_record-model';

/** Aspects and a password that are fixed by an original's contents. */
type Contents = Pick<OriginalRecord, 'aspects' | 'password'>;

/** The records as last loaded or written by this page. */
let loaded = new Map<string, OriginalRecord>();
/** Contents noted for ids that have no record yet: merged into the record when it is first made. */
const noted = new Map<string, Contents>();

const PREFIX = keys.original('');

/** Read every record afresh from IndexedDB into memory. Call before each listing, and when the app opens with ?shared. */
export async function _loadRecords(): Promise<ReadonlyMap<string, OriginalRecord>> {
  const entries = await kv.entries<OriginalRecord>(PREFIX);
  loaded = new Map(entries.map(([key, record]) => [key.slice(PREFIX.length), record]));
  return loaded;
}

/** A record as last loaded or written by this page. */
export const _record = (id: string): OriginalRecord | undefined => loaded.get(id);

export const _records = (): ReadonlyMap<string, OriginalRecord> => loaded;

/** The aspects and password known for `id`: its record's, else those noted before it has one. */
export const _contents = (id: string): Contents => loaded.get(id) ?? noted.get(id) ?? {};

type Change = (old: OriginalRecord | undefined) => OriginalRecord | undefined;

/** What `change` makes of the stored record: a new record gets what was noted for its id. */
function applied(id: string, change: Change, old: OriginalRecord | undefined): OriginalRecord | undefined {
  const record = change(old);
  if (!old && record && noted.has(id)) return { ...noted.get(id), ...record };
  return record;
}

/** Remember in memory what was written. */
function wrote(id: string, record: OriginalRecord | undefined) {
  if (record) {
    loaded.set(id, record);
    noted.delete(id);
  } else {
    loaded.delete(id);
  }
}

/**
 * Change one record in a single transaction: `fn` is given the stored record (not the copy in
 * memory) and returns the new one, or undefined to delete it. The copy in memory is updated to
 * what was written.
 */
export async function _updateRecord(id: string, fn: Change): Promise<void> {
  return _updateRecords([[id, fn]]);
}

/** As _updateRecord, for several ids in one transaction. */
export async function _updateRecords(changes: [string, Change][]): Promise<void> {
  if (!changes.length) return;
  const written = new Map<string, OriginalRecord | undefined>();
  await kv.updateMany(changes.map(([id, fn]) => [keys.original(id), (old: unknown) => {
    const record = applied(id, fn, old as OriginalRecord | undefined);
    written.set(id, record);
    return record;
  }]));
  for (const [id, record] of written) wrote(id, record);
}

/**
 * Note `aspects` or a `password` for `id`: written to its record if it has one, else kept in
 * memory and written when _updateRecord first makes its record.
 */
export async function _noteContents(id: string, contents: Contents): Promise<void> {
  const now = _contents(id);
  if ((contents.aspects === undefined || sameAspects(contents.aspects, now.aspects)) && (contents.password === undefined || contents.password === now.password)) return;
  let written: OriginalRecord | undefined;
  await kv.update<OriginalRecord>(keys.original(id), (old) => (written = old && { ...old, ...defined(contents) }));
  if (written) loaded.set(id, written);
  else noted.set(id, { ...noted.get(id), ...defined(contents) });
}

const defined = (c: Contents): Contents => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));

const sameAspects = (a: readonly number[], b: readonly number[] | undefined) => !!b && a.length === b.length && a.every((x, i) => x === b[i]);
