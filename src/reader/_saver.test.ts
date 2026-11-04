import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cut, state } from '../scores/testing';
import type { Setlist } from '../setlists/model';
import type { OpenScore } from './_open-scores';
import { Saver, _RETRY_MS } from './_saver';

const saveChanged = vi.hoisted(() => vi.fn<(all: readonly Setlist[], before: readonly Setlist[], also: [string, unknown][]) => Promise<void>>());
vi.mock('../setlists/store', () => ({ saveChanged }));

const open = (): OpenScore => ({ id: 'p', aspects: [1], state: state([cut(0)]) });
/** The score states each write held. */
const written = () => saveChanged.mock.calls.map(([, , also]) => also.filter(([k]) => k.startsWith('score:')).map(([, v]) => v));

describe('Saver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveChanged.mockReset();
    saveChanged.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('writes a change half a second after it', async () => {
    const saver = new Saver(() => [], []), s = open();
    saver.soon(s);
    await vi.advanceTimersByTimeAsync(400);
    expect(saveChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(written()).toEqual([[{ key: '', cuts: s.state.score.cuts }]]);
  });

  it('writes nothing when nothing changed', async () => {
    const setlists: Setlist[] = [];
    await new Saver(() => setlists, setlists).flush();
    expect(saveChanged).not.toHaveBeenCalled();
  });

  it('keeps a change whose write failed, says so once, and tries again until it is written', async () => {
    const failed = vi.fn();
    const saver = new Saver(() => [], [], failed), s = open();
    saveChanged.mockRejectedValue(new Error('full'));
    saver.soon(s);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(_RETRY_MS);
    expect(saveChanged).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledTimes(1);
    saveChanged.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(_RETRY_MS);
    expect(saveChanged).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(_RETRY_MS * 3);
    expect(saveChanged).toHaveBeenCalledTimes(3);
  });

  it('rejects a flush whose write failed, keeping the change for the next', async () => {
    const saver = new Saver(() => [], []), s = open();
    saveChanged.mockRejectedValueOnce(new Error('full'));
    saver.soon(s);
    await expect(saver.flush()).rejects.toThrow('full');
    await saver.flush();
    expect(written()).toHaveLength(2);
    expect(written()[1]).toHaveLength(1);
  });

  it('keeps the setlists to be written when their write failed', async () => {
    const before: Setlist[] = [], after: Setlist[] = [{ id: 's', title: 'S', archived: false, entries: [] }];
    const saver = new Saver(() => after, before);
    saveChanged.mockRejectedValueOnce(new Error('full'));
    await expect(saver.flush()).rejects.toThrow();
    await saver.flush();
    expect(saveChanged.mock.calls[1][1]).toBe(before);
  });

  it('keeps a score changed again while it is written dirty', async () => {
    const saver = new Saver(() => [], []), s = open();
    let finish!: () => void;
    saveChanged.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    saver.soon(s);
    const first = saver.flush();
    await Promise.resolve();
    s.state = state([cut(0), cut(1)]);
    saver.soon(s);
    finish();
    await first;
    await saver.flush();
    expect(written()[1]).toEqual([{ key: '', cuts: s.state.score.cuts }]);
  });

  it('writes nothing more once stopped', async () => {
    const saver = new Saver(() => [], []);
    saver.soon(open());
    saver.stop();
    saver.soon(open());
    await vi.advanceTimersByTimeAsync(_RETRY_MS);
    await saver.flush();
    expect(saveChanged).not.toHaveBeenCalled();
  });
});
