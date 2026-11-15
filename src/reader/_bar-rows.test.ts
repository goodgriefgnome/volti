import { describe, expect, it } from 'vitest';
import { barRows, TITLE_MIN_PX, TWO_ROWS_PX } from './_bar-rows';

const o = { fixed: 140, tools: 500 };

describe('barRows', () => {
  it('is one row when everything fits on a tall screen', () => {
    expect(barRows({ ...o, width: 1024, height: 768 })).toBe(1);
  });
  it('is two rows when it does not fit on a tall screen', () => {
    expect(barRows({ ...o, width: 390, height: 844 })).toBe(2);
  });
  it('is one row when it does not fit on a short screen', () => {
    expect(barRows({ ...o, width: 640, height: 390 })).toBe(1);
  });
  it('is one row when it fits exactly', () => {
    expect(barRows({ ...o, width: o.fixed + o.tools + TITLE_MIN_PX, height: 844 })).toBe(1);
    expect(barRows({ ...o, width: o.fixed + o.tools + TITLE_MIN_PX - 1, height: 844 })).toBe(2);
  });
  it('is two rows at a height of exactly 560, where two rows are a fifth', () => {
    expect(TWO_ROWS_PX * 5).toBe(560);
    expect(barRows({ ...o, width: 390, height: 560 })).toBe(2);
    expect(barRows({ ...o, width: 390, height: 559 })).toBe(1);
  });
});
