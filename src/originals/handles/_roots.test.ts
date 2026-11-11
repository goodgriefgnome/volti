import { describe, expect, it } from 'vitest';
import { hashBytes } from '../_filesystem-utils';
import { _fakeFolder } from './_fake';
import { InternalDirectoryHandleRoot, LinkedDirectoryHandleRoot } from './_roots';
import type { Known, Update, Updates } from '../_types';

const as = (f: ReturnType<typeof _fakeFolder>) => f as unknown as FileSystemDirectoryHandle;
const idOf = async (text: string) => hashBytes(new TextEncoder().encode(text).buffer as ArrayBuffer);
const text = (s: string) => new Blob([s]);

/** Every batch of a scan. */
async function scan(root: LinkedDirectoryHandleRoot, known: Known = new Map(), signal = new AbortController().signal): Promise<Updates[]> {
  const out: Updates[] = [];
  for await (const u of root.getUpdates(known, signal)) out.push(u);
  return out;
}
const changes = (batches: Updates[]): Update[] => batches.flatMap((b) => b.changes);

describe('file operations', () => {
  it('exists and reads', async () => {
    const f = _fakeFolder({ 'A/B.pdf': { bytes: 'hi' } });
    const root = new InternalDirectoryHandleRoot(as(f));
    expect(await root.exists('A/B.pdf')).toBe(true);
    expect(await root.exists('A/C.pdf')).toBe(false);
    expect(await root.exists('X/C.pdf')).toBe(false);
    expect(await (await root.read('A/B.pdf')).text()).toBe('hi');
  });

  it('writes into a new subfolder and over a file', async () => {
    const f = _fakeFolder({ 'B.pdf': { bytes: 'old' } });
    const root = new InternalDirectoryHandleRoot(as(f));
    expect((await root.write('New/Deep/A.pdf', text('a'))).stamp).toBeUndefined();
    await root.write('B.pdf', text('new'));
    expect(f.text('New/Deep/A.pdf')).toBe('a');
    expect(f.text('B.pdf')).toBe('new');
  });

  it('leaves no file when a write fails part way', async () => {
    const f = _fakeFolder({});
    const root = new InternalDirectoryHandleRoot(as(f));
    f.failWrite = true;
    await expect(root.write('A.pdf', text('a'))).rejects.toThrow('Write failed');
    expect(f.paths()).toEqual([]);
  });

  it('moves within a folder and into another, making it', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'a' } });
    const root = new InternalDirectoryHandleRoot(as(f));
    expect(await root.move('A.pdf', 'B.pdf')).toMatchObject({ path: 'B.pdf' });
    expect(await root.move('B.pdf', 'New/C.pdf')).toMatchObject({ path: 'New/C.pdf' });
    expect(f.paths()).toEqual(['New/C.pdf']);
    expect(f.text('New/C.pdf')).toBe('a');
  });

  it('copies where moving is not possible', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'a' } }, { noMove: true });
    const root = new InternalDirectoryHandleRoot(as(f));
    const moved = await root.move('A.pdf', 'X/B.pdf');
    expect(moved).toMatchObject({ path: 'X/B.pdf' });
    expect('leftBehind' in moved).toBe(false);
    expect(f.paths()).toEqual(['X/B.pdf']);
  });

  it('says when the file at from could not be deleted after copying', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'a' } }, { noMove: true });
    const root = new InternalDirectoryHandleRoot(as(f));
    f.failRemove = true;
    expect(await root.move('A.pdf', 'B.pdf')).toMatchObject({ path: 'B.pdf', leftBehind: true });
    expect(f.paths()).toEqual(['A.pdf', 'B.pdf']);
  });

  it('says when only the case changes and the root can\'t do that', async () => {
    const f = _fakeFolder({ 'a.pdf': { bytes: 'a' } }, { noMove: true, ignoreCase: true });
    const root = new InternalDirectoryHandleRoot(as(f));
    expect(await root.move('a.pdf', 'A.pdf')).toEqual({ caseOnly: true });
    expect(f.paths()).toEqual(['a.pdf']);
  });

  it('changes only the case where moving can', async () => {
    const f = _fakeFolder({ 'Mass/a.pdf': { bytes: 'a' } }, { ignoreCase: true });
    const root = new InternalDirectoryHandleRoot(as(f));
    expect(await root.move('Mass/a.pdf', 'mass/A.pdf')).toMatchObject({ path: 'Mass/A.pdf' });
    expect(f.paths()).toEqual(['Mass/A.pdf']);
  });

  it('moves nothing when the name is the same', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'a' } });
    const root = new InternalDirectoryHandleRoot(as(f));
    expect(await root.move('A.pdf', 'A.pdf')).toMatchObject({ path: 'A.pdf' });
    expect(f.paths()).toEqual(['A.pdf']);
  });

  describe('remove', () => {
    const inBin = (bin: ReturnType<typeof _fakeFolder>) => bin.paths().map((p) => [p, bin.text(p)]);

    it('moves a file of Volti\'s own folder into the removed folder', async () => {
      const f = _fakeFolder({ 'A/B.pdf': { bytes: 'a' } }), bin = _fakeFolder({});
      const { copiedAt } = await new InternalDirectoryHandleRoot(as(f), async () => as(bin)).remove('A/B.pdf', 'id1') as { copiedAt: number };
      expect(f.paths()).toEqual([]);
      expect(inBin(bin)).toEqual([[`${copiedAt}-id1`, 'a']]);
    });

    it('copies a file of the linked folder, then deletes it', async () => {
      const f = _fakeFolder({ 'A/B.pdf': { bytes: 'a' } }), bin = _fakeFolder({});
      const { copiedAt } = await new LinkedDirectoryHandleRoot(as(f), async () => as(bin)).remove('A/B.pdf', 'id1') as { copiedAt: number };
      expect(f.paths()).toEqual([]);
      expect(inBin(bin)).toEqual([[`${copiedAt}-id1`, 'a']]);
    });

    it('copies where the file system can\'t move', async () => {
      const f = _fakeFolder({ 'B.pdf': { bytes: 'a' } }, { noMove: true }), bin = _fakeFolder({});
      await new InternalDirectoryHandleRoot(as(f), async () => as(bin)).remove('B.pdf', 'id1');
      expect(f.paths()).toEqual([]);
      expect(bin.paths()).toHaveLength(1);
    });

    it('leaves the file, and no copy, when it can\'t be deleted', async () => {
      const f = _fakeFolder({ 'B.pdf': { bytes: 'a' } }), bin = _fakeFolder({});
      f.failRemove = true;
      await expect(new LinkedDirectoryHandleRoot(as(f), async () => as(bin)).remove('B.pdf', 'id1')).rejects.toThrow('Remove failed');
      expect(f.paths()).toEqual(['B.pdf']);
      expect(bin.paths()).toEqual([]);
    });

    it('has no bin of its own to take a file out of', async () => {
      const root = new LinkedDirectoryHandleRoot(as(_fakeFolder({})), async () => as(_fakeFolder({})));
      expect(root.canUndelete()).toBe(false);
      await expect(root.undelete()).rejects.toThrow();
    });
  });
});

