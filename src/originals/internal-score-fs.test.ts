import { describe, expect, it } from 'vitest';
import { keptIds } from './internal-score-fs';

describe('keptIds', () => {
  const record = { 'Mass.pdf': 'a', 'Masses/Kyrie.pdf': 'b', 'Gone.pdf': 'c' };
  it('keeps the ids of the paths found and drops the rest', () => {
    expect(keptIds(record, ['Mass.pdf', 'Masses/Kyrie.pdf'])).toEqual({ 'Mass.pdf': 'a', 'Masses/Kyrie.pdf': 'b' });
  });
  it('keeps nothing when nothing is found', () => {
    expect(keptIds(record, [])).toEqual({});
  });
  it('has no id for a path found that has none recorded', () => {
    expect(keptIds(record, ['New.pdf', 'Mass.pdf'])).toEqual({ 'Mass.pdf': 'a' });
  });
});
