import { describe, expect, it } from 'vitest';
import { _bytesName, _KEEP_MS, _resolveListing, _toPurge, type _Found, type OriginalRecord } from './_record-model';

const found = (path: string, id: string, size = 1, modified = 1): _Found => ({ path, id, size, modified });
const records = (o: Record<string, OriginalRecord>) => new Map(Object.entries(o));
const folderRec = (path: string, size = 1, modified = 1): OriginalRecord => ({ path, where: { kind: 'folder', size, modified } });
const internalRec = (path: string): OriginalRecord => ({ path, where: { kind: 'internal' } });

describe('_resolveListing: one kind', () => {
  it('makes a record for a new file', () => {
    const l = _resolveListing('folder', records({}), [found('A.pdf', 'a', 5, 7)], true);
    expect(l.changed.get('a')).toEqual(folderRec('A.pdf', 5, 7));
    expect(l.files).toEqual([{ id: 'a', path: 'A.pdf' }]);
    expect(l.drop).toEqual([]);
  });
  it('makes an internal record with no size', () => {
    expect(_resolveListing('internal', records({}), [found('A.pdf', 'a')], false).changed.get('a')).toEqual(internalRec('A.pdf'));
  });
  it('changes nothing for a file its record already says', () => {
    const l = _resolveListing('folder', records({ a: folderRec('A.pdf') }), [found('A.pdf', 'a')], true);
    expect(l.changed.size).toBe(0);
    expect(l.files).toEqual([{ id: 'a', path: 'A.pdf' }]);
  });
  it('moves the path of a renamed file, keeping aspects and password', () => {
    const rec = { ...folderRec('Old.pdf'), aspects: [1.4], password: 'x' };
    const l = _resolveListing('folder', records({ a: rec }), [found('New.pdf', 'a')], true);
    expect(l.changed.get('a')).toEqual({ ...rec, path: 'New.pdf' });
  });
  it('updates size and modified of a folder file', () => {
    const l = _resolveListing('folder', records({ a: folderRec('A.pdf', 1, 1) }), [found('A.pdf', 'a', 2, 3)], true);
    expect(l.changed.get('a')).toEqual(folderRec('A.pdf', 2, 3));
  });
});

describe('_resolveListing: duplicates', () => {
  it('takes the path that sorts first when there is no record', () => {
    const l = _resolveListing('folder', records({}), [found('B.pdf', 'a'), found('A.pdf', 'a')], true);
    expect(l.files).toEqual([{ id: 'a', path: 'A.pdf' }]);
    expect([...l.duplicates.keys()]).toEqual(['B.pdf']);
  });
  it('keeps the record\'s path while it is there, even if it sorts later', () => {
    const l = _resolveListing('folder', records({ a: folderRec('B.pdf') }), [found('A.pdf', 'a'), found('B.pdf', 'a')], true);
    expect(l.files).toEqual([{ id: 'a', path: 'B.pdf' }]);
    expect(l.changed.size).toBe(0);
    expect([...l.duplicates.keys()]).toEqual(['A.pdf']);
  });
  it('lets a duplicate take over when the canonical copy is gone', () => {
    const l = _resolveListing('folder', records({ a: folderRec('A.pdf') }), [found('B.pdf', 'a')], true);
    expect(l.changed.get('a')?.path).toBe('B.pdf');
    expect(l.duplicates.size).toBe(0);
  });
});

describe('_resolveListing: places', () => {
  it('moves an internal record to the folder and drops the internal bytes', () => {
    const l = _resolveListing('folder', records({ a: internalRec('In.pdf') }), [found('A.pdf', 'a', 4, 6)], true);
    expect(l.changed.get('a')).toEqual({ path: 'A.pdf', where: { kind: 'folder', size: 4, modified: 6 } });
    expect(l.drop).toEqual([{ id: 'a', where: { kind: 'internal' }, path: 'In.pdf' }]);
  });
  it('moves removed and inbox records to the folder, with a drop', () => {
    const l = _resolveListing('folder', records({
      r: { path: 'R.pdf', where: { kind: 'removed', removedAt: 9 } },
      i: { path: 'I.pdf', where: { kind: 'inbox', inboxAt: 8 } },
    }), [found('R.pdf', 'r'), found('I.pdf', 'i')], true);
    expect(l.changed.get('r')?.where.kind).toBe('folder');
    expect(l.changed.get('i')?.where.kind).toBe('folder');
    expect(l.drop.map((d) => d.where.kind).sort()).toEqual(['inbox', 'removed']);
  });
  it('moves a gone record without a drop', () => {
    const l = _resolveListing('folder', records({ a: { path: 'A.pdf', where: { kind: 'gone' } } }), [found('A.pdf', 'a')], true);
    expect(l.changed.get('a')?.where.kind).toBe('folder');
    expect(l.drop).toEqual([]);
  });
  it('drops an internal file whose id is in the linked folder', () => {
    const l = _resolveListing('internal', records({ a: folderRec('A.pdf') }), [found('In.pdf', 'a')], true);
    expect(l.changed.size).toBe(0);
    expect(l.files).toEqual([]);
    expect(l.drop).toEqual([{ id: 'a', where: { kind: 'internal' }, path: 'In.pdf' }]);
  });
  it('makes an internal file win over a folder record while no folder is linked', () => {
    const l = _resolveListing('internal', records({ a: folderRec('A.pdf') }), [found('In.pdf', 'a')], false);
    expect(l.changed.get('a')).toEqual(internalRec('In.pdf'));
    expect(l.drop).toEqual([]);
  });
  it('marks a record of this kind not found as gone, and leaves other kinds', () => {
    const l = _resolveListing('folder', records({ a: { ...folderRec('A.pdf'), password: 'p' }, b: internalRec('B.pdf') }), [], true);
    expect(l.changed.get('a')).toEqual({ path: 'A.pdf', where: { kind: 'gone' }, password: 'p' });
    expect(l.changed.has('b')).toBe(false);
  });
});

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
