// Asking for a PDF's password, over whatever is open. Opening the PDF, and remembering the
// password, is originals/open.ts.

import type { AskPassword } from '../originals/open';
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
