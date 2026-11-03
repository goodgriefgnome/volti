import { describe, expect, it } from 'vitest';
import type { PlacedMark } from '../../markings/placed';
import { _tapAction } from './_placing';

const mark = (text: string): PlacedMark => ({ kind: 'symbol', text, font: 'f', glyphs: [], at: [0.5, 0.5], size: 0.05 });
const a = mark('a'), b = mark('b');

describe('_tapAction', () => {
  it('goes again on the selected marking', () => expect(_tapAction(a, a)).toBe('again'));
  it('selects another marking, and only deselects on empty music', () => {
    expect(_tapAction(a, b)).toBe('select');
    expect(_tapAction(a, undefined)).toBe('deselect');
  });
  it('selects a marking when nothing is selected', () => expect(_tapAction(undefined, a)).toBe('select'));
  it('places on empty music when nothing is selected', () => expect(_tapAction(undefined, undefined)).toBe('place'));
});
