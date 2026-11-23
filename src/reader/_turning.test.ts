import { describe, expect, it } from 'vitest';
import { offerScore, turnFrom, type Place } from './_turning';

/** Screen `screen` of `screens` of item k of `items`. */
const at = (screen: number, screens: number, k = 0, items = 1): Place => ({ k, items, screen, screens });

describe('turning in a score\'s own reader', () => {
  it('turns along its screens, and back is forward undone', () => {
    expect(turnFrom(at(0, 3), 1, 'score')).toEqual({ to: 'screen', screen: 1 });
    expect(turnFrom(at(1, 3), 1, 'score')).toEqual({ to: 'screen', screen: 2 });
    expect(turnFrom(at(2, 3), -1, 'score')).toEqual({ to: 'screen', screen: 1 });
    expect(turnFrom(at(1, 3), -1, 'score')).toEqual({ to: 'screen', screen: 0 });
  });
  it('goes on to the library\'s next score past its end, and the one before before its start', () => {
    expect(turnFrom(at(2, 3), 1, 'score')).toEqual({ to: 'score', dir: 1 });
    expect(turnFrom(at(0, 3), -1, 'score')).toEqual({ to: 'score', dir: -1 });
  });
});

describe('turning in a named excerpt\'s reader', () => {
  it('turns its screens, and goes nowhere past its ends', () => {
    expect(turnFrom(at(0, 2), 1, 'excerpt')).toEqual({ to: 'screen', screen: 1 });
    expect(turnFrom(at(1, 2), 1, 'excerpt')).toEqual({ to: 'none' });
    expect(turnFrom(at(0, 2), -1, 'excerpt')).toEqual({ to: 'none' });
  });
});

describe('turning in a setlist', () => {
  it('goes from an entry\'s last screen to the next entry\'s first', () => {
    expect(turnFrom(at(1, 2, 0, 3), 1, 'setlist')).toEqual({ to: 'item', k: 1, at: 'first' });
  });
  it('goes from an entry\'s first screen back to the entry before\'s last', () => {
    expect(turnFrom(at(0, 2, 1, 3), -1, 'setlist')).toEqual({ to: 'item', k: 0, at: 'last' });
  });
  it('goes through an entry\'s screens, then on', () => {
    expect(turnFrom(at(0, 3, 1, 3), 1, 'setlist')).toEqual({ to: 'screen', screen: 1 });
    expect(turnFrom(at(2, 3, 1, 3), 1, 'setlist')).toEqual({ to: 'item', k: 2, at: 'first' });
  });
  it('goes nowhere past its last entry or before its first', () => {
    expect(turnFrom(at(2, 3, 2, 3), 1, 'setlist')).toEqual({ to: 'none' });
    expect(turnFrom(at(0, 3, 0, 3), -1, 'setlist')).toEqual({ to: 'none' });
  });
});

describe('offerScore', () => {
  it('offers the next score first, and opens it when turned the same way again while offered', () => {
    const first = offerScore(null, 1, 'b', 1000, 3500);
    expect(first).toEqual({ open: false, offered: { dir: 1, id: 'b', until: 4500 } });
    expect(offerScore(first.offered, 1, 'b', 2000, 3500)).toEqual({ open: true, offered: null });
  });
  it('offers again once the offer has run out, or for the other way', () => {
    const { offered } = offerScore(null, 1, 'b', 1000, 3500);
    expect(offerScore(offered, 1, 'b', 5000, 3500).open).toBe(false);
    expect(offerScore(offered, -1, 'a', 2000, 3500)).toEqual({ open: false, offered: { dir: -1, id: 'a', until: 5500 } });
  });
  it('offers nothing at the end of the library', () => {
    expect(offerScore(null, 1, undefined, 1000, 3500)).toEqual({ open: false, offered: null });
  });
});
