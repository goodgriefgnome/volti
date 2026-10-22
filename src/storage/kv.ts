// A tiny key-value store on IndexedDB. Works in the page and in the service worker.

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('volti', 1);
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
  /** Read-modify-write in one transaction. */
  update: <T>(key: string, fn: (old: T | undefined) => T) =>
    run<void>('readwrite', (s) => {
      const req = s.get(key);
      req.onsuccess = () => s.put(fn(req.result as T | undefined), key);
    }),
};
