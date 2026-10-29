import { describe, expect, it } from 'vitest';
import { _asLink } from './device-score-fs';

describe('_asLink', () => {
  const handle = { kind: 'directory', name: 'Score' } as unknown as FileSystemDirectoryHandle;

  it('reads a FolderLink as it is', () => {
    expect(_asLink({ handle, linked: false })).toEqual({ handle, linked: false });
  });

  it('reads a bare handle, as stored before records, as linked', () => {
    expect(_asLink(handle)).toEqual({ handle, linked: true });
  });

  it('reads nothing, or anything else, as no link', () => {
    expect(_asLink(undefined)).toBeUndefined();
    expect(_asLink('folder')).toBeUndefined();
    expect(_asLink({ kind: 'file' })).toBeUndefined();
  });
});
