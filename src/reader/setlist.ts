// How the reader shows where it is in a setlist: the title, the card naming a score, and the box
// after a score's last frame. Display only; moving between scores is in reader.ts.

import { el } from '../ui';

const SCORE_CARD_MS = 2200;

/**
 * What fills the rest of a score's last screen: the next score's title, or the end of the
 * setlist. With `missing`, the title of a score that can't be opened; with `needsAccess` too,
 * one that can't be read until access to the scores folder is allowed.
 */
export function blankBox(next: string | undefined, missing?: string, needsAccess = false): HTMLElement {
  const box = el('div', 'page blank');
  if (missing && needsAccess) box.append(el('span', 'label', 'Needs access to the scores folder'), el('span', 't', `“${missing}”`));
  else if (missing) box.append(el('span', 'label', 'Can’t find'), el('span', 't', `“${missing}”`));
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
