import { describe, expect, it } from 'vitest';
import { resumeAt, type LastRead } from './_last-read';

const whole: LastRead = { kind: 'excerpt', id: 'a', cut: 'c3' };
const part: LastRead = { kind: 'excerpt', id: 'a', first: 'c2', last: 'c5', cut: 'c4' };
const setlist: LastRead = { kind: 'setlist', id: 's', entry: 'e2', cut: 'c9' };

describe('resumeAt', () => {
  it('resumes the same score', () => {
    expect(resumeAt(whole, { kind: 'excerpt', id: 'a' })).toEqual({ cut: 'c3' });
  });
  it('starts a different score at its beginning', () => {
    expect(resumeAt(whole, { kind: 'excerpt', id: 'b' })).toBeUndefined();
  });
  it('does not resume the whole score from an excerpt of it, or the other way', () => {
    expect(resumeAt(part, { kind: 'excerpt', id: 'a' })).toBeUndefined();
    expect(resumeAt(whole, { kind: 'excerpt', id: 'a', first: 'c2', last: 'c5' })).toBeUndefined();
  });
  it('resumes the same excerpt', () => {
    expect(resumeAt(part, { kind: 'excerpt', id: 'a', first: 'c2', last: 'c5' })).toEqual({ cut: 'c4' });
  });
  it('does not resume another excerpt of the same score', () => {
    expect(resumeAt(part, { kind: 'excerpt', id: 'a', first: 'c2', last: 'c6' })).toBeUndefined();
    expect(resumeAt(part, { kind: 'excerpt', id: 'a', first: 'c2' })).toBeUndefined();
  });
  it('resumes the same setlist at its entry', () => {
    expect(resumeAt(setlist, { kind: 'setlist', id: 's' })).toEqual({ entry: 'e2', cut: 'c9' });
  });
  it('does not resume another setlist', () => {
    expect(resumeAt(setlist, { kind: 'setlist', id: 't' })).toBeUndefined();
  });
  it('does not mix a setlist with an excerpt that has the same id string', () => {
    expect(resumeAt(setlist, { kind: 'excerpt', id: 's' })).toBeUndefined();
    expect(resumeAt({ kind: 'excerpt', id: 's', cut: 'c1' }, { kind: 'setlist', id: 's' })).toBeUndefined();
  });
  it('starts at the beginning when nothing is stored', () => {
    expect(resumeAt(undefined, { kind: 'excerpt', id: 'a' })).toBeUndefined();
  });
});
