// Named excerpt dialogs that both the library and the reader use: adding one, renaming it, changing
// its cuts and deleting it. Where the score comes from and how it is saved is the caller's.

import { type Excerpt, nameProblem, deleteNamedExcerpt as deleteFromScore, sameExcerpt, setName, excerptLabel } from '../scores/excerpts';
import type { Aspects, NamedExcerpt, Score } from '../scores/model';
import { moveExcerpt, type Setlist } from '../setlists/model';
import { askText } from '../ui/ask-text';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { openExcerptPicker } from './excerpt-picker';
import type { ExcerptSource } from './thumbnail-strip';

/** Where a score's named excerpts are changed. */
export interface NamedExcerptHost {
  setlists: readonly Setlist[];
  /** The original's aspects, for naming excerpts by pages; by original pages without them. */
  aspects?: Aspects;
  /** Keep a change to the score's names, with the setlists when they changed too. */
  save(score: Score, setlists?: Setlist[]): void;
  say(text: string): void;
}

/** The setlists with an entry that plays this excerpt of the score. */
export const _setlistsPlaying = (setlists: readonly Setlist[], score: Score, excerpt: Excerpt) =>
  setlists.filter((s) => s.entries.some((e) => e.scoreId === score.id && sameExcerpt(score.cuts, e, excerpt)));

/** Name part of a score, in the excerpt picker. */
export function addNamedExcerpt(src: ExcerptSource, title: string, h: NamedExcerptHost) {
  const score = src.state.score;
  openExcerptPicker({
    ...src,
    question: `Add an excerpt of “${title}”`,
    verb: 'It plays',
    excerpt: {},
    name: '',
    okLabel: 'Add excerpt',
    problem: (excerpt, name) => nameProblem(score, excerpt, name),
    done: (excerpt, name) => {
      h.save(setName(score, excerpt, name));
      h.say(`Added “${name}” to “${title}”.`);
    },
  });
}

export function renameNamedExcerpt(score: Score, x: NamedExcerpt, h: NamedExcerptHost) {
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
 * Pick other cuts for a named excerpt. Every entry that plays it moves with it. `moved` hears
 * where it went.
 */
export function changeNamedExcerptCuts(src: ExcerptSource, x: NamedExcerpt, h: NamedExcerptHost, moved?: (to: Excerpt) => void) {
  const score = src.state.score, now = score.excerpts?.find((n) => n.name === x.name) ?? x;
  const using = _setlistsPlaying(h.setlists, score, now);
  openExcerptPicker({
    ...src,
    question: `Which cuts are “${now.name}”?`,
    verb: 'It plays',
    excerpt: now,
    problem: (excerpt) => (sameExcerpt(score.cuts, excerpt, now) ? null : nameProblem(score, excerpt, now.name, now)),
    okLabel: using.length ? `Change in ${plural(using.length, 'setlist')}` : 'Done',
    done: (excerpt) => {
      if (sameExcerpt(score.cuts, excerpt, now)) return;
      const r = moveExcerpt(score, h.setlists, now, excerpt);
      h.save(r.score, r.setlists);
      moved?.(excerpt);
      if (using.length) h.say(`Changed “${now.name}” in ${plural(using.length, 'setlist')}.`);
    },
  });
}

/**
 * Change a named excerpt's name and cuts together. Every entry that plays it moves with it.
 * `moved` hears where it went, when its cuts changed.
 */
export function changeNamedExcerpt(src: ExcerptSource, x: NamedExcerpt, h: NamedExcerptHost, moved?: (to: Excerpt) => void) {
  const score = src.state.score, now = score.excerpts?.find((n) => n.name === x.name) ?? x;
  const using = _setlistsPlaying(h.setlists, score, now);
  openExcerptPicker({
    ...src,
    question: `Change “${now.name}”`,
    verb: 'It plays',
    excerpt: now,
    name: now.name,
    problem: (excerpt, name) => nameProblem(score, excerpt, name, now),
    okLabel: using.length ? `Change in ${plural(using.length, 'setlist')}` : 'Done',
    done: (excerpt, name) => {
      const sameCuts = sameExcerpt(score.cuts, excerpt, now);
      if (sameCuts && name === now.name) return;
      const r = moveExcerpt(score, h.setlists, now, excerpt, name);
      h.save(r.score, r.setlists);
      if (!sameCuts) moved?.(excerpt);
      if (using.length) h.say(`Changed “${now.name}” in ${plural(using.length, 'setlist')}.`);
    },
  });
}

/** Take the name off an excerpt. Setlists that play it keep playing the same music. */
export function deleteNamedExcerpt(score: Score, x: NamedExcerpt, h: NamedExcerptHost) {
  const using = _setlistsPlaying(h.setlists, score, x);
  const pages = excerptLabel(score.cuts, x, h.aspects);
  const d = showDialog(`Delete “${x.name}”?`);
  d.append(
    el('p', '', using.length
      ? `${using.map((s) => `“${s.title}”`).join(', ')} still ${using.length === 1 ? 'plays' : 'play'} the same music, as ${pages ?? 'part of the score'}.`
      : 'The score and its cuts stay as they are.'),
    buttonRow(button('Cancel', closeOverlay), button('Delete', () => {
      closeOverlay();
      h.save(deleteFromScore(score, x));
      h.say(`Deleted “${x.name}”.`);
    }, 'danger')),
  );
}
