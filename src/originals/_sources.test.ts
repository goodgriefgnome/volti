import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSourcesForTests, sourceFor } from './_sources';
import type { Content, OpenPages } from './_types';

/** A content whose pages count how often they are opened and closed. */
function content() {
  const c = {
    opened: 0,
    destroyed: 0,
    drawn: 0,
    pages: async (): Promise<OpenPages> => {
      c.opened++;
      return {
        pages: 1,
        aspect: async () => 1.4,
        draw: async () => { c.drawn++; return {} as HTMLCanvasElement; },
        destroy: () => { c.destroyed++; },
      };
    },
    pdf: async () => ({ bytes: new Uint8Array() }),
  };
  return c satisfies Content & Record<string, unknown>;
}
const signal = () => new AbortController().signal;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  closeSourcesForTests();
  vi.useRealTimers();
});

describe('sourceFor', () => {
  it('opens on the first draw, and shares the pages between sources of the same id', async () => {
    const c = content();
    await sourceFor('a', 10, c).draw(1, 100, undefined, signal());
    await sourceFor('a', 10, c).draw(1, 100, undefined, signal());
    expect([c.opened, c.drawn]).toEqual([1, 2]);
  });

  it('closes 5 s after the last draw, unless it is the one drawn most recently', async () => {
    const a = content(), b = content();
    await sourceFor('a', 10, a).draw(1, 100, undefined, signal());
    await vi.advanceTimersByTimeAsync(6000);
    expect(a.destroyed).toBe(0); // still the one being read
    await sourceFor('b', 10, b).draw(1, 100, undefined, signal());
    await vi.advanceTimersByTimeAsync(4000);
    expect(a.destroyed).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect([a.destroyed, b.destroyed]).toEqual([1, 0]);
  });

  it('opens again after closing', async () => {
    const a = content(), b = content();
    await sourceFor('a', 10, a).draw(1, 100, undefined, signal());
    await sourceFor('b', 10, b).draw(1, 100, undefined, signal());
    await vi.advanceTimersByTimeAsync(6000);
    await sourceFor('a', 10, a).draw(1, 100, undefined, signal());
    expect(a.opened).toBe(2);
  });

  it('does not draw once aborted', async () => {
    const c = content(), ctl = new AbortController();
    ctl.abort();
    await expect(sourceFor('a', 10, c).draw(1, 100, undefined, ctl.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(c.drawn).toBe(0);
  });
});
