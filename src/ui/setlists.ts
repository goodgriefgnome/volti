// Setlist menus and dialogs that both the library and the reader use. Ones that a single screen
// uses live with that screen.

import { newSetlist, type Setlist } from '../setlists/model';
import { button, el } from './dom';
import { buttonRow, closeOverlay, showDialog, showMenu } from './overlay';

/** Ask for a setlist's name. */
export function askSetlistName(heading: string, value: string, okLabel: string, done: (name: string) => void) {
  const d = showDialog(heading);
  const input = el('input', 'name');
  input.type = 'text';
  input.value = value;
  input.placeholder = 'For example, Spring recital';
  input.setAttribute('aria-label', 'Setlist name');
  const ok = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    closeOverlay();
    done(v);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  d.append(input, buttonRow(button('Cancel', closeOverlay), button(okLabel, ok, 'primary')));
  input.focus();
  input.select();
}

/**
 * A menu of setlists to add to: the active ones, then the archived ones, then New setlist….
 * With `scoreId`, setlists that already have that score say so.
 */
export function chooseSetlist(anchor: Element, title: string, setlists: readonly Setlist[], choose: (s: Setlist, isNew: boolean) => void, scoreId?: string) {
  const has = (s: Setlist) => !!scoreId && s.entries.some((e) => e.scoreId === scoreId);
  const ordered = [...setlists.filter((s) => !s.archived), ...setlists.filter((s) => s.archived)];
  showMenu(anchor, title, [
    ...ordered.map((s) => ({
      label: s.title + (s.archived ? ' (archived)' : '') + (has(s) ? ' · has it already' : ''),
      run: () => choose(s, false),
    })),
    { label: 'New setlist…', run: () => askSetlistName('New setlist', '', 'Make setlist', (name) => choose(newSetlist(name), true)) },
  ]);
}
