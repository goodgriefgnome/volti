// The inbox: files shared into the app, held by the service worker until the page adds them to the
// library (adding.ts). Both the page and the service worker use it, so no DOM.

import { keys, kv } from '../storage';

export function putInbox(files: File[]): Promise<void> {
  return kv.update<File[]>(keys.inbox, (old) => [...(old ?? []), ...files]);
}

/** The files waiting, oldest first; they stay until dropped. */
export async function peekInbox(): Promise<File[]> {
  return (await kv.get<File[]>(keys.inbox)) ?? [];
}

/** Drop the first `n` files waiting, once they are added: any shared since stay. */
export async function dropInbox(n: number): Promise<void> {
  await kv.update<File[]>(keys.inbox, (old) => (old ?? []).slice(n));
}