describe('stamps and access', () => {
  it('the linked root stamps what it writes and moves; the internal root does not', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'abc', modified: 55 } });
    const linked = new LinkedDirectoryHandleRoot(as(f));
    const written = await linked.write('B.pdf', text('hello'));
    expect(written.stamp).toEqual({ size: 5, modified: written.file.lastModified });
    expect((await linked.move('A.pdf', 'C.pdf') as { stamp: unknown }).stamp).toEqual({ size: 3, modified: 55 });
    expect((await new InternalDirectoryHandleRoot(as(_fakeFolder({ 'A.pdf': { bytes: 'x' } }))).move('A.pdf', 'B.pdf') as { stamp: unknown }).stamp).toBeUndefined();
  });

  it('the linked root is ready or locked by its permission, and asks when needed', async () => {
    const f = _fakeFolder({}, { permission: 'prompt' });
    const root = new LinkedDirectoryHandleRoot(as(f));
    expect(await root.access()).toBe('locked');
    f.requestAnswer = 'denied';
    await expect(root.needAccess('read')).rejects.toThrow('Volti has no access to the scores folder.');
    f.requestAnswer = 'granted';
    await expect(root.needAccess('readwrite')).resolves.toBeUndefined();
    expect(await new LinkedDirectoryHandleRoot(as(_fakeFolder({}))).access()).toBe('ready');
  });

  it('the internal root is ready and says nothing in a scan', async () => {
    const root = new InternalDirectoryHandleRoot(as(_fakeFolder({ 'A.pdf': { bytes: 'a' } })));
    expect(await root.access()).toBe('ready');
    const out: Updates[] = [];
    for await (const u of root.getUpdates()) out.push(u);
    expect(out).toEqual([]);
  });
});

