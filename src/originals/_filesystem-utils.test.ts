import { describe, expect, it } from 'vitest';
import { hashFile, inTurns } from './_filesystem-utils';

describe('hashFile', () => {
  it('is the SHA-256 of the contents, in hex', async () => {
    expect(await hashFile(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

/** A promise settled from outside. */
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('inTurns', () => {
  it('gives the results in the items\' order, whatever order f finishes in', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const out = inTurns(['a', 'b', 'c'], 3, async (x, i) => (await gates[i].promise, x.toUpperCase()));
    gates[2].resolve();
    gates[0].resolve();
    gates[1].resolve();
    expect(await out).toEqual(['A', 'B', 'C']);
  });

  it('never runs more than atOnce at once', async () => {
    const gates = Array.from({ length: 5 }, deferred);
    let running = 0, most = 0;
    const out = inTurns(gates, 2, async (g) => {
      most = Math.max(most, ++running);
      await g.promise;
      running--;
    });
    for (const g of gates) {
      await tick();
      g.resolve();
    }
    await out;
    expect(most).toBe(2);
  });

  it('with atOnce 1 starts each after the one before ends', async () => {
    const gates = [deferred(), deferred()];
    const started: number[] = [];
    const out = inTurns(gates, 1, async (g, i) => (started.push(i), g.promise));
    await tick();
    expect(started).toEqual([0]);
    gates[0].resolve();
    await tick();
    expect(started).toEqual([0, 1]);
    gates[1].resolve();
    await out;
  });

  it('gives [] for an empty list', async () => {
    expect(await inTurns([], 3, async () => 1)).toEqual([]);
  });

  it('starts no more once aborted, and rejects when those running end', async () => {
    const ctl = new AbortController();
    const gate = deferred();
    const started: number[] = [];
    const out = inTurns([0, 1, 2], 1, async (_, i) => (started.push(i), gate.promise), ctl.signal);
    const caught = out.catch((e) => e);
    await tick();
    ctl.abort();
    gate.resolve();
    expect(((await caught) as DOMException).name).toBe('AbortError');
    expect(started).toEqual([0]);
  });
});
