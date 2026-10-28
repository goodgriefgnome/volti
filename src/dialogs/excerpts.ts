// Named excerpt dialogs that both the library and the reader use: adding one, renaming it, changing
// its cuts and deleting it. Where the score comes from and how it is saved is the caller's.

import { nameProblem, removeName, setName } from '../excerpts/names';
import { sameSpan, spanLabel, type Span } from '../excerpts/span';
import type { Aspects, ExcerptName, Score } from '../scores/model';
import { moveExcerpt, type Setlist } from '../setlists/model';
import { askText } from '../ui/ask-text';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { openExcerptPicker } from './excerpt-picker';
import type { ExcerptSource } from './thumb-strip';

/** Where a score's named excerpts are changed. */
export interface ExcerptHost {
  setlists: readonly Setlist[];
  /** The original's page shapes, for naming spans by pages; by original pages without them. */
  aspects?: Aspects;
  /** Keep a change to the score's names, with the setlists when they changed too. */
  save(score: Score, setlists?: Setlist[]): void;
  say(text: string): void;
}

/** The setlists with an entry that plays this span of the score. */
export const _setlistsPlaying = (setlists: readonly Setlist[], score: Score, span: Span) =>
  setlists.filter((s) => s.entries.some((e) => e.scoreId === score.id && sameSpan(score.cuts, e, span)));

/** Name part of a score, in the excerpt picker. */
export function addExcerpt(src: ExcerptSource, title: string, h: ExcerptHost) {
  const score = src.state.score;
  openExcerptPicker({
    ...src,
    question: `Add an excerpt of “${title}”`,
    verb: 'It plays',
    span: {},
    name: '',
    okLabel: 'Add excerpt',
    problem: (span, name) => nameProblem(score, span, name),
    done: (span, name) => {
      h.save(setName(score, span, name));
      h.say(`Added “${name}” to “${title}”.`);
    },
  });
}

export function renameExcerpt(score: Score, x: ExcerptName, h: ExcerptHost) {
  askText({
    title: `Rename “${x.name}”`,
    value: x.name,
    label: 'Excerpt name',
    okLabel: 'Rename',
    check: (name) => nameProblem(score, x, name, x),
    done: (name) => h.save(setName(score, x, name, x)),
  });
}

/**
 * Choose other cuts for a named excerpt. Every entry that plays it moves with it. `moved` hears
 * where it went.
 */
export function changeExcerptCuts(src: ExcerptSource, x: ExcerptName, h: ExcerptHost, moved?: (to: Span) => void) {
  const score = src.state.score, now = score.names?.find((n) => n.name === x.name) ?? x;
  const using = _setlistsPlaying(h.setlists, score, now);
  openExcerptPicker({
    ...src,
    question: `Which cuts are “${now.name}”?`,
    verb: 'It plays',
    span: now,
    problem: (span) => (sameSpan(score.cuts, span, now) ? null : nameProblem(score, span, now.name, now)),
    okLabel: using.length ? `Change in ${plural(using.length, 'setlist')}` : 'Done',
    done: (span) => {
      if (sameSpan(score.cuts, span, now)) return;
      const r = moveExcerpt(score, h.setlists, now, span);
      h.save(r.score, r.setlists);
      moved?.(span);
      if (using.length) h.say(`Changed “${now.name}” in ${plural(using.length, 'setlist')}.`);
    },
  });
}

/** Take the name off an excerpt. Setlists that play it keep playing the same music. */
export function deleteExcerpt(score: Score, x: ExcerptName, h: ExcerptHost) {
  const using = _setlistsPlaying(h.setlists, score, x);
  const pages = spanLabel(score.cuts, x, h.aspects);
  const d = showDialog(`Delete “${x.name}”?`);
  d.append(
    el('p', '', using.length
      ? `${using.map((s) => `“${s.title}”`).join(', ')} still ${using.length === 1 ? 'plays' : 'play'} the same music, as ${pages ?? 'part of the score'}.`
      : 'The score and its cuts stay as they are.'),
    buttonRow(button('Cancel', closeOverlay), button('Delete', () => {
      closeOverlay();
      h.save(removeName(score, x));
      h.say(`Deleted “${x.name}”.`);
    }, 'danger')),
  );
}
