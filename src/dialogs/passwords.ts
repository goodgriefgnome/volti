// Asking for a PDF's password, over whatever is open, and making sure a file's is known before it is needed.
// Opening the PDF, and remembering the password, is originals/.

import { NoAccess, PasswordNotGiven, type AskPassword, type SourceFile } from '../originals/types';
import { button, el } from '../ui/dom';
import { buttonRow, showOnTop } from '../ui/overlay';

/** Ask for a PDF's password, over whatever is open; null when it isn't given. */
export const askPassword: AskPassword = (title, wrong) => new Promise((resolve) => {
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

/**
 * Make sure a file can be read, asking for its password if it has one Volti doesn't know yet (as
 * adding a score to a setlist does, so its pages can be saved and it never asks while playing);
 * false when it isn't given. Throws when the file can't be read at all.
 */
export async function givePassword(f: SourceFile): Promise<boolean> {
  try {
    (await f.read(askPassword)).close();
    return true;
  } catch (e) {
    if (e instanceof PasswordNotGiven) return false;
    // Not readable until access to the scores folder is allowed: it asks when it is first read.
    if (e instanceof NoAccess) return true;
    throw e;
  }
}

/**
 * Ask for the passwords Volti doesn't know yet of files just added to a setlist, one at a time, in
 * the background: they are in it already, and reading one may mean downloading it. One whose
 * password isn't given, or that can't be read, stays in; the setlists section says why its pages
 * aren't saved, and opening it asks again. True when any could be read.
 */
export async function askPasswordsOf(files: readonly SourceFile[]): Promise<boolean> {
  let any = false;
  for (const f of files) {
    try { any = (await givePassword(f)) || any; } catch { /* the setlists section says why */ }
  }
  return any;
}
