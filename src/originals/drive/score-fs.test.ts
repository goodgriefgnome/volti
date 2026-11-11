import { describe, expect, it } from 'vitest';
import { _makeByteCache } from './_byte-cache';
import { DriveRoot } from './_root';
import { _fakeDrive } from './_fake';
import { _fakeFolder } from '../handles/_fake';
import { hashBytes } from '../_filesystem-utils';
import { _downloadMissing, _signInReturn } from './score-fs';
import { Unreachable } from '../types';

const saved = { verifier: 'ver', state: 'st', intent: 'link' as const };

describe('_signInReturn', () => {
  it('takes a good return, with what was kept for it', () => {
    expect(_signInReturn('?code=abc&state=st&scope=x', saved)).toEqual({ code: 'abc', verifier: 'ver', intent: 'link' });
  });
  it('throws when the state does not match, or nothing was kept', () => {
    expect(() => _signInReturn('?code=abc&state=other', saved)).toThrow();
    expect(() => _signInReturn('?code=abc&state=st', undefined)).toThrow();
  });
  it('throws for an error from Google', () => {
    expect(() => _signInReturn('?error=access_denied&state=st', saved)).toThrow('access_denied');
  });
  it('is undefined when the address has no return', () => {
    expect(_signInReturn('', saved)).toBeUndefined();
    expect(_signInReturn('?shared=1', saved)).toBeUndefined();
  });
});

describe('_downloadMissing', () => {
  const hash = (text: string) => hashBytes(new TextEncoder().encode(text).buffer as ArrayBuffer);
  function setup(files: Record<string, string>) {
    const drive = _fakeDrive(files);
    const folder = _fakeFolder({}) as unknown as FileSystemDirectoryHandle;
    const cache = _makeByteCache(async () => folder, async () => 1e9);
    const root = new DriveRoot(drive.root, drive, { signedIn: async () => true }, cache);
    return { drive, root, cache };
  }

  it('downloads a pinned id with no bytes kept, and not one already kept', async () => {
    const { drive, root, cache } = setup({ 'a.pdf': 'a', 'b.pdf': 'b' });
    const [a, b] = [await hash('a'), await hash('b')];
    await cache.pin([a, b]);
    await cache.put(b, new Blob(['b']));
    const downloads: string[] = [];
    const download = drive.download.bind(drive);
    drive.download = async (id) => { downloads.push(id); return download(id); };
    const paths: Record<string, string> = { [a]: 'a.pdf', [b]: 'b.pdf' };
    await _downloadMissing([a, b], (id) => paths[id], root, cache);
    expect(await cache.has(a)).toBe(true);
    expect(downloads).toHaveLength(1);
    await _downloadMissing([a, b], (id) => paths[id], root, cache);
    expect(downloads).toHaveLength(1);
  });

  it('stops without throwing when Drive is down', async () => {
    const { drive, root, cache } = setup({ 'a.pdf': 'a', 'b.pdf': 'b' });
    const [a, b] = [await hash('a'), await hash('b')];
    await cache.pin([a, b]);
    let tries = 0;
    drive.download = async () => { tries++; throw new Unreachable('down'); };
    await expect(_downloadMissing([a, b], (id) => (id === a ? 'a.pdf' : 'b.pdf'), root, cache)).resolves.toBeUndefined();
    expect(tries).toBe(1);
    expect(await cache.has(a)).toBe(false);
  });
});
