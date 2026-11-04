import { describe, expect, it } from 'vitest';
import { _upgrade, type Step, type VersionStore } from './stored-data';

/** A version kept in a variable, and steps that record their calls in `calls`. */
function setUp(stored: number | undefined, failing?: number) {
  const box = { stored, failing, calls: [] as string[] };
  const store: VersionStore = {
    get: async () => box.stored,
    set: async (v) => { box.stored = v; },
  };
  const step = (n: number): Step => async () => {
    box.calls.push('step ' + n);
    if (n === box.failing) throw new Error('failed ' + n);
  };
  const steps = { 1: step(1), 2: step(2) };
  const starting = () => box.calls.push('starting');
  return { box, store, steps, starting };
}

describe('_upgrade', () => {
  it('runs nothing when there is no stored version and the target is 1', async () => {
    const { box, store, steps, starting } = setUp(undefined);
    expect(await _upgrade(store, steps, 1, starting)).toBe('done');
    expect(box.calls).toEqual([]);
  });
  it('runs each step in order, after starting, and stores the target', async () => {
    const { box, store, steps, starting } = setUp(1);
    expect(await _upgrade(store, steps, 3, starting)).toBe('done');
    expect(box.calls).toEqual(['starting', 'step 1', 'step 2']);
    expect(box.stored).toBe(3);
  });
  it('runs only the steps from the stored version', async () => {
    const { box, store, steps, starting } = setUp(2);
    await _upgrade(store, steps, 3, starting);
    expect(box.calls).toEqual(['starting', 'step 2']);
  });
  it('throws a step’s error, keeping the versions of the steps before it, and finishes when run again', async () => {
    const { box, store, steps, starting } = setUp(1, 2);
    await expect(_upgrade(store, steps, 3, starting)).rejects.toThrow('failed 2');
    expect(box.stored).toBe(2);
    box.calls = [];
    box.failing = undefined;
    expect(await _upgrade(store, steps, 3, starting)).toBe('done');
    expect(box.calls).toEqual(['starting', 'step 2']);
    expect(box.stored).toBe(3);
  });
  it('runs nothing when the stored version is newer', async () => {
    const { box, store, steps, starting } = setUp(4);
    expect(await _upgrade(store, steps, 3, starting)).toBe('newer');
    expect(box.calls).toEqual([]);
    expect(box.stored).toBe(4);
  });
});
