import { describe, expect, it } from 'vitest';
import { holds } from './locks';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('holds', () => {
  it('finds a word anywhere in the bytes', () => {
    expect(holds(bytes('trailer << /Size 9 /Encrypt 7 0 R >>'), bytes('/Encrypt'))).toBe(true);
    expect(holds(bytes('/Encrypt'), bytes('/Encrypt'))).toBe(true);
  });
  it('misses a word that is only partly there', () => {
    expect(holds(bytes('trailer << /Size 9 /Encryp'), bytes('/Encrypt'))).toBe(false);
    expect(holds(bytes(''), bytes('/Encrypt'))).toBe(false);
  });
});
