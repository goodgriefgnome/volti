import { describe, expect, it } from 'vitest';
import { _makeByteCache } from './_byte-cache';
import { DriveRoot } from './_root';
import { _fakeDrive } from './_fake';
import { _fakeFolder } from '../handles/_fake';
import { hashBytes } from '../_filesystem-utils';
import type { Known, Update } from '../_types';
import { NoAccess, Unreachable } from '../types';

const hash = (text: string) => hashBytes(new TextEncoder().encode(text).buffer as ArrayBuffer);

function setup(files: Record<string, string> = {}, signedIn = true) {
  const drive = _fakeDrive(files);
  const state = { signedIn };
  const folder = _fakeFolder({}) as unknown as FileSystemDirectoryHandle;
  const cache = _makeByteCache(async () => folder, async () => 1e9);
  const root = new DriveRoot(drive.root, drive, { signedIn: async () => state.signedIn }, cache);
  return { drive, root, cache, state };
}

/** Every change a scan says, in order. */
async function scan(root: DriveRoot, known: Known = new Map(), signal = new AbortController().signal): Promise<Update[]> {
  const out: Update[] = [];
  for await (const batch of root.getUpdates(known, signal)) {
    expect(batch.left).toBe(0);
    out.push(...batch.changes);
  }
  return out;
}
const paths = (changes: Update[]) => changes.flatMap((c) => (c.found ? [c.found.path] : [])).sort();

describe('DriveRoot access', () => {
  it('is ready when signed in, locked when not, and needAccess throws NoAccess when not', async () => {
    const a = setup({}, true), b = setup({}, false);
    expect(await a.root.access()).toBe('ready');
    await expect(a.root.needAccess()).resolves.toBeUndefined();
    expect(await b.root.access()).toBe('locked');
    await expect(b.root.needAccess()).rejects.toBeInstanceOf(NoAccess);
  });
});

describe('DriveRoot getUpdates', () => {
  it('lists PDFs and images with their sha256 as id, four deep and no deeper, leaving the rest out', async () => {
    const { drive, root } = setup({
      'a.pdf': 'a', 'B/b.pdf': 'b', 'B/C/c.png': 'c', 'B/C/D/d.pdf': 'd', 'B/C/D/E/e.pdf': 'e', 'B/C/D/E/F/f.pdf': 'f',
      'notes.txt': 'n', 'B/x.pdf': 'trashed',
    });
    drive.trashItem(drive.put('t.pdf', 'trashed too'));
    const slash = drive.addFile(drive.root, 'a/b.pdf', 'slash');
    expect(slash).toBeTruthy();
    const changes = await scan(root);
    expect(paths(changes)).toEqual(['B/C/D/E/e.pdf', 'B/C/D/d.pdf', 'B/C/c.png', 'B/b.pdf', 'B/x.pdf', 'a.pdf'].sort());
    expect(changes.find((c) => c.found?.path === 'a.pdf')!.id).toBe(await hash('a'));
  });

  it('leaves out a file in the trash', async () => {
    const { drive, root } = setup({ 'a.pdf': 'a' });
    drive.trashItem(drive.put('b.pdf', 'b'));
    expect(paths(await scan(root))).toEqual(['a.pdf']);
  });

  it('says nothing for known files unchanged', async () => {
    const { root } = setup({ 'a.pdf': 'a' });
    const known: Known = new Map([[await hash('a'), { path: 'a.pdf' }]]);
    expect(await scan(root, known)).toEqual([]);
  });

  it('says a file moved in Drive at its new path, and a deleted one without found', async () => {
    const { drive, root } = setup({ 'New/a.pdf': 'a' });
    const known: Known = new Map([[await hash('a'), { path: 'Old/a.pdf' }], [await hash('gone'), { path: 'g.pdf' }]]);
    expect(await scan(root, known)).toEqual([{ id: await hash('a'), found: { path: 'New/a.pdf', stamp: undefined } }, { id: await hash('gone') }]);
    expect(drive.count('download')).toBe(0);
  });

  it('keeps a known id at its path when a second copy of it is added', async () => {
    const { root } = setup({ 'A/a.pdf': 'a', 'B/a.pdf': 'a' });
    // "A" sorts first and "B" is later, but the known path stays.
    const known: Known = new Map([[await hash('a'), { path: 'B/a.pdf' }]]);
    expect(await scan(root, known)).toEqual([]);
  });

  it('puts the earlier created of two files at one path there', async () => {
    const { drive, root } = setup();
    drive.addFile(drive.root, 'a.pdf', 'first');
    drive.addFile(drive.root, 'a.pdf', 'second');
    const changes = await scan(root);
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe(await hash('first'));
  });

  it('lists the files of two folders of one name under the one path', async () => {
    const { drive, root } = setup();
    const f1 = drive.addFolder(drive.root, 'Mass'), f2 = drive.addFolder(drive.root, 'Mass');
    drive.addFile(f1, 'a.pdf', 'a');
    drive.addFile(f2, 'b.pdf', 'b');
    expect(paths(await scan(root))).toEqual(['Mass/a.pdf', 'Mass/b.pdf']);
    // Each is read through the one path.
    expect(await (await root.read('Mass/b.pdf')).text()).toBe('b');
  });

  it('leaves out a folder with a / in its name', async () => {
    const { drive, root } = setup();
    drive.addFile(drive.addFolder(drive.root, 'A/B'), 'x.pdf', 'x');
    expect(await scan(root)).toEqual([]);
  });

  it('throws NoAccess when Drive refuses the token', async () => {
    const { drive, root } = setup({ 'a.pdf': 'a' });
    drive.revoked = true;
    await expect(scan(root)).rejects.toBeInstanceOf(NoAccess);
  });

  it('stops quietly when aborted', async () => {
    const { root } = setup({ 'a.pdf': 'a' });
    const ac = new AbortController();
    ac.abort();
    expect(await scan(root, new Map(), ac.signal)).toEqual([]);
  });
});

