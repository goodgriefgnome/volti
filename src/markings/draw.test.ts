import { describe, expect, it } from 'vitest';
import { _SOLID, mix, splitDrawing, type Drawing } from './draw';

describe('mix', () => {
  it('goes part of the way towards the other colour', () => expect(mix('#000000', '#ffffff', 0.25)).toBe('#404040'));
  it('is the colour at 0 and the other at 1', () => {
    expect(mix('#1c1f26', '#1f6fe0', 0)).toBe('#1c1f26');
    expect(mix('#1c1f26', '#1f6fe0', 1)).toBe('#1f6fe0');
  });
});

describe('splitDrawing', () => {
  const recorder = (): Drawing & { calls: string[] } => {
    const calls: string[] = [];
    return { calls, path: (_p, _w, look) => void calls.push('path ' + look.color), shape: (_c, paint) => void calls.push('shape ' + ('fill' in paint ? paint.fill : paint.stroke).color) };
  };
  it('sends what multiplies to the lower drawing and the rest to the upper', () => {
    const over = recorder(), under = recorder(), d = splitDrawing(over, under);
    const multiply = { ..._SOLID('#ffee00'), multiply: true };
    d.path([[0, 0], [1, 1]], 2, _SOLID('#ff0000'));
    d.path([[0, 0], [1, 1]], 2, multiply);
    d.shape([['M', 0, 0], ['Z']], { fill: multiply });
    d.shape([['M', 0, 0], ['Z']], { stroke: _SOLID('#ffffff'), width: 1 });
    expect(over.calls).toEqual(['path #ff0000', 'shape #ffffff']);
    expect(under.calls).toEqual(['path #ffee00', 'shape #ffee00']);
  });
});
