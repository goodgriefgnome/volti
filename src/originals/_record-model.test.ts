import { describe, expect, it } from 'vitest';
import { _applyUpdate, _bytesName, _folderWhere, _inRoot, _KEEP_MS, _knownOf, _sameStamp, _stampOf, _toPurge, type OriginalRecord } from './_record-model';

const records = (o: Record<string, OriginalRecord>) => new Map(Object.entries(o));
const folderRec = (path: string, size = 1, modified = 1): OriginalRecord => ({ path, where: { kind: 'folder', size, modified } });
const internalRec = (path: string): OriginalRecord => ({ path, where: { kind: 'internal' } });

describe('_toPurge', () => {
  const rec = (removedAt: number): OriginalRecord => ({ path: 'A.pdf', where: { kind: 'removed', removedAt } });
  it('purges at exactly 7 days, not just under', () => {
    expect(_toPurge(records({ a: rec(0) }), _KEEP_MS)).toEqual(['a']);
    expect(_toPurge(records({ a: rec(0) }), _KEEP_MS - 1)).toEqual([]);
  });
  it('only purges removed records', () => {
    expect(_toPurge(records({ a: internalRec('A.pdf'), b: { path: 'B.pdf', where: { kind: 'gone' } } }), 10 * _KEEP_MS)).toEqual([]);
  });
});

describe('_bytesName', () => {
  it('names inbox bytes by id and removed bytes by time and id', () => {
    expect(_bytesName('ab', { kind: 'inbox', inboxAt: 3 })).toBe('ab');
    expect(_bytesName('ab', { kind: 'removed', removedAt: 3 })).toBe('3-ab');
  });
});

describe('stamps', () => {
  it('_stampOf and _folderWhere undo each other', () => {
    const where = _folderWhere({ size: 4, modified: 9 });
    expect(where).toEqual({ kind: 'folder', size: 4, modified: 9 });
    expect(_stampOf(where as never)).toEqual({ size: 4, modified: 9 });
  });
  it('_sameStamp compares whole stamps', () => {
    expect(_sameStamp({ size: 1, modified: 2 }, { modified: 2, size: 1 })).toBe(true);
    expect(_sameStamp({ size: 1 }, { size: 2 })).toBe(false);
    expect(_sameStamp({ size: 1 }, { size: 1, modified: 2 })).toBe(false);
    expect(_sameStamp({ size: 1, a: 2 }, { size: 1, b: 2 })).toBe(false);
    expect(_sameStamp(undefined, undefined)).toBe(true);
    expect(_sameStamp({}, undefined)).toBe(false);
  });
});

describe('_knownOf and _inRoot', () => {
  const recs = records({ f: folderRec('F.pdf', 3, 4), i: internalRec('I.pdf'), g: { path: 'G.pdf', where: { kind: 'gone' } } });
  it('_knownOf has only folder records, with their stamps', () => {
    expect([..._knownOf(recs)]).toEqual([['f', { path: 'F.pdf', stamp: { size: 3, modified: 4 } }]]);
  });
  it('_inRoot has folder records while linked, internal ones otherwise', () => {
    expect(_inRoot(recs, true)).toEqual([{ id: 'f', path: 'F.pdf' }]);
    expect(_inRoot(recs, false)).toEqual([{ id: 'i', path: 'I.pdf' }]);
  });
});

describe('_applyUpdate', () => {
  const at = { path: 'A.pdf', stamp: { size: 5, modified: 7 } };
  it('makes a record for a new id', () => {
    expect(_applyUpdate('x', undefined, at, true)).toEqual({ next: folderRec('A.pdf', 5, 7) });
  });
  it('moves a lower place to the folder, keeping aspects and password, dropping bytes it had', () => {
    for (const where of [{ kind: 'internal' }, { kind: 'inbox', inboxAt: 1 }, { kind: 'removed', removedAt: 2 }] as const) {
      const r = _applyUpdate('x', { path: 'Old.pdf', where, aspects: [1.4], password: 'x' }, at, true);
      expect(r?.next).toEqual({ path: 'A.pdf', where: { kind: 'folder', size: 5, modified: 7 }, aspects: [1.4], password: 'x' });
      expect(r?.drop).toEqual({ id: 'x', where, path: 'Old.pdf' });
    }
  });
  it('moves a gone record without a drop', () => {
    const r = _applyUpdate('x', { path: 'Old.pdf', where: { kind: 'gone' } }, at, true);
    expect(r?.next.where).toEqual({ kind: 'folder', size: 5, modified: 7 });
    expect(r?.drop).toBeUndefined();
  });
  it('changes nothing for a folder record as found', () => {
    expect(_applyUpdate('x', folderRec('A.pdf', 5, 7), at, true)).toBeNull();
  });
  it('updates the path or stamp of a folder record, keeping the rest', () => {
    const rec = { ...folderRec('Old.pdf', 5, 7), aspects: [1] };
    expect(_applyUpdate('x', rec, at, true)?.next).toEqual({ ...folderRec('A.pdf', 5, 7), aspects: [1] });
    expect(_applyUpdate('x', folderRec('A.pdf', 1, 1), at, true)?.next).toEqual(folderRec('A.pdf', 5, 7));
    expect(_applyUpdate('x', folderRec('A.pdf'), { path: 'A.pdf' }, true)?.next.where).toEqual({ kind: 'folder' });
  });
  it('makes a folder record gone, and leaves others alone', () => {
    expect(_applyUpdate('x', { ...folderRec('A.pdf'), password: 'p' }, undefined, true)?.next).toEqual({ path: 'A.pdf', where: { kind: 'gone' }, password: 'p' });
    expect(_applyUpdate('x', internalRec('A.pdf'), undefined, true)).toBeNull();
    expect(_applyUpdate('x', undefined, undefined, true)).toBeNull();
  });
});
