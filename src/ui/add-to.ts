import { newSetlist, type Setlist } from '../setlists/model';
import { askName, showMenu } from './overlay';

/**
 * A menu of setlists to add to: the active ones, then the archived ones, then New setlist….
 * With `pieceId`, setlists that already have that piece say so.
 */
export function chooseSetlist(anchor: Element, title: string, setlists: readonly Setlist[], choose: (s: Setlist, isNew: boolean) => void, pieceId?: string) {
  const has = (s: Setlist) => !!pieceId && s.entries.some((e) => e.pieceId === pieceId);
  const ordered = [...setlists.filter((s) => !s.archived), ...setlists.filter((s) => s.archived)];
  showMenu(anchor, title, [
    ...ordered.map((s) => ({
      label: s.title + (s.archived ? ' (archived)' : '') + (has(s) ? ' · has it already' : ''),
      run: () => choose(s, false),
    })),
    { label: 'New setlist…', run: () => askName('New setlist', '', 'Make setlist', (name) => choose(newSetlist(name), true)) },
  ]);
}
