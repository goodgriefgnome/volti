import { describe, expect, it } from 'vitest';
import { _scoreToVersion3 } from './store';

describe('_scoreToVersion3', () => {
  it('drops the id, title and names of earlier versions, keeping the rest', () => {
    const cuts = [{ id: 'c', page: 0, y0: 0, y1: 1 }];
    expect(_scoreToVersion3({ id: 'x', title: 'Mass', names: [{ name: 'Kyrie' }], key: 'G', cuts, symbolSize: 0.04 }))
      .toEqual({ key: 'G', cuts, symbolSize: 0.04 });
  });
});
