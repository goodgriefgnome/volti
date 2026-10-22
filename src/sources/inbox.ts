import { keys } from '../storage/keys';
import { kv } from '../storage/kv';

// Files shared into the app wait here until the page imports them.

export function putInbox(files: File[]): Promise<void> {
  return kv.update<File[]>(keys.inbox, (old) => [...(old ?? []), ...files]);
}

export async function takeInbox(): Promise<File[]> {
  const files = (await kv.get<File[]>(keys.inbox)) ?? [];
  if (files.length) await kv.del(keys.inbox);
  return files;
}
