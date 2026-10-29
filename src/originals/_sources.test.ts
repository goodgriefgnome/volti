import { afterEach, describe, expect, it } from 'vitest';
import { resetPagesForTests, sharePages } from './_sources';
import type { Content, OpenPages } from './_types';

/** A content whose pages count how often they are opened and closed; `failFirst` makes the first opening fail. */
function content(failFirst = false) {
  const c = {
    opened: 0,
    closed: 0,
    attempts: 0,
    pages: async (): Promise<OpenPages> => {
      if (failFirst && !c.attempts++) throw new Error('cannot open');
      c.opened++;
      return {
        pages: 1,
        aspect: async () => 1.4,
        draw: async () => ({} as HTMLCanvasElement),
        close: () => { c.closed++; },
      };
    },
    pdf: async () => ({ bytes: new Uint8Array() }),
  };
  return c satisfies Content & Record<string, unknown>;
}

afterEach(resetPagesForTests);

describe('sharePages', () => {
  it('opens nothing for a reference alone, and one opening for two references of an id', async () => {
    const c = content();
    const a = sharePages('a', c), b = sharePages('a', c);
    expect(c.opened).toBe(0);
    await a.use();
    await b.use();
    expect(c.opened).toBe(1);
  });

  it('closes the pages when the last reference closes, not before', async () => {
    const c = content();
    const a = sharePages('a', c), b = sharePages('a', c);
    await a.use();
    a.close();
    expect(c.closed).toBe(0);
    b.close();
    await Promise.resolve();
    expect(c.closed).toBe(1);
  });

  it('throws when a reference closes twice', () => {
    const a = sharePages('a', content());
    a.close();
    expect(() => a.close()).toThrow('Closed more often than it was got');
  });

  it('rejects a failed opening, and opens again at the next use', async () => {
    const c = content(true);
    const a = sharePages('a', c);
    await expect(a.use()).rejects.toThrow('cannot open');
    await a.use();
    expect(c.opened).toBe(1);
  });

  it('opens again for a reference taken after the id\'s pages closed', async () => {
    const c = content();
    const a = sharePages('a', c);
    await a.use();
    a.close();
    await sharePages('a', c).use();
    expect(c.opened).toBe(2);
    expect(c.closed).toBe(1);
  });
});
