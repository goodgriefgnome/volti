// What Volti records about each original, and every rule about where its bytes are. Pure: no DOM, no
// storage. The records are kept by _record-store.ts; STORAGE.md is the spec for what is here.

import type { Found, Stamp } from './_types';

/** What is stored under `original:<id>`. */
export interface OriginalRecord {
  /** The library path: where it is, or where it was or would go. Always set. */
  path: string;
  /** Where its bytes are now. */
  where: Where;
  /** Each page's height / width, in page order. Missing until the original is first read. */
  aspects?: number[];
  /** The password that opens a PDF, '' for one that needs none; missing until it has been checked. */
  password?: string;
}

export type Where =
  /** In the linked folder at `path`, with its root's stamp (the linked folder's: `size` and `modified`). */
  | ({ kind: 'folder' } & Stamp)
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

/** The stamp in a `folder` place: every field but `kind`. */
export function _stampOf(where: Where & { kind: 'folder' }): Stamp {
  const { kind: _kind, ...stamp } = where;
  return stamp;
}

/** The `folder` place holding `stamp`. */
export function _folderWhere(stamp?: Stamp): Where {
  return { ...stamp, kind: 'folder' };
}

/** Whether two stamps are the same: the same keys, each value `===`; two missing are the same. */
export function _sameStamp(a: Stamp | undefined, b: Stamp | undefined): boolean {
  if (!a || !b) return !a && !b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && a[k] === b[k]);
}

/** What `known` is for the linked folder: each `folder` record's place. */
export function _knownOf(records: ReadonlyMap<string, OriginalRecord>): Map<string, Found> {
  const known = new Map<string, Found>();
  for (const [id, r] of records) if (r.where.kind === 'folder') known.set(id, { path: r.path, stamp: _stampOf(r.where) });
  return known;
}

/** The library's files: the ids whose records are in the root (`folder` while a folder is linked, `internal` otherwise), at their paths. */
export function _inRoot(records: ReadonlyMap<string, OriginalRecord>, linked: boolean): { id: string; path: string }[] {
  const kind = linked ? 'folder' : 'internal';
  return [...records].filter(([, r]) => r.where.kind === kind).map(([id, r]) => ({ id, path: r.path }));
}

/**
 * What a change a scan found means for the record of its id: the record to write, and the bytes of
 * a place given up; null when nothing changes. `found` missing: the id is gone from the root.
 * STORAGE.md, "One place per original".
 */
export function _applyUpdate(record: OriginalRecord | undefined, found: Found | undefined, linked: boolean): { next: OriginalRecord; drop?: { id: string; where: Where; path: string } } | null {
  if (!found) return record?.where.kind === 'folder' ? { next: { ...record, where: { kind: 'gone' } } } : null;
  const where = _folderWhere(found.stamp);
  if (!record) return { next: { path: found.path, where } };
  if (record.where.kind === 'folder') {
    return record.path === found.path && _sameStamp(_stampOf(record.where), found.stamp) ? null : { next: { ...record, path: found.path, where } };
  }
  // A lower place gives way to the folder. The id isn't known here: the caller fills in the drop's.
  if (_rank(record.where, linked) >= _rank(where, linked)) return null;
  return { next: { ...record, path: found.path, where }, drop: hasBytes(record.where) ? { id: '', where: record.where, path: record.path } : undefined };
}

/** Whether a place has bytes of its own to delete when the record leaves it. */
const hasBytes = (where: Where) => where.kind === 'internal' || where.kind === 'inbox' || where.kind === 'removed';

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
