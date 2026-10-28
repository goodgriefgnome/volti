import { afterEach, describe, expect, it } from 'vitest';
import { resetScheduler, schedule } from './_scheduler';

/** A draw that resolves when told to, and says when it started and was cancelled. */
function fake() {
  const f = {
    started: 0,
    cancelled: false,
    finish: (_v: string) => {},
    run: (signal: AbortSignal) => {
      f.started++;
      return new Promise<string>((resolve, reject) => {
        f.finish = resolve;
        signal.addEventListener('abort', () => { f.cancelled = true; reject(new DOMException('Aborted', 'AbortError')); });
      });
    },
  };
  return f;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(resetScheduler);

describe('schedule', () => {
  it('shares one draw between requests for the same key', async () => {
    const f = fake();
    const a = schedule('k', 'now', undefined, f.run), b = schedule('k', 'now', undefined, f.run);
    await tick();
    expect(f.started).toBe(1);
    f.finish('page');
    expect(await Promise.all([a, b])).toEqual(['page', 'page']);
  });

  it('cancels only when every requester has aborted, and each aborted one rejects at once', async () => {
    const f = fake();
    const c1 = new AbortController(), c2 = new AbortController();
    const a = schedule('k', 'now', c1.signal, f.run), b = schedule('k', 'now', c2.signal, f.run);
    const a1 = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    c1.abort();
    await a1;
    expect(f.cancelled).toBe(false);
    const b1 = expect(b).rejects.toMatchObject({ name: 'AbortError' });
    c2.abort();
    await b1;
    expect(f.cancelled).toBe(true);
  });

  it('lets a request after a cancel start its own draw', async () => {
    const f = fake(), g = fake();
    const c = new AbortController();
    const a = schedule('k', 'now', c.signal, f.run);
    a.catch(() => {});
    await tick();
    c.abort();
    const b = schedule('k', 'now', undefined, g.run);
    await tick();
    expect(g.started).toBe(1);
    g.finish('new');
    expect(await b).toBe('new');
  });

  it('never runs more than 2 at once', async () => {
    const fs = [fake(), fake(), fake(), fake()];
    const ps = fs.map((f, i) => schedule('k' + i, 'now', undefined, f.run));
    await tick();
    expect(fs.map((f) => f.started)).toEqual([1, 1, 0, 0]);
    fs[0].finish('a');
    await tick();
    expect(fs.map((f) => f.started)).toEqual([1, 1, 1, 0]);
    fs[1].finish('b');
    fs[2].finish('c');
    await tick();
    fs[3].finish('d');
    expect(await Promise.all(ps)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('draws now, then ahead, then later', async () => {
    const hold = [fake(), fake()];
    hold.forEach((f, i) => void schedule('hold' + i, 'now', undefined, f.run).catch(() => {}));
    const later = fake(), ahead = fake(), now = fake();
    void schedule('later', 'later', undefined, later.run).catch(() => {});
    void schedule('ahead', 'ahead', undefined, ahead.run).catch(() => {});
    void schedule('now', 'now', undefined, now.run).catch(() => {});
    await tick();
    hold[0].finish('x');
    await tick();
    expect([now.started, ahead.started, later.started]).toEqual([1, 0, 0]);
    hold[1].finish('x');
    await tick();
    expect([now.started, ahead.started, later.started]).toEqual([1, 1, 0]);
  });

  it('makes later wait while any now is queued or running', async () => {
    const now = fake(), later = fake();
    void schedule('now', 'now', undefined, now.run).catch(() => {});
    void schedule('later', 'later', undefined, later.run).catch(() => {});
    await tick();
    expect([now.started, later.started]).toEqual([1, 0]); // a place is free, but later waits
    now.finish('x');
    await tick();
    expect(later.started).toBe(1);
  });

  it('rejects a request whose signal has aborted already, and a failed draw for everyone', async () => {
    const c = new AbortController();
    c.abort();
    await expect(schedule('k', 'now', c.signal, fake().run)).rejects.toMatchObject({ name: 'AbortError' });
    const a = schedule('f', 'now', undefined, () => Promise.reject(new Error('broken'))), b = schedule('f', 'now', undefined, fake().run);
    await expect(a).rejects.toThrow('broken');
    await expect(b).rejects.toThrow('broken');
    // nothing failed is remembered
    const g = fake();
    const again = schedule('f', 'now', undefined, g.run);
    await tick();
    g.finish('ok');
    expect(await again).toBe('ok');
  });
});
