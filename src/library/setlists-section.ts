// The library's setlists: the list of them, each opening to its scores, with their menus, and the
// dialogs only they open (Add scores, choosing an entry's excerpt, deleting one).

import { openExcerptPicker } from '../dialogs/excerpt-picker';
import { askSetlistName } from '../dialogs/setlists';
import { excerptName } from '../excerpts/names';
import { scoreEntries } from '../scores/store';
import { addEntries, duplicate, moveEntry, newSetlist, setEntrySpan, withSetlist, type Entry, type Setlist } from '../setlists/model';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showMenu, whenOverlayCloses } from '../ui/overlay';
import { openAddScores } from './add-scores';
import type { LibraryHost } from './host';
import { expandableRow, moreButton } from './rows';

export class SetlistsSection {
  /** The buttons beside the heading: Show archived, New setlist. */
  readonly tools = el('div', 'head-tools');
  readonly list = el('ul', 'list setlists');
  private showArchived = false;

  constructor(private lib: LibraryHost) {}

  render() {
    const { lib } = this;
    const active = lib.setlists.filter((s) => !s.archived), archived = lib.setlists.filter((s) => s.archived);
    this.tools.replaceChildren();
    if (archived.length) {
      const b = button(this.showArchived ? 'Hide archived' : `Show archived (${archived.length})`, () => {
        this.showArchived = !this.showArchived;
        this.render();
      }, 'quiet');
      b.setAttribute('aria-pressed', String(this.showArchived));
      this.tools.append(b);
    }
    this.tools.append(button('New setlist', () => askSetlistName('New setlist', '', 'Next', (name) => {
      const s = newSetlist(name);
      lib.openRows.add(s.id);
      void lib.change([s, ...lib.setlists]);
      this.addScores(s.id);
    })));

    this.list.replaceChildren();
    if (!active.length) this.list.append(el('li', 'empty', 'No setlists yet. Use New setlist to make one.'));
    for (const s of active) this.list.append(this.row(s));
    // Archived setlists follow the others, in grey, only when asked for.
    if (this.showArchived) for (const s of archived) this.list.append(this.row(s));
  }

  /** A setlist: tap to play it; the arrow slides its scores open; ⋯ for the rest. */
  private row(s: Setlist): HTMLLIElement {
    const { lib } = this;
    const play = button('', () => {
      if (s.entries.length) lib.play(s);
      else lib.toast.say('This setlist has no scores yet.');
    }, 'open');
    play.append(el('span', 'item-title setlist-title', s.title), el('span', 'meta', (s.archived ? 'Archived · ' : '') + plural(s.entries.length, 'score')));

    const now = () => lib.setlist(s.id)!;
    const more = moreButton(s.title, (at) => showMenu(at, s.title, [
      { label: 'Add scores…', run: () => this.addScores(s.id) },
      { label: 'Rename…', run: () => askSetlistName('Rename setlist', s.title, 'Rename', (title) => void lib.update({ ...now(), title })) },
      { label: 'Duplicate', run: () => this.duplicate(s) },
      s.entries.length > 0 && { label: 'Export PDF…', run: () => lib.exportPdf(s.title, s.entries) },
      s.archived
        ? { label: 'Unarchive', run: () => { void lib.update({ ...now(), archived: false }); lib.toast.say(`Unarchived “${s.title}”.`); } }
        : { label: 'Archive', run: () => { void lib.update({ ...now(), archived: true }); lib.toast.say(`Archived “${s.title}”.`); } },
      s.archived && { label: 'Delete…', run: () => this.confirmDelete(s) },
    ]));

    const entries = el('ol', 'entries');
    entries.setAttribute('aria-label', `Scores in ${s.title}`);
    s.entries.forEach((e, i) => entries.append(this.entryRow(s, e, i, entries)));
    if (!s.entries.length) {
      const li = el('li', 'empty-set');
      li.append(button('Add scores', () => this.addScores(s.id)));
      entries.append(li);
    }
    return expandableRow({
      cls: 'set' + (s.archived ? ' archived' : ''),
      id: s.id,
      open: lib.openRows,
      label: `Scores in ${s.title}`,
      head: [play, more],
      inner: entries,
    });
  }

