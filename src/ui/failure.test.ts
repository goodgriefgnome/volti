import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoAccess, PasswordNotGiven, Unreachable } from '../originals/types';
import { failed, failedOnce, showFailuresWith } from './failure';

afterEach(() => vi.restoreAllMocks());

describe('failed', () => {
  it('says what could not be done, to what, and why, in the error\'s own words', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(failed('rename', new Error('Disk full'), 'Mass')).toBe('Could not rename “Mass”: Disk full');
    expect(failed('save the change', new Error('Disk full'))).toBe('Could not save the change: Disk full');
  });
  it('logs an unexpected error, but not one a person can put right', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    failed('open', new NoAccess('Volti has no access to the scores folder.'));
    failed('open', new Unreachable("Google Drive can't be reached."));
    failed('open', new PasswordNotGiven('needs its password'));
    expect(log).not.toHaveBeenCalled();
    failed('open', new Error('odd'));
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('failedOnce', () => {
  it('shows the same failure once, and waits for something to show it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failedOnce('save a page', new Error('full'));
    failedOnce('save a page', new Error('full'));
    const said: string[] = [];
    const stop = showFailuresWith((s) => said.push(s));
    expect(said).toEqual(['Could not save a page: full']);
    failedOnce('save a page', new Error('full'));
    failedOnce('save a page', new Error('other'));
    expect(said).toEqual(['Could not save a page: full', 'Could not save a page: other']);
    stop();
  });
});
