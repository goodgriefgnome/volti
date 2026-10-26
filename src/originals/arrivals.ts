// What happens to files coming into the library, each at the path chosen for it: added as new;
// already in the library (the same contents, perhaps under another name), so left out; or its path
// taken, by a different file in the library or by another file coming in. Pure.

/** A file by its id (the hash of its contents) and its path in the library. */
export interface At { id: string; path: string }

/** What happens to a file coming in. */
export type Arrival =
  | { kind: 'new' }
  /** The library has it, at `path`: it is left out. */
  | { kind: 'have'; path: string }
  /** A different file is at its path: in the library (`by`, which may be replaced), or another coming in. */
  | { kind: 'taken'; by?: At };

/**
 * What happens to each file coming in, at its path. Paths are compared ignoring case, as a folder
 * may; of two coming in at one path, the first takes it.
 */
export function arrivals(coming: readonly At[], library: readonly At[]): Arrival[] {
  const have = new Map(library.map((o) => [o.id, o.path]));
  const at = new Map(library.map((o) => [o.path.toLowerCase(), o]));
  const claimed = new Set<string>();
  return coming.map((c): Arrival => {
    const there = have.get(c.id);
    if (there !== undefined) return { kind: 'have', path: there };
    const key = c.path.toLowerCase();
    const by = at.get(key);
    if (by) return { kind: 'taken', by };
    if (claimed.has(key)) return { kind: 'taken' };
    claimed.add(key);
    return { kind: 'new' };
  });
}
