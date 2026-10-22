import { el } from '../ui/dom';

// How the reader shows where it is in a setlist.

const PIECE_CARD_MS = 2200;

/**
 * What fills the rest of a piece's last screen: the next piece's title, or the end of the
 * setlist. With `missing`, the title of a piece that can't be opened.
 */
export function blankBox(next: string | undefined, missing?: string): HTMLElement {
  const box = el('div', 'page blank');
  if (missing) box.append(el('span', 'label', 'Can’t find'), el('span', 't', `“${missing}”`));
  else if (next) box.append(el('span', 'label', 'Next'), el('span', 't', next));
  else box.append(el('span', 'label', 'End of the setlist'));
  return box;
}

/** "2/3 Gymnopédie No. 1": piece k of n. */
export function showSetlistTitle(target: HTMLElement, k: number, n: number, title: string) {
  target.replaceChildren(el('b', '', `${k + 1}/${n} `), title);
}

/** Names the piece for a moment when the reader turns into it. */
export class PieceCard {
  private card: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The piece named last. */
  private shown = -1;

  constructor(private root: HTMLElement) {}

  show(k: number, n: number, title: string) {
    if (this.shown === k) return;
    this.shown = k;
    this.card?.remove();
    clearTimeout(this.timer);
    const card = el('p', 'piece-card');
    card.append(el('b', '', `${k + 1} OF ${n}`), title);
    this.root.append(card);
    this.card = card;
    this.timer = setTimeout(() => card.classList.add('gone'), PIECE_CARD_MS);
  }

  stop() {
    clearTimeout(this.timer);
  }
}