describe('LinkedDirectoryHandleRoot.getUpdates', () => {
  it('does not read known paths with the same stamps, and says nothing', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'aa', modified: 7 } });
    const root = new LinkedDirectoryHandleRoot(as(f));
    const known = new Map([['a', { path: 'A.pdf', stamp: { size: 2, modified: 7 } }]]);
    expect(changes(await scan(root, known))).toEqual([]);
    // Pass 2 gets the file to see its stamp, but doesn't hash it: nothing was said.
    expect(f.reads.get('A.pdf')).toBe(1);
  });

  it('hashes, stamps and says new files, counting left down to 0', async () => {
    const files: Record<string, { bytes: string; modified: number }> = {};
    for (let i = 0; i < 20; i++) files[`F${i}.pdf`] = { bytes: `file ${i}`, modified: 10 + i };
    const batches = await scan(new LinkedDirectoryHandleRoot(as(_fakeFolder(files))));
    expect(batches[0].left).toBe(20);
    const lefts = batches.map((b) => b.left);
    expect(lefts).toEqual([...lefts].sort((a, b) => b - a));
    expect(lefts.at(-1)).toBe(0);
    const said = changes(batches);
    expect(said).toHaveLength(20);
    expect(said.find((u) => u.found?.path === 'F3.pdf')).toEqual({ id: await idOf('file 3'), found: { path: 'F3.pdf', stamp: { size: 6, modified: 13 } } });
  });

  it('says a file moved at its new path in the batch it is hashed in, and a deleted one gone only after', async () => {
    const f = _fakeFolder({ 'New.pdf': { bytes: 'moved', modified: 3 }, 'Other.pdf': { bytes: 'fresh', modified: 4 } });
    const known = new Map([
      ['moved', { path: 'Old.pdf', stamp: { size: 5, modified: 3 } }],
      ['deleted', { path: 'Del.pdf', stamp: { size: 1, modified: 1 } }],
    ]);
    // Ids are hashes: use the real ones.
    const movedId = await idOf('moved');
    known.set(movedId, known.get('moved')!);
    known.delete('moved');
    const batches = await scan(new LinkedDirectoryHandleRoot(as(f)), known);
    const atMove = batches.findIndex((b) => b.changes.some((u) => u.id === movedId));
    expect(batches[atMove].changes.find((u) => u.id === movedId)?.found?.path).toBe('New.pdf');
    const atGone = batches.findIndex((b) => b.changes.some((u) => u.id === 'deleted' && !u.found));
    expect(atGone).toBeGreaterThan(-1);
    expect(batches[atGone].left).toBe(0);
    // Every file was hashed in a batch before the one saying gone.
    expect(batches.slice(0, atGone).some((b) => b.changes.some((u) => u.found?.path === 'Other.pdf'))).toBe(true);
  });

  it('does not say a duplicate of a known file, and does not read it on a second scan', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'same', modified: 1 }, 'Copy.pdf': { bytes: 'same', modified: 2 } });
    const id = await idOf('same');
    const root = new LinkedDirectoryHandleRoot(as(f));
    const known = new Map([[id, { path: 'A.pdf', stamp: { size: 4, modified: 1 } }]]);
    expect(changes(await scan(root, known))).toEqual([]);
    expect(f.reads.get('Copy.pdf')).toBe(1);
    expect(changes(await scan(root, known))).toEqual([]);
    // Pass 2 gets it again (to see its stamp), but doesn't hash a hidden copy as new: no change.
    expect(f.reads.get('Copy.pdf')).toBe(2);
  });

  it('pass 2 says a known file with a new stamp and the same bytes with the new stamp', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'aaa', modified: 9 } });
    const id = await idOf('aaa');
    const known = new Map([[id, { path: 'A.pdf', stamp: { size: 3, modified: 1 } }]]);
    expect(changes(await scan(new LinkedDirectoryHandleRoot(as(f)), known))).toEqual([{ id, found: { path: 'A.pdf', stamp: { size: 3, modified: 9 } } }]);
  });

  it('pass 2 says new bytes at the path, and the old id gone', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'brand new', modified: 9 } });
    const old = await idOf('old');
    const known = new Map([[old, { path: 'A.pdf', stamp: { size: 3, modified: 1 } }]]);
    expect(changes(await scan(new LinkedDirectoryHandleRoot(as(f)), known))).toEqual([
      { id: await idOf('brand new'), found: { path: 'A.pdf', stamp: { size: 9, modified: 9 } } },
      { id: old },
    ]);
  });

  it('pass 2 hashes a known file with no stamp and says it with its stamp', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'aaa', modified: 9 } });
    const id = await idOf('aaa');
    const known = new Map([[id, { path: 'A.pdf' }]]);
    expect(changes(await scan(new LinkedDirectoryHandleRoot(as(f)), known))).toEqual([{ id, found: { path: 'A.pdf', stamp: { size: 3, modified: 9 } } }]);
  });

  it('skips a trusted file gone meanwhile in pass 2', async () => {
    const f = _fakeFolder({ 'A.pdf': { bytes: 'aaa', modified: 9 }, 'N.pdf': { bytes: 'new' } });
    const id = await idOf('aaa');
    const known = new Map([[id, { path: 'A.pdf', stamp: { size: 3, modified: 1 } }]]);
    const it = new LinkedDirectoryHandleRoot(as(f)).getUpdates(known, new AbortController().signal)[Symbol.asyncIterator]();
    expect((await it.next()).value.left).toBe(1);
    f.drop('A.pdf');
    const rest: Update[] = [];
    for (let r = await it.next(); !r.done; r = await it.next()) rest.push(...r.value.changes);
    expect(rest).toEqual([{ id: await idOf('new'), found: { path: 'N.pdf', stamp: { size: 3, modified: expect.any(Number) } } }]);
  });

  it('says nothing more once aborted', async () => {
    const files: Record<string, { bytes: string }> = {};
    for (let i = 0; i < 30; i++) files[`F${i}.pdf`] = { bytes: `file ${i}` };
    const ctl = new AbortController();
    const it = new LinkedDirectoryHandleRoot(as(_fakeFolder(files))).getUpdates(new Map(), ctl.signal)[Symbol.asyncIterator]();
    expect((await it.next()).done).toBe(false);
    ctl.abort();
    expect((await it.next()).done).toBe(true);
  });
});
