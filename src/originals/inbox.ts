// The inbox: files shared into the app, held by the service worker until the page imports them.
// Both the page and the service worker use it, so no DOM.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';

export function putInbox(files: File[]): Promise<void> {
  return kv.update<File[]>(keys.inbox, (old) => [...(old ?? []), ...files]);
}

export async function takeInbox(): Promise<File[]> {
  const files = (await kv.get<File[]>(keys.inbox)) ?? [];
  if (files.length) await kv.del(keys.inbox);
  return files;
}
