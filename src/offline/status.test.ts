import { describe, expect, it } from 'vitest';
import { offlineStatus, offlineText, pageKey, startingStatus, type OfflineStatus } from './status';

const a1 = pageKey('a', 1, 800), a2 = pageKey('a', 2, 800), b1 = pageKey('b', 1, 800), c1 = pageKey('c', 1, 800);
const none = new Map<string, { why: 'access'; title: string }>();

describe('offlineStatus', () => {
  it('is saving while the keeper runs, counting the pages saved', () => {
    const s = offlineStatus(new Map([['x', [a1, a2, b1]]]), new Set([a1]), false, none);
    expect(s.get('x')).toEqual({ kind: 'saving', done: 1, of: 3 });
  });

  it('is ready once every page is saved, even while the keeper still runs', () => {
    const needs = new Map([['x', [a1, b1]]]);
    expect(offlineStatus(needs, new Set([a1, b1]), false, none).get('x')).toEqual({ kind: 'ready' });
    expect(offlineStatus(needs, new Set([a1, b1]), true, none).get('x')).toEqual({ kind: 'ready' });
  });

  it('is blocked, once finished, for the first score whose pages are missing', () => {
    const needs = new Map([['x', [a1, a2, b1, c1]]]);
    const blocked = new Map([['b', { why: 'password' as const, title: 'Mass' }], ['c', { why: 'access' as const, title: 'Requiem' }]]);
    expect(offlineStatus(needs, new Set([a1, a2]), true, blocked).get('x')).toEqual({ kind: 'blocked', done: 2, of: 4, left: 1, why: 'password', title: 'Mass' });
  });

  it('calls a score missing when it is not blocked, but its pages could not be drawn', () => {
    const s = offlineStatus(new Map([['x', [a1, a2]]]), new Set([a1]), true, none).get('x');
    expect(s).toMatchObject({ kind: 'blocked', why: 'missing', left: 1 });
  });

  it('counts a page needed by two setlists for both', () => {
    const s = offlineStatus(new Map([['x', [a1, b1]], ['y', [a1, c1]]]), new Set([a1, c1]), false, none);
    expect(s.get('x')).toEqual({ kind: 'saving', done: 1, of: 2 });
    expect(s.get('y')).toEqual({ kind: 'ready' });
  });

  it('gives no status to a setlist that needs no pages', () => {
    expect(offlineStatus(new Map([['x', []]]), new Set(), true, none).has('x')).toBe(false);
  });
});

describe('startingStatus', () => {
  const last = {
    scores: new Map([['x', new Set(['a'])], ['y', new Set(['a', 'b'])]]),
    statuses: new Map<string, OfflineStatus>([['x', { kind: 'ready' }], ['y', { kind: 'ready' }]]),
  };

  it('shows a setlist given a score as saving, with nothing counted yet', () => {
    expect(startingStatus(new Map([['x', ['a', 'c']]]), last).get('x')).toEqual({ kind: 'saving', done: 0, of: 0 });
  });

  it('keeps the last status of a setlist with no score it lacked, one taken out too', () => {
    expect(startingStatus(new Map([['y', ['a']]]), last).get('y')).toEqual({ kind: 'ready' });
  });

  it('shows a new setlist with scores as saving, and drops setlists no longer live', () => {
    const s = startingStatus(new Map([['z', ['a']]]), last);
    expect([...s]).toEqual([['z', { kind: 'saving', done: 0, of: 0 }]]);
  });

  it('gives an empty setlist none', () => {
    expect(startingStatus(new Map([['z', []]]), last).has('z')).toBe(false);
  });
});

describe('offlineText', () => {
  it('says what each status means', () => {
    const say = (s: OfflineStatus) => offlineText(s);
    expect(say({ kind: 'saving', done: 18, of: 40 })).toBe('18 of 40 pages saved for offline.');
    expect(say({ kind: 'ready' })).toBe('Ready to play offline.');
    expect(say({ kind: 'blocked', done: 18, of: 40, left: 22, why: 'access', title: 'Mass' })).toBe('Volti needs access to the scores folder to save the rest (22 pages).');
    expect(say({ kind: 'blocked', done: 0, of: 4, left: 4, why: 'password', title: 'Mass' })).toBe('“Mass” needs its password before its pages can be saved.');
    expect(say({ kind: 'blocked', done: 0, of: 4, left: 4, why: 'offline', title: 'Mass' })).toBe('“Mass” isn’t on this tablet yet: connect to keep it.');
    expect(say({ kind: 'blocked', done: 0, of: 6, left: 6, why: 'missing', title: 'Mass' })).toBe('“Mass” can’t be found, so 6 of its pages can’t be saved.');
  });
});
