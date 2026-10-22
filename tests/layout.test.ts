import { describe, expect, it } from 'vitest';
import { fitPages, pagesPerScreen } from '../src/viewer/layout';

describe('pagesPerScreen', () => {
  it('shows two pages in landscape and one in portrait on auto', () => {
    expect(pagesPerScreen('auto', 1280, 800)).toBe(2);
    expect(pagesPerScreen('auto', 800, 1280)).toBe(1);
  });
  it('respects a fixed choice', () => {
    expect(pagesPerScreen(1, 1280, 800)).toBe(1);
    expect(pagesPerScreen(2, 800, 1280)).toBe(2);
  });
});

describe('fitPages', () => {
  const A4 = 297 / 210;
  it('fills the height when the pages are narrow enough', () => {
    const [a, b] = fitPages(1280, 800, [A4, A4], 6);
    expect(a.h).toBe(800);
    expect(a.w).toBe(Math.floor(800 / A4));
    expect(b).toEqual(a);
  });
  it('fills the width when the pages would be too wide', () => {
    const [a] = fitPages(800, 1280, [A4], 0);
    expect(a.w).toBe(800);
    expect(a.h).toBeLessThan(1280);
  });
  it('keeps two pages and the gap within the width', () => {
    const sizes = fitPages(800, 1280, [A4, A4], 6);
    expect(sizes[0].w + sizes[1].w + 6).toBeLessThanOrEqual(800);
  });
  it('gives pages of different shapes the same height', () => {
    const [a, b] = fitPages(1280, 800, [A4, 0.7], 6);
    expect(a.h).toBe(b.h);
    expect(b.w).toBeGreaterThan(a.w);
  });
});
