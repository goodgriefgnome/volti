// The library's setlists: the list of them, each opening to its scores, with their menus, and the
// dialogs only they open (Add scores, choosing an entry's excerpt, deleting one).

import { askSetlistName } from '../dialogs/setlists';
import { openAddScores } from '../dialogs/add-scores';
import { openExcerptPicker } from '../dialogs/excerpt-picker';
import { excerptName } from '../scores/excerpts';
import { titleOf } from '../originals/path-utils';
import { scoreEntries } from '../scores/store';
import { addEntries, duplicate, moveEntry, newSetlist, setEntryExcerpt, withSetlist, type Entry, type Setlist } from '../setlists/model';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showMenu, whenOverlayCloses } from '../ui/overlay';
import type { LibraryHost } from './_host';
import { offlineText, type OfflineStatus } from './_offline-status';
import { expandableRow, moreButton } from './_rows';

const RING_R = 8.5, RING_LENGTH = 2 * Math.PI * RING_R;

/** The 22 px ring for a status (mock-up C): a track and an arc filling as pages save; a filled circle with a tick when all are; a dashed warning ring with "!" when some can't be. */
function ringSvg(s: OfflineStatus): string {
  const body = s.kind === 'ready'
    ? '<circle class="done" cx="11" cy="11" r="10"/><path class="tick" d="M6.5 11.3l3 3 6-6.3"/>'
    : s.kind === 'blocked'
      ? `<circle class="track warn-ring" cx="11" cy="11" r="${RING_R}" stroke-dasharray="3 2.4"/><rect class="bang" x="10" y="5.5" width="2" height="7" rx="1"/><circle class="bang" cx="11" cy="15.5" r="1.2"/>`
      : `<circle class="track" cx="11" cy="11" r="${RING_R}"/><circle class="fill" cx="11" cy="11" r="${RING_R}" stroke-dasharray="${((s.of ? s.done / s.of : 0) * RING_LENGTH).toFixed(1)} ${RING_LENGTH.toFixed(1)}"/>`;
  return `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">${body}</svg>`;
}

export class SetlistsSection {
  /** The buttons beside the heading: Show archived, New setlist. */
  readonly tools = el('div', 'head-tools');
  readonly list = el('ul', 'list setlists');
  private showArchived = false;
  /** Each row shown, by setlist id: its ⋯ button, and the ring before it while the setlist has a status. */
  private rows = new Map<string, { more: HTMLElement; ring?: HTMLButtonElement }>();

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
    this.rows.clear();
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

    const row = { more, ring: undefined as HTMLButtonElement | undefined };
    this.rows.set(s.id, row);
    this.showRing(s.id, row);

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
      head: [play, ...(row.ring ? [row.ring] : []), more],
      inner: entries,
    });
  }

  /** The setlists' offline status changed: update the rings in place, without rebuilding the rows. */
  showOffline() {
    for (const [id, row] of this.rows) this.showRing(id, row);
  }

  /** Give a row the ring for its setlist's status, or take it off when it has none. */
  private showRing(id: string, row: { more: HTMLElement; ring?: HTMLButtonElement }) {
    const { lib } = this, status = lib.offline.get(id);
    if (!status) {
      row.ring?.remove();
      row.ring = undefined;
      return;
    }
    if (!row.ring) {
      row.ring = button('', () => {
        const now = lib.offline.get(id);
        if (now) lib.toast.say(offlineText(now));
      }, 'quiet ring');
      row.more.before(row.ring);
    }
    row.ring.dataset.status = status.kind;
    row.ring.setAttribute('aria-label', offlineText(status));
    row.ring.innerHTML = ringSvg(status);
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
      givePassword: (o) => lib.givePassword(o),
      open: (o) => lib.openForDialog(o),
      add: (entries, scores) => {
        const now = lib.setlist(id);
        if (!now) return;
        lib.openRows.add(id);
        lib.addedTo(id);
        for (const x of scores) lib.remember(x);
        // The scores excerpts were chosen from too, so the excerpts and the cuts they name agree.
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
      question: `Which part of “${titleOf(o.path)}” does entry ${s.entries.indexOf(e) + 1} play?`,
      verb: 'This entry plays',
      named: true,
      excerpt: e,
      done: (excerpt) => {
        const now = lib.setlist(s.id);
        if (!now) return;
        lib.remember(sc);
        // The score too: one never opened isn't saved yet, and the excerpt names its cuts.
        void lib.change(withSetlist(lib.setlists, setEntryExcerpt(now, e.id, excerpt)), scoreEntries(sc.state));
      },
    });
    whenOverlayCloses(() => sc.close());
  }
}
