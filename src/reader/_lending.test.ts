import { describe, expect, it } from 'vitest';
import { LendStack } from './_lending';

const none = { unequipped: [], equipped: [] };

describe('LendStack', () => {
  it('starts with its bottom on top', () => {
    const s = new LendStack('hand');
    expect(s.active).toBe('hand');
    expect(s.bottom).toBe('hand');
  });
  it('equips a tool by its button, clearing every lend', () => {
    const s = new LendStack('hand');
    s.equip('pen');
    s.lend('symbol', 'selection');
    s.lend('eraser', 'press');
    expect(s.equip('text')).toEqual({ unequipped: ['eraser', 'symbol', 'pen'], equipped: ['text'] });
    expect(s.active).toBe('text');
    expect(s.has('selection')).toBe(false);
    expect(s.has('press')).toBe(false);
  });
  it('keeps a tool equipped that was lent and then equipped', () => {
    const s = new LendStack('hand');
    s.lend('symbol', 'selection');
    expect(s.equip('symbol')).toEqual({ unequipped: ['hand'], equipped: [] });
    expect(s.bottom).toBe('symbol');
    expect(s.has('selection')).toBe(false);
  });
  it('lends a selection\'s tool on top of the bottom, and gives the bottom back', () => {
    const s = new LendStack('hand');
    expect(s.lend('symbol', 'selection')).toEqual({ unequipped: [], equipped: ['symbol'] });
    expect(s.active).toBe('symbol');
    expect(s.has('selection')).toBe(true);
    expect(s.end('selection')).toEqual({ unequipped: ['symbol'], equipped: [] });
    expect(s.active).toBe('hand');
  });
  it('puts a press\'s lend over a selection\'s, and ending the selection\'s leaves the press\'s on top', () => {
    const s = new LendStack('hand');
    s.lend('symbol', 'selection');
    s.lend('eraser', 'press');
    expect(s.active).toBe('eraser');
    expect(s.end('selection')).toEqual({ unequipped: ['symbol'], equipped: [] });
    expect(s.active).toBe('eraser');
    expect(s.end('press')).toEqual({ unequipped: ['eraser'], equipped: [] });
    expect(s.active).toBe('hand');
  });
  it('replaces a selection\'s lend by a second selection\'s', () => {
    const s = new LendStack('hand');
    s.lend('symbol', 'selection');
    expect(s.lend('text', 'selection')).toEqual({ unequipped: ['symbol'], equipped: ['text'] });
    expect(s.active).toBe('text');
    s.end('selection');
    expect(s.active).toBe('hand');
  });
  it('keeps a press\'s lend on top when a selection\'s is replaced under it', () => {
    const s = new LendStack('hand');
    s.lend('symbol', 'selection');
    s.lend('eraser', 'press');
    s.lend('text', 'selection');
    expect(s.active).toBe('eraser');
    s.end('press');
    expect(s.active).toBe('text');
  });
  it('changes nothing lending the tool on top, or one already on the stack', () => {
    const s = new LendStack('text');
    expect(s.lend('text', 'selection')).toEqual(none);
    expect(s.has('selection')).toBe(false);
    s.lend('symbol', 'selection');
    expect(s.lend('symbol', 'press')).toEqual(none);
    expect(s.lend('text', 'press')).toEqual(none);
    expect(s.end('press')).toEqual(none);
  });
  it('changes nothing ending a lend that is not there', () => {
    expect(new LendStack('hand').end('selection')).toEqual(none);
  });
});
