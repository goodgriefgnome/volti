import { describe, expect, it } from 'vitest';
import { importName, tidyFolder } from './names';

describe('importName', () => {
  it('keeps a PDF\'s own name', () => {
    expect(importName('Sonata 3.pdf')).toBe('Sonata 3.pdf');
    expect(importName('Mass.PDF')).toBe('Mass.PDF');
  });

  it('keeps digits a name ends in, adding .pdf to a name without it', () => {
    expect(importName('Come_People_Of_The_Risen_King3420.pdf')).toBe('Come_People_Of_The_Risen_King3420.pdf');
    expect(importName('Come_People_Of_The_Risen_King3420')).toBe('Come_People_Of_The_Risen_King3420.pdf');
  });
});

describe('tidyFolder', () => {
  it('trims the parts of a path and drops empty ones', () => {
    expect(tidyFolder(' Masses / Latin/ ')).toBe('Masses/Latin');
    expect(tidyFolder(' / ')).toBe('');
  });
});
