import { describe, expect, it } from 'vitest';
import { hashFile } from './_filesystem-utils';

describe('hashFile', () => {
  it('is the SHA-256 of the contents, in hex', async () => {
    expect(await hashFile(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
