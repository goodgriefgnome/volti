import { describe, expect, it } from 'vitest';
import { _signInReturn } from './drive-score-fs';

const saved = { verifier: 'ver', state: 'st', intent: 'link' as const };

describe('_signInReturn', () => {
  it('takes a good return, with what was kept for it', () => {
    expect(_signInReturn('?code=abc&state=st&scope=x', saved)).toEqual({ code: 'abc', verifier: 'ver', intent: 'link' });
  });
  it('throws when the state does not match, or nothing was kept', () => {
    expect(() => _signInReturn('?code=abc&state=other', saved)).toThrow();
    expect(() => _signInReturn('?code=abc&state=st', undefined)).toThrow();
  });
  it('throws for an error from Google', () => {
    expect(() => _signInReturn('?error=access_denied&state=st', saved)).toThrow('access_denied');
  });
  it('is undefined when the address has no return', () => {
    expect(_signInReturn('', saved)).toBeUndefined();
    expect(_signInReturn('?shared=1', saved)).toBeUndefined();
  });
});
