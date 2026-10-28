// What Volti records about each original, and every rule about where its bytes are. Pure: no DOM, no
// storage. The records are kept by _record-store.ts; STORAGE.md is the spec for what is here.

/** What is stored under `original:<id>`. */
export interface OriginalRecord {
  /** The library path: where it is, or where it was or would go. Always set. */
  path: string;
  /** Where its bytes are now. */
  where: Where;
  /** Each page's height / width, in page order. Missing until the original is first read. */
  aspects?: number[];
  /** The password that opened it, for a PDF that needed one. */
  password?: string;
}

export type Where =
  /** In the linked folder at `path`; the file's size and modified time when its id was worked out. */
  | { kind: 'folder'; size: number; modified: number }
  /** In Volti's own folder, at OPFS library/<path>. */
  | { kind: 'internal' }
  /** Shared to Volti and not added yet, at OPFS inbox/<id>; `path` is the name it would go at. */
  | { kind: 'inbox'; inboxAt: number }
  /** In Recently removed, at OPFS removed/<removedAt>-<id>; `path` is where it was. */
  | { kind: 'removed'; removedAt: number }
  /** Nowhere Volti can find: deleted outside Volti, or purged from Recently removed. */
  | { kind: 'gone' };

export type Kind = Where['kind'];

/** How long a removed file is kept. */
export const _KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** How good a place is: higher wins. `folder` counts only while the folder is linked. */
export function _rank(where: Where, linked: boolean): number {
  switch (where.kind) {
    case 'folder': return linked ? 4 : 0;
    case 'internal': return 3;
    case 'inbox': return 2;
    case 'removed': return 1;
    case 'gone': return 0;
  }
}

/** A file found in a listing. size and modified matter only for the linked folder. */
export interface _Found { path: string; id: string; size: number; modified: number }

export interface _Listing {
  /** The new record of each id whose record changes (whole records, to write). */
  changed: Map<string, OriginalRecord>;
  /** Bytes to delete: those of a place given up (the record before), or a found file that loses. */
  drop: { id: string; where: Where; path: string }[];
  /** Copies of an id at other paths than its canonical one: path → found file. */
  duplicates: Map<string, _Found>;
  /** Each id found, at its canonical path, to show in the library. */
  files: { id: string; path: string }[];
}

/** Whether a place has bytes of its own to delete when the record leaves it. */
const hasBytes = (where: Where) => where.kind === 'internal' || where.kind === 'inbox' || where.kind === 'removed';

/**
 * What a listing of `kind`'s files means for the records: STORAGE.md, "One place per original",
 * "Duplicates", and the listing rows of "What happens".
 */
export function _resolveListing(kind: 'folder' | 'internal', records: ReadonlyMap<string, OriginalRecord>, found: readonly _Found[], linked: boolean): _Listing {
  const out: _Listing = { changed: new Map(), drop: [], duplicates: new Map(), files: [] };
  const byId = new Map<string, _Found[]>();
  for (const f of found) byId.set(f.id, [...(byId.get(f.id) ?? []), f]);

  for (const [id, copies] of byId) {
    copies.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const record = records.get(id);
    // Sticky: the record's path stays canonical while a file with this id is still there.
    const sticky = record?.where.kind === kind ? copies.find((c) => c.path === record.path) : undefined;
    const canonical = sticky ?? copies[0];
    const where: Where = kind === 'folder' ? { kind: 'folder', size: canonical.size, modified: canonical.modified } : { kind: 'internal' };

    if (record && record.where.kind !== kind && _rank(where, linked) <= _rank(record.where, linked)) {
      // A better place has it: the found files give way.
      for (const c of copies) out.drop.push({ id, where, path: c.path });
      continue;
    }

    for (const c of copies) if (c !== canonical) out.duplicates.set(c.path, c);
    out.files.push({ id, path: canonical.path });

    if (!record) {
      out.changed.set(id, { path: canonical.path, where });
    } else if (record.where.kind === kind) {
      const same = record.path === canonical.path
        && (kind !== 'folder' || (record.where.kind === 'folder' && record.where.size === canonical.size && record.where.modified === canonical.modified));
      if (!same) out.changed.set(id, { ...record, path: canonical.path, where });
    } else {
      out.changed.set(id, { ...record, path: canonical.path, where });
      if (hasBytes(record.where)) out.drop.push({ id, where: record.where, path: record.path });
    }
  }

  for (const [id, record] of records) {
    if (record.where.kind === kind && !byId.has(id)) out.changed.set(id, { ...record, where: { kind: 'gone' } });
  }
  return out;
}

/** The ids whose removed copy is due to be purged at `now`: removed 7 days ago or more. */
export function _toPurge(records: ReadonlyMap<string, OriginalRecord>, now: number): string[] {
  return [...records].filter(([, r]) => r.where.kind === 'removed' && now - r.where.removedAt >= _KEEP_MS).map(([id]) => id);
}

/** The name a record's bytes have in OPFS's inbox/ (the id) or removed/ ("<removedAt>-<id>"). */
export function _bytesName(id: string, where: Where): string {
  if (where.kind === 'inbox') return id;
  if (where.kind === 'removed') return `${where.removedAt}-${id}`;
  throw new Error(`No bytes of its own in ${where.kind}`);
}
