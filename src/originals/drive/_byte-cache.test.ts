import { describe, expect, it, vi } from 'vitest';
import { _makeByteCache } from './_byte-cache';
import { _fakeFolder } from '../handles/_fake';

const blob = (n: number) => new Blob(['x'.repeat(n)]);

function setup(limit = 100) {
  const folder = _fakeFolder({});
  let budget = limit, clock = 1;
  const make = () => _makeByteCache(async () => folder as unknown as FileSystemDirectoryHandle, async () => budget, () => clock++);
  return { folder, cache: make(), make, setBudget: (n: number) => { budget = n; } };
}

describe('_byteCache', () => {
  it('gives back what was put, and nothing for an unknown id', async () => {
    const { cache } = setup();
    await cache.put('a', new Blob(['abc']));
    expect(await (await cache.get('a'))!.text()).toBe('abc');
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.has('a')).toBe(true);
    expect(await cache.has('b')).toBe(false);
  });

  it('evicts the least recently used over the budget, and a get makes an id recent', async () => {
    const { cache } = setup(25);
    await cache.put('a', blob(10));
    await cache.put('b', blob(10));
    await cache.get('a');
    await cache.put('c', blob(10));
    expect(await cache.has('b')).toBe(false);
    expect(await cache.has('a')).toBe(true);
    expect(await cache.has('c')).toBe(true);
  });

  it('never evicts a pinned id, and pinning anew unpins the others', async () => {
    const { cache } = setup(15);
    await cache.put('a', blob(10));
    await cache.pin(['a']);
    await cache.put('b', blob(10));
    expect(await cache.has('a')).toBe(true);
    expect(await cache.has('b')).toBe(false);
    await cache.pin(['b']);
    await cache.put('b', blob(10));
    expect(await cache.has('a')).toBe(false);
    expect(await cache.has('b')).toBe(true);
  });

  it('keeps an id pinned before it is put', async () => {
    const { cache } = setup(0);
    await cache.pin(['a']);
    expect(await cache.has('a')).toBe(false);
    await cache.put('a', blob(10));
    expect(await cache.has('a')).toBe(true);
  });

  it('gives its size, and empties on clear', async () => {
    const { cache, folder } = setup();
    await cache.put('a', blob(10));
    await cache.put('b', blob(5));
    expect(await cache.size()).toBe(15);
    await cache.clear();
    expect(await cache.size()).toBe(0);
    expect(await cache.has('a')).toBe(false);
    expect(folder.paths()).toEqual([]);
  });

  it('remembers across instances through the index', async () => {
    const { cache, make } = setup();
    await cache.put('a', blob(10));
    expect(await make().has('a')).toBe(true);
  });

  it('takes an index it cannot read as empty, and deletes the files it does not list on the next put', async () => {
    const { folder, make } = setup();
    folder.put('stray', 'zzz');
    folder.put('index.json', 'not json');
    const cache = make();
    expect(await cache.has('stray')).toBe(false);
    await cache.put('a', blob(5));
    expect(folder.paths().sort()).toEqual(['a', 'index.json']);
  });

  it('never throws: a failure is logged, and gives nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { folder, cache } = setup();
    folder.failWrite = true;
    await expect(cache.put('a', blob(5))).resolves.toBeUndefined();
    expect(await cache.get('a')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
