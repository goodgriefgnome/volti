import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { _namesFrom, smuflText } from './smufl';

const names = _namesFrom({ fingering4: 0xed14, fingeringSubstitutionDash: 0xed22, fingering5: 0xed15, dynamicMF: 0xe52d, Fermata: 0xe4c0 });

describe('SmuflNames', () => {
  it('finds a code point by name, and a name by code point', () => {
    expect(names.codePoint('fingering4')).toBe(0xed14);
    expect(names.codePoint('nothing')).toBeUndefined();
    expect(names.codePoint('toString')).toBeUndefined();
    expect(names.nameOf(0xe52d)).toBe('dynamicMF');
    expect(names.nameOf(0x41)).toBeUndefined();
  });
  it('searches ignoring case, in SMuFL order', () => {
    expect(names.search('FINGERING').map((r) => r.name)).toEqual(['fingering4', 'fingeringSubstitutionDash', 'fingering5']);
    expect(names.search('fermata')).toEqual([{ name: 'Fermata', cp: 0xe4c0 }]);
    expect(names.search('zzz')).toEqual([]);
  });
});

describe('smuflText', () => {
  it('writes each named character as its name, separated by spaces', () => {
    expect(smuflText('', names)).toBe('fingering4 fingeringSubstitutionDash fingering5');
  });
  it('separates names from ordinary text next to them', () => {
    expect(smuflText('ab', names)).toBe('a fingering4 b');
    expect(smuflText('ab', names)).toBe('ab');
  });
  it('keeps a Private Use Area character with no name', () => {
    expect(smuflText('', names)).toBe(' fingering4');
  });
  it('leaves text with none alone', () => {
    expect(smuflText('Ped.', names)).toBe('Ped.');
    expect(smuflText('', names)).toBe('');
  });
});

describe('the bundled names', () => {
  it('has SMuFL\'s code points', () => {
    const table = JSON.parse(readFileSync(new URL('./smufl-names.json', import.meta.url), 'utf8'));
    expect(table.fingering4).toBe(0xed14);
    expect(table.dynamicMF).toBe(0xe52d);
  });
});
