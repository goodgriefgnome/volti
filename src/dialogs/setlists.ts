// Setlist menus and dialogs that both the library and the reader use. Ones that a single screen
// uses live with that screen.

import { newSetlist, type Setlist } from '../setlists';
import { askText, showMenu } from '../ui';

/** Ask for a setlist's name. */
export function askSetlistName(heading: string, value: string, okLabel: string, done: (name: string) => void) {
  askText({
    title: heading,
    value,
    placeholder: 'For example, Spring recital',
    label: 'Setlist name',
    okLabel,
    check: (v) => (v.trim() ? null : ''),
    done: (v) => done(v.trim()),
  });
}

/**
 * A menu of setlists to add to: the active ones, then the archived ones, then New setlist….
 * With `scoreId`, setlists that already have that score say so.
 */
export function chooseSetlist(anchor: Element, title: string, setlists: readonly Setlist[], choose: (s: Setlist) => void, scoreId?: string) {
  const has = (s: Setlist) => !!scoreId && s.entries.some((e) => e.scoreId === scoreId);
  const ordered = [...setlists.filter((s) => !s.archived), ...setlists.filter((s) => s.archived)];
  showMenu(anchor, title, [
    ...ordered.map((s) => ({
      label: s.title + (s.archived ? ' (archived)' : '') + (has(s) ? ' · has it already' : ''),
      run: () => choose(s),
    })),
    { label: 'New setlist…', run: () => askSetlistName('New setlist', '', 'Make setlist', (name) => choose(newSetlist(name))) },
  ]);
}
