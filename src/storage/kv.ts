// The key-value store on IndexedDB: the only code that talks to IndexedDB. Works in the page and in
// the service worker. Which key holds what belongs in keys.ts, not here.

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    // Data from before scores, in the database 'volti', is left as it was.
    const req = indexedDB.open('volti-scores', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kv = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => run<void>('readwrite', (s) => { s.put(value, key); }),
  del: (key: string) => run<void>('readwrite', (s) => { s.delete(key); }),
  /** Several writes in one transaction, so they all happen or none do. */
  setMany: (entries: [string, unknown][]) =>
    run<void>('readwrite', (s) => { for (const [k, v] of entries) s.put(v, k); }),
  /** Read-modify-write in one transaction; returning undefined deletes the key. */
  update: <T>(key: string, fn: (old: T | undefined) => T | undefined) =>
    run<void>('readwrite', (s) => {
      const req = s.get(key);
      req.onsuccess = () => {
        const value = fn(req.result as T | undefined);
        if (value === undefined) s.delete(key); else s.put(value, key);
      };
    }),
  /**
   * Read-modify-write several keys in one transaction. Each function is given the value now stored
   * (undefined if none) and returns the new one; returning undefined deletes the key.
   */
  updateMany: (changes: [string, (old: unknown) => unknown][]) =>
    run<void>('readwrite', (s) => {
      for (const [key, fn] of changes) {
        const req = s.get(key);
        req.onsuccess = () => {
          const value = fn(req.result);
          if (value === undefined) s.delete(key); else s.put(value, key);
        };
      }
    }),
  /** Every key starting with `prefix`, with its value, in key order. */
  entries: <T>(prefix: string) =>
    run<[string, T][]>('readonly', (s) => {
      // Each request can finish before the other, so the pair is zipped when both have.
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      const values = s.getAll(range), found = s.getAllKeys(range);
      const result = { get result() { return (found.result as string[]).map((k, i) => [k, values.result[i]] as [string, T]); } };
      return result as unknown as IDBRequest;
    }),
};
