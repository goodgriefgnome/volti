import { describe, expect, it } from 'vitest';
import { formatBytes, storageParts } from './_storage';

const MB = 1024 * 1024;

describe('storageParts', () => {
  it('splits the room into metadata, added scores, setlist cache, trash and the offline binary', () => {
    const parts = storageParts({ usage: 240 * MB, details: { indexedDB: 0.4 * MB, caches: 6 * MB } }, 186 * MB, 41 * MB, 3 * MB);
    expect(parts.map((p) => [p.name, p.bytes / MB])).toEqual([['Metadata', 0.4], ['Added scores', 186], ['Setlist cache', 41], ['Trash', 3], ['Offline binary', 6]]);
    // A store holding nothing isn't in the breakdown.
    expect(storageParts({ usage: 1 * MB, details: { indexedDB: 1 * MB } }, 0, 0, 0).at(-1)).toEqual({ key: 'app', name: 'Offline binary', bytes: 0 });
  });
  it('puts metadata and the offline binary together, as the rest, without the browser\'s breakdown', () => {
    const parts = storageParts({ usage: 240 * MB }, 186 * MB, 41 * MB, 3 * MB);
    expect(parts.map((p) => [p.name, p.bytes / MB])).toEqual([['Metadata and offline binary', 10], ['Added scores', 186], ['Setlist cache', 41], ['Trash', 3]]);
  });
});

describe('formatBytes', () => {
  it('reads as people read sizes', () => {
    expect(formatBytes(410 * 1024)).toBe('410 KB');
    expect(formatBytes(6.1 * MB)).toBe('6.1 MB');
    expect(formatBytes(186 * MB)).toBe('186 MB');
    expect(formatBytes(1.25 * 1024 * MB)).toBe('1.3 GB');
    expect(formatBytes(0)).toBe('0 KB');
  });
});
