// A dialog asking for a line of text (a name, a file name, a folder): the field, a line saying why
// what was typed can't be taken, and Cancel and OK. Enter is OK.

import { button, el, focusHighlighted } from './dom';
import { buttonRow, closeOverlay, showDialog } from './overlay';

export interface _AskText {
  title: string;
  /** What the field says to start with, highlighted so typing replaces it. */
  value?: string;
  placeholder?: string;
  /** The field's name, for screen readers ("Setlist name"). */
  label: string;
  okLabel: string;
  /** Offered as you type. */
  choices?: string[];
  /** Shown under the field, such as a hint, before the line saying what is wrong. */
  below?: HTMLElement[];
  /** Another button beside OK that takes this text instead of what was typed (a folder's None). */
  alt?: { label: string; text: string };
  /**
   * Why the text can't be taken, said in the dialog ('' to say nothing), or null when it can. It
   * may do the work that can fail, such as renaming a file, so a failure is said in the dialog too.
   */
  check?(text: string): string | null | Promise<string | null>;
  /** The text was taken, and the dialog has closed: it may open another. */
  done(text: string): void;
}

export function askText(h: _AskText) {
  const d = showDialog(h.title);
  const input = el('input', 'name');
  input.type = 'text';
  input.value = h.value ?? '';
  if (h.placeholder) input.placeholder = h.placeholder;
  input.setAttribute('aria-label', h.label);
  const choices = el('datalist');
  choices.id = 'ask-text-choices';
  for (const value of h.choices ?? []) choices.append(Object.assign(el('option'), { value }));
  if (h.choices) input.setAttribute('list', choices.id);
  const error = el('p', 'hint error');
  error.setAttribute('aria-live', 'polite');
  let busy = false;
  const take = async (text: string) => {
    if (busy) return;
    busy = true;
    const why = (await h.check?.(text)) ?? null;
    busy = false;
    error.textContent = why ?? '';
    if (why !== null) { input.focus(); return; }
    closeOverlay();
    h.done(text);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void take(input.value); });
  d.append(
    input, ...(h.choices ? [choices] : []), ...(h.below ?? []), error,
    buttonRow(
      button('Cancel', closeOverlay),
      h.alt ? button(h.alt.label, () => void take(h.alt!.text), 'quiet') : null,
      button(h.okLabel, () => void take(input.value), 'primary'),
    ),
  );
  focusHighlighted(input);
}
