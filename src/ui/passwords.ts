// Opening an original that may be protected by a password: asking for the password the first
// time, and remembering it on the tablet by the score's id, so it isn't asked for again, even
// after a restart. Every opening of an original's pages goes through here.

import type { Original } from '../originals/originals';
import { openPdf, type PageCache } from '../originals/pdf';
import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { button, el } from './dom';
import { buttonRow, showOnTop } from './overlay';

/** Opening stopped because the PDF's password wasn't given. */
export class PasswordNotGiven extends Error {
  name = 'PasswordNotGiven';
}

/** Ask for a PDF's password, over whatever is open; null when it isn't given. */
function askPassword(title: string, wrong: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const { dialog, close } = showOnTop(`“${title}” has a password`);
    const input = el('input', 'name');
    input.type = 'password';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Password');
    const hint = el('p', wrong ? 'hint error' : 'hint', wrong ? 'That password doesn’t open it. Try again.' : 'Volti remembers it on this tablet, so it asks only once.');
    const done = (p: string | null) => { close(); resolve(p); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    dialog.append(input, hint, buttonRow(button('Cancel', () => done(null)), button('Open', () => done(input.value), 'primary')));
    input.focus();
  });
}

/**
 * Open an original's pages. One protected by a password tries the password remembered for it,
 * then asks for it (unless `ask` is false: opening ahead of time, say), and remembers the one that
 * opens it. Throws PasswordNotGiven when it isn't given.
 */
export async function openOriginal(o: Original, ask = true): Promise<PageCache> {
  const saved = await kv.get<string>(keys.password(o.id));
  let tried: string | undefined, refused = false;
  try {
    const cache = await openPdf(await o.getFile(), async (wrong) => {
      if (saved !== undefined && tried === undefined) return (tried = saved);
      const p = ask ? await askPassword(o.title, wrong || tried !== undefined) : null;
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