  private entryRow(s: Setlist, e: Entry, i: number, list: HTMLElement): HTMLLIElement {
    const { lib } = this;
    const title = lib.titleOf(e.scoreId), score = lib.saved.get(e.scoreId), missing = !lib.originalOf(e.scoreId);
    const excerpt = score ? excerptName(score, e, lib.shapes.get(e.scoreId)) : null;
    const li = el('li', 'entry');
    const handle = button('⋮⋮', () => {}, 'handle');
    handle.setAttribute('aria-label', `Move ${title}`);
    this.dragToReorder(handle, li, list, s, i);
    const open = button('', () => lib.play(s, e.id), 'open');
    open.append(el('span', 'item-title', title));
    if (score?.key) open.append(el('span', 'meta', score.key));
    if (excerpt) open.append(el('span', 'pill', excerpt));
    if (missing) open.append(el('span', 'pill missing', 'Missing'));
    const more = moreButton(title, (at) => showMenu(at, title, [
      i > 0 && { label: 'Move up', run: () => void lib.update(moveEntry(s, i, i - 1)) },
      i < s.entries.length - 1 && { label: 'Move down', run: () => void lib.update(moveEntry(s, i, i + 1)) },
      !missing && { label: 'Change excerpt…', run: () => void this.chooseExcerpt(s, e) },
      { label: 'Remove from setlist', run: () => this.removeEntry(s, e) },
    ]));
    li.append(handle, el('span', 'num', String(i + 1)), open, more);
    return li;
  }

  private dragToReorder(handle: HTMLElement, li: HTMLElement, list: HTMLElement, s: Setlist, i: number) {
    handle.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      li.classList.add('dragging');
      let to = i;
      const rows = [...list.children] as HTMLElement[];
      const onMove = (m: PointerEvent) => {
        to = rows.findIndex((r) => m.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
        if (to < 0) to = rows.length - 1; else if (to > i) to -= 1;
        rows.forEach((r, k) => { r.style.boxShadow = k === to && k !== i ? `inset 0 ${to < i ? 3 : -3}px 0 var(--select)` : ''; });
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        li.classList.remove('dragging');
        rows.forEach((r) => { r.style.boxShadow = ''; });
        if (to !== i) void this.lib.update(moveEntry(s, i, to));
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp, { once: true });
      handle.addEventListener('pointercancel', onUp, { once: true });
    });
  }

  private removeEntry(s: Setlist, e: Entry) {
    const { lib } = this, at = s.entries.indexOf(e);
    void lib.update({ ...s, entries: s.entries.filter((x) => x !== e) });
    lib.toast.say(`Removed “${lib.titleOf(e.scoreId)}” from “${s.title}”.`, ['Undo', () => {
      const now = lib.setlist(s.id);
      if (!now) return;
      const entries = [...now.entries];
      entries.splice(Math.min(at, entries.length), 0, e);
      void lib.update({ ...now, entries });
    }]);
  }

  private duplicate(s: Setlist) {
    const c = duplicate(s);
    this.lib.openRows.add(c.id);
    void this.lib.change([c, ...this.lib.setlists]);
    this.lib.toast.say(`Made “${c.title}”.`);
  }

  /** Only an archived setlist can be deleted. */
  private confirmDelete(s: Setlist) {
    const d = showDialog(`Delete “${s.title}”?`);
    d.append(
      el('p', '', 'The scores, with their cuts and markings, stay in the library.'),
      buttonRow(button('Cancel', closeOverlay), button('Delete', async () => {
        closeOverlay();
        await this.lib.deleteSetlist(s);
        this.lib.toast.say(`Deleted “${s.title}”.`);
      }, 'danger')),
    );
  }

  /** Open "Add scores" for setlist `id`; what's chosen goes at the end. */
  private addScores(id: string) {
    const { lib } = this, s = lib.setlist(id);
    if (!s) return;
    openAddScores({
      setlist: s,
      originals: lib.originals,
      saved: lib.saved,
      open: (o) => lib.openForDialog(o),
      add: (entries, scores) => {
        const now = lib.setlist(id);
        if (!now) return;
        lib.openRows.add(id);
        lib.addedTo(id);
        for (const x of scores) lib.remember(x);
        // The scores excerpts were chosen from too, so the spans and the cuts they name agree.
        void lib.change(withSetlist(lib.setlists, addEntries(now, entries)), scores.flatMap((x) => scoreEntries(x.state)));
        lib.toast.say(`Added ${plural(entries.length, 'score')} to “${now.title}”.`);
      },
    });
  }

  /** Choose the cuts an entry plays, over the library. */
  private async chooseExcerpt(s: Setlist, e: Entry) {
    const { lib } = this, o = lib.originalOf(e.scoreId);
    if (!o) return;
    const sc = await lib.openForDialog(o);
    if (!sc) return;
    openExcerptPicker({
      ...sc,
      question: `Which part of “${o.title}” does entry ${s.entries.indexOf(e) + 1} play?`,
      verb: 'This entry plays',
      named: true,
      span: e,
      done: (span) => {
        const now = lib.setlist(s.id);
        if (!now) return;
        lib.remember(sc);
        // The score too: one never opened isn't saved yet, and the span names its cuts.
        void lib.change(withSetlist(lib.setlists, setEntrySpan(now, e.id, span)), scoreEntries(sc.state));
      },
    });
    whenOverlayCloses(sc.close);
  }
}
