import { kv } from './idb';

// Files shared into the app wait here until the page imports them.

export function putInbox(files: File[]): Promise<void> {
  return kv.update<File[]>('inbox', (old) => [...(old ?? []), ...files]);
}

export async function takeInbox(): Promise<File[]> {
  const files = (await kv.get<File[]>('inbox')) ?? [];
  if (files.length) await kv.del('inbox');
  return files;
}
