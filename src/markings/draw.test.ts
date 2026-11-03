import { describe, expect, it } from 'vitest';
import { mix } from './draw';

describe('mix', () => {
  it('goes part of the way towards the other colour', () => expect(mix('#000000', '#ffffff', 0.25)).toBe('#404040'));
  it('is the colour at 0 and the other at 1', () => {
    expect(mix('#1c1f26', '#1f6fe0', 0)).toBe('#1c1f26');
    expect(mix('#1c1f26', '#1f6fe0', 1)).toBe('#1f6fe0');
  });
});
