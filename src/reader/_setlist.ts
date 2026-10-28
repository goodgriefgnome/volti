// How the reader shows where it is in a setlist: the title, the card naming a score, and the box
// after a score's last frame. Display only; moving between scores is in reader.ts.

import { el } from '../ui/dom';

const SCORE_CARD_MS = 2200;

/** Why a score can't be shown: its file can't be read until access to the scores folder is allowed, it can't be found, or only its saved pages can be shown and this screen's aren't saved. */
export type Unread = 'access' | 'missing' | 'unsaved';

const UNREAD_LABEL: Record<Unread, string> = {
  access: 'Needs access to the scores folder',
  missing: 'Can’t find',
  unsaved: 'Not saved for this screen',
};

/**
 * What fills the rest of a score's last screen: the next score's title, or the end of the
 * setlist. With `unread`, the title of a score that can't be shown, and why.
 */
export function blankBox(next: string | undefined, unread?: { title: string; why: Unread }): HTMLElement {
  const box = el('div', 'page blank');
  if (unread) box.append(el('span', 'label', UNREAD_LABEL[unread.why]), el('span', 't', `“${unread.title}”`));
  else if (next) box.append(el('span', 'label', 'Next'), el('span', 't', next));
  else box.append(el('span', 'label', 'End of the setlist'));
  return box;
}

/** "2/3 Gymnopédie No. 1": score k of n. */
export function showSetlistTitle(target: HTMLElement, k: number, n: number, title: string) {
  target.replaceChildren(el('b', '', `${k + 1}/${n} `), title);
}

/** Names the score for a moment when the reader turns into it. */
export class ScoreCard {
  private card: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The score named last. */
  private shown = -1;

  constructor(private root: HTMLElement) {}

  show(k: number, n: number, title: string) {
    if (this.shown === k) return;
    this.shown = k;
    this.card?.remove();
    clearTimeout(this.timer);
    const card = el('p', 'score-card');
    card.append(el('b', '', `${k + 1} OF ${n}`), title);
    this.root.append(card);
    this.card = card;
    this.timer = setTimeout(() => card.classList.add('gone'), SCORE_CARD_MS);
  }

  stop() {
    clearTimeout(this.timer);
  }
}
