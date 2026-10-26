// Opening an original's pages: an image's, or a PDF's, whether or not it is protected by a
// password. The password that opened a PDF is remembered on the tablet by the score's id, so it is
// asked for only once, even after a restart. Asking is the caller's (dialogs/passwords.ts); without a way to ask, a PDF whose
// password isn't remembered doesn't open. Every opening of an original's pages goes through here.

import { keys, kv } from '../storage';
import { openImage } from './image';
import { isImageName } from './names';
import type { Original } from './originals';
import type { PageCache } from './pages';
import { openPdf } from './pdf';

/** Ask for a PDF's password, saying whether the last one tried was wrong; null when it isn't given. */
export type AskPassword = (title: string, wrong: boolean) => Promise<string | null>;

/** Opening stopped because the PDF's password wasn't given. */
export class PasswordNotGiven extends Error {
  name = 'PasswordNotGiven';
}

/** The password remembered for an original, if it has needed one. */
export const savedPassword = (id: string) => kv.get<string>(keys.password(id));

/**
 * Open an original's pages. One protected by a password tries the password remembered for it,
 * then asks `ask` for it (with none, as when opening ahead of time, it gives up), and remembers the
 * one that opens it. Throws PasswordNotGiven when it isn't given.
 */
export async function openOriginal(o: Original, ask?: AskPassword): Promise<PageCache> {
  if (isImageName(o.path)) return openImage(await o.getFile());
  const saved = await savedPassword(o.id);
  let tried: string | undefined, refused = false;
  try {
    const cache = await openPdf(await o.getFile(), async (wrong) => {
      if (saved !== undefined && tried === undefined) return (tried = saved);
      const p = ask ? await ask(o.title, wrong || tried !== undefined) : null;
      if (p === null) refused = true;
      else tried = p;
      return p;
    });
    if (tried !== undefined && tried !== saved) await kv.set(keys.password(o.id), tried);
    return cache;
  } catch (e) {
    throw refused ? new PasswordNotGiven(`“${o.title}” needs its password`) : e;
  }
}
