import { describe, expect, it } from 'vitest';
import { advanceFrom, setSmallestScalePercent, slideMsFrom, smallestScale, smallestScaleFrom } from './turning';

describe('advanceFrom', () => {
  it('lets page and screen through, and makes anything else page', () => {
    expect(advanceFrom('page')).toBe('page');
    expect(advanceFrom('screen')).toBe('screen');
    for (const raw of [undefined, 'Page', 2, null]) expect(advanceFrom(raw)).toBe('page');
  });
});

describe('smallestScaleFrom', () => {
  it('lets whole multiples of 5 from 10 to 100 through', () => {
    for (const p of [10, 55, 100]) expect(smallestScaleFrom(p)).toBe(p);
  });
  it('makes anything else 90', () => {
    for (const raw of [5, 105, 92, '90', undefined, NaN]) expect(smallestScaleFrom(raw)).toBe(90);
  });
  it('is kept as a fraction', () => {
    setSmallestScalePercent(60);
    expect(smallestScale()).toBe(0.6);
    setSmallestScalePercent(90);
  });
});

describe('slideMsFrom', () => {
  it('lets whole multiples of 50 from 0 to 1,000 through', () => {
    for (const ms of [0, 50, 300, 1000]) expect(slideMsFrom(ms)).toBe(ms);
  });
  it('makes anything else 300', () => {
    for (const raw of [undefined, null, -50, 1050, 125, 300.5, '300']) expect(slideMsFrom(raw)).toBe(300);
  });
});
