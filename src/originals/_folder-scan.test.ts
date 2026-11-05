import { describe, expect, it } from 'vitest';
import { _FolderScan, _placeOf } from './_folder-scan';
import type { Found } from './_types';

const st = (size: number, modified = 1) => ({ size, modified });
const known = (o: Record<string, Found>) => new Map(Object.entries(o));
const seen = (path: string, id: string, stamp = st(1)) => ({ path, id, stamp });

describe('_placeOf', () => {
  it('is undefined with no copy', () => {
    expect(_placeOf({ path: 'A.pdf' }, [])).toBeUndefined();
  });
  it('stays at its path while a copy is there, with that copy\'s stamp', () => {
    expect(_placeOf({ path: 'B.pdf', stamp: st(1) }, [seen('A.pdf', 'a'), seen('B.pdf', 'a', st(2))])).toEqual({ path: 'B.pdf', stamp: st(2) });
  });
  it('goes to the copy that sorts first when its path has no copy', () => {
    expect(_placeOf({ path: 'X.pdf' }, [seen('C.pdf', 'a'), seen('B.pdf', 'a')])?.path).toBe('B.pdf');
  });
  it('goes to the first copy seen for an id that was nowhere', () => {
    expect(_placeOf(undefined, [seen('C.pdf', 'a'), seen('B.pdf', 'a')])?.path).toBe('C.pdf');
  });
});

describe('_FolderScan', () => {
  it('says nothing for a known file seen as known', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) } }));
    expect(s.see(seen('A.pdf', 'a'))).toEqual([]);
    expect(s.finish()).toEqual([]);
  });
  it('says a known file seen with a new stamp', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) } }));
    expect(s.see(seen('A.pdf', 'a', st(2)))).toEqual([{ id: 'a', found: { path: 'A.pdf', stamp: st(2) } }]);
  });
  it('says a new id at its path', () => {
    const s = new _FolderScan(known({}));
    expect(s.see(seen('A.pdf', 'a'))).toEqual([{ id: 'a', found: { path: 'A.pdf', stamp: st(1) } }]);
  });
  it('puts a new id with two copies at the first seen, even when the second sorts first', () => {
    const s = new _FolderScan(known({}));
    s.see(seen('B.pdf', 'a'));
    expect(s.see(seen('A.pdf', 'a'))).toEqual([]);
    expect([...s.hidden().keys()]).toEqual(['A.pdf']);
  });
  it('keeps an id at its known path when a copy that sorts first is seen after it', () => {
    const s = new _FolderScan(known({ a: { path: 'B.pdf', stamp: st(1) } }));
    expect(s.see(seen('B.pdf', 'a'))).toEqual([]);
    expect(s.see(seen('A.pdf', 'a'))).toEqual([]);
    expect([...s.hidden().keys()]).toEqual(['A.pdf']);
  });
  it('says a known id whose path is not seen at its copy at once', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) } }));
    expect(s.see(seen('B.pdf', 'a'))).toEqual([{ id: 'a', found: { path: 'B.pdf', stamp: st(1) } }]);
    expect(s.finish()).toEqual([]);
  });
  it('takes the copy that sorts first when the known path is gone', () => {
    const s = new _FolderScan(known({ a: { path: 'X.pdf', stamp: st(1) } }));
    s.see(seen('C.pdf', 'a'));
    expect(s.see(seen('B.pdf', 'a'))).toEqual([{ id: 'a', found: { path: 'B.pdf', stamp: st(1) } }]);
    expect([...s.hidden().keys()]).toEqual(['C.pdf']);
  });
  it('says a known id with no copy gone only at finish', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) }, b: { path: 'B.pdf', stamp: st(1) } }));
    expect(s.see(seen('B.pdf', 'b'))).toEqual([]);
    expect(s.finish()).toEqual([{ id: 'a' }]);
  });
  it('after finish, says a new id at a path seen with another id, and the old id at its other copy', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) } }));
    s.see(seen('A.pdf', 'a'));
    s.see(seen('B.pdf', 'a'));
    s.finish();
    expect(s.see(seen('A.pdf', 'z', st(2)))).toEqual([
      { id: 'z', found: { path: 'A.pdf', stamp: st(2) } },
      // 'a' still has its copy at B.pdf: it moves there.
      { id: 'a', found: { path: 'B.pdf', stamp: st(1) } },
    ]);
  });
  it('after finish, says the old id gone when it has no other copy', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) } }));
    s.see(seen('A.pdf', 'a'));
    s.finish();
    expect(s.see(seen('A.pdf', 'z', st(2)))).toEqual([{ id: 'z', found: { path: 'A.pdf', stamp: st(2) } }, { id: 'a' }]);
  });
  it('hidden() is the copies that are not places', () => {
    const s = new _FolderScan(known({ a: { path: 'A.pdf', stamp: st(1) } }));
    s.see(seen('A.pdf', 'a'));
    s.see(seen('C.pdf', 'a', st(3)));
    s.see(seen('D.pdf', 'd'));
    expect([...s.hidden()]).toEqual([['C.pdf', { id: 'a', stamp: st(3) }]]);
  });
});
