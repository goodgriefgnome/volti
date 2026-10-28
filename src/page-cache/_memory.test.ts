import { describe, expect, it } from 'vitest';
import { Held } from './_memory';

const canvas = (w: number, h: number) => ({ width: w, height: h }) as HTMLCanvasElement;
/** A canvas of 400 bytes. */
const small = () => canvas(10, 10);

describe('Held', () => {
  it('holds pages and says which widths of a page', () => {
    const h = new Held(() => 1e6);
    const a = small();
    h.put('x/1/100', a, () => {});
    h.put('x/1/200', small(), () => {});
    h.put('x/2/100', small(), () => {});
    expect(h.get('x/1/100')).toBe(a);
    expect(h.widths('x', 1).sort()).toEqual([100, 200]);
    expect(h.widths('x', 3)).toEqual([]);
  });

  it('evicts the least recently used first, telling it', () => {
    const h = new Held(() => 1000); // two pages of 400 bytes
    const out: string[] = [];
    const evicted = (name: string) => () => { out.push(name); };
    h.put('x/1/100', small(), evicted('1'));
    h.put('x/2/100', small(), evicted('2'));
    h.get('x/1/100'); // 2 is now the oldest
    h.put('x/3/100', small(), evicted('3'));
    expect(out).toEqual(['2']);
    expect(h.get('x/2/100')).toBeUndefined();
    expect(h.widths('x', 2)).toEqual([]);
    h.put('x/4/100', small(), evicted('4'));
    expect(out).toEqual(['2', '1']);
  });

  it('never evicts the page just put, even over budget', () => {
    const h = new Held(() => 10);
    const out: HTMLCanvasElement[] = [];
    const a = small(), b = small();
    h.put('x/1/100', a, (c) => out.push(c));
    h.put('x/2/100', b, (c) => out.push(c));
    expect(out).toEqual([a]);
    expect(h.get('x/2/100')).toBe(b);
  });

  it('replaces a page put again without evicting it', () => {
    const h = new Held(() => 1000);
    let evicted = 0;
    h.put('x/1/100', small(), () => evicted++);
    h.put('x/1/100', small(), () => evicted++);
    h.put('x/2/100', small(), () => evicted++);
    expect(evicted).toBe(0);
  });

  it('forgets everything on clear', () => {
    const h = new Held(() => 1000);
    h.put('x/1/100', small(), () => {});
    h.clear();
    expect(h.get('x/1/100')).toBeUndefined();
    expect(h.widths('x', 1)).toEqual([]);
  });
});