describe('DriveRoot read', () => {
  it('downloads, then gives it from the cache with no request', async () => {
    const { drive, root } = setup({ 'a.pdf': 'abc' });
    await scan(root);
    expect(await (await root.read('a.pdf')).text()).toBe('abc');
    expect(drive.count('download')).toBe(1);
    drive.down = true;
    const before = drive.requests.length;
    const f = await root.read('a.pdf');
    expect(await f.text()).toBe('abc');
    expect(f.name).toBe('a.pdf');
    expect(drive.requests.length).toBe(before);
  });

  it('is Unreachable offline when not cached', async () => {
    const { drive, root } = setup({ 'a.pdf': 'abc' });
    await scan(root);
    drive.down = true;
    await expect(root.read('a.pdf')).rejects.toBeInstanceOf(Unreachable);
  });

  it('reads the cache by id before any listing', async () => {
    const first = setup({ 'a.pdf': 'abc' });
    await scan(first.root);
    await first.root.read('a.pdf');
    const id = await hash('abc');
    const fresh = new DriveRoot(first.drive.root, first.drive, { signedIn: async () => false }, first.cache);
    first.drive.down = true;
    expect(await fresh.kept(id)).toBe(true);
    expect(await (await fresh.read('a.pdf', id)).text()).toBe('abc');
  });

  it('finds a file by asking, with no listing', async () => {
    const { drive, root } = setup({ 'A/B/a.pdf': 'abc' });
    expect(await (await root.read('A/B/a.pdf')).text()).toBe('abc');
    expect(drive.count('children')).toBe(0);
  });

  it('throws NotFoundError for a file that is not there', async () => {
    const { root } = setup();
    await expect(root.read('A/nope.pdf')).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('DriveRoot changes', () => {
  it('knows whether a file exists, and not for a folder that is not there', async () => {
    const { root } = setup({ 'A/a.pdf': 'a' });
    expect(await root.exists('A/a.pdf')).toBe(true);
    expect(await root.exists('A/b.pdf')).toBe(false);
    expect(await root.exists('Z/a.pdf')).toBe(false);
    expect(await root.exists('a.pdf')).toBe(false);
  });

  it('writes a new file in new folders', async () => {
    const { drive, root, cache } = setup();
    const { file } = await root.write('X/Y/a.pdf', new Blob(['abc']));
    expect(file.name).toBe('a.pdf');
    expect(drive.paths()).toEqual(['X/Y/a.pdf']);
    expect(drive.text('X/Y/a.pdf')).toBe('abc');
    expect(await cache.has(await hash('abc'))).toBe(true);
  });

  it('writes over a file, leaving one there', async () => {
    const { drive, root } = setup({ 'a.pdf': 'old' });
    await root.write('a.pdf', new Blob(['new']));
    expect(drive.paths()).toEqual(['a.pdf']);
    expect(drive.text('a.pdf')).toBe('new');
  });

  it('moves a file within a folder, and across folders, making the folder', async () => {
    const { drive, root } = setup({ 'A/a.pdf': 'a' });
    expect((await root.move('A/a.pdf', 'A/b.pdf'))).toMatchObject({ path: 'A/b.pdf' });
    expect(drive.paths()).toEqual(['A/b.pdf']);
    await root.move('A/b.pdf', 'New/Deep/b.pdf');
    expect(drive.paths()).toEqual(['New/Deep/b.pdf']);
    await root.move('New/Deep/b.pdf', 'c.pdf');
    expect(drive.paths()).toEqual(['c.pdf']);
  });

  it('puts a removed file in the trash, downloading and writing nothing', async () => {
    const { drive, root, cache } = setup({ 'a.pdf': 'a', 'b.pdf': 'b' });
    const info = await root.remove('a.pdf');
    expect(drive.paths()).toEqual(['b.pdf']);
    expect(drive.trashed()).toEqual(['a.pdf']);
    expect(info).toHaveProperty('binned');
    expect(drive.count('download')).toBe(0);
    expect(drive.count('upload')).toBe(0);
    expect(await cache.size()).toBe(0);
  });

  it('takes a removed file out of the trash, to another path, with its own Drive id', async () => {
    const { drive, root } = setup({ 'A/a.pdf': 'a' });
    const fileId = drive.put('keep.pdf', 'k');
    const info = await root.remove('A/a.pdf') as { binned: Record<string, string> };
    expect(info.binned.fileId).not.toBe(fileId);
    expect(await root.undelete(info.binned, 'New/b.pdf')).toMatchObject({ path: 'New/b.pdf' });
    expect(drive.paths()).toEqual(['New/b.pdf', 'keep.pdf']);
    expect(drive.trashed()).toEqual([]);
    expect(drive.text('New/b.pdf')).toBe('a');
  });

  it('takes a removed file out of the trash to where it was', async () => {
    const { drive, root } = setup({ 'A/a.pdf': 'a' });
    const info = await root.remove('A/a.pdf') as { binned: Record<string, string> };
    expect(await root.undelete(info.binned, 'A/a.pdf')).toMatchObject({ path: 'A/a.pdf' });
    expect(drive.paths()).toEqual(['A/a.pdf']);
  });

  it('says taken, and leaves the file in the trash, when a file is at the path', async () => {
    const { drive, root } = setup({ 'a.pdf': 'a' });
    const info = await root.remove('a.pdf') as { binned: Record<string, string> };
    drive.put('a.pdf', 'other');
    expect(await root.undelete(info.binned, 'a.pdf')).toBe('taken');
    expect(drive.trashed()).toEqual(['a.pdf']);
  });

  it('fails to take out a file Drive no longer has, and says which bin a file is in', async () => {
    const { drive, root } = setup({ 'a.pdf': 'a' });
    const info = await root.remove('a.pdf') as { binned: Record<string, string> };
    expect(root.canUndelete(info.binned)).toBe(true);
    expect(root.canUndelete({ ...info.binned, folderId: 'another' })).toBe(false);
    await expect(root.undelete({ ...info.binned, fileId: 'gone' }, 'b.pdf')).rejects.toThrow('404');
    expect(drive.trashed()).toEqual(['a.pdf']);
  });
});

describe('DriveRoot offline', () => {
  it('fails a scan with Unreachable', async () => {
    const { drive, root } = setup({ 'a.pdf': 'a' });
    drive.down = true;
    await expect(scan(root)).rejects.toBeInstanceOf(Unreachable);
  });
});
