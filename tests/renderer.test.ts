import { describe, expect, it } from 'vitest';
import { supersample } from '../src/viewer/renderer';

describe('supersample', () => {
  it('draws at twice the size on a typical tablet page', () => {
    expect(supersample(1600, 2260)).toBe(2);
  });
  it('backs off on very large pages to save graphics memory', () => {
    expect(supersample(2400, 3400)).toBe(1.5);
    expect(supersample(4000, 5600)).toBe(1);
  });
});
