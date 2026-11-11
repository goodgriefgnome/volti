import { describe, expect, it } from 'vitest';
import { _linkToVersion3 } from './device-score-fs';

describe('_linkToVersion3', () => {
  const handle = { kind: 'directory', name: 'Score' } as unknown as FileSystemDirectoryHandle;

  it('leaves a FolderLink as it is', () => {
    const link = { handle, linked: false };
    expect(_linkToVersion3(link)).toBe(link);
  });

  it('makes a bare handle, as stored before records, a linked FolderLink', () => {
    expect(_linkToVersion3(handle)).toEqual({ handle, linked: true });
  });

  it('leaves nothing, or anything else, as it is', () => {
    expect(_linkToVersion3(undefined)).toBeUndefined();
    expect(_linkToVersion3('folder')).toBe('folder');
    const file = { kind: 'file' };
    expect(_linkToVersion3(file)).toBe(file);
  });
});
