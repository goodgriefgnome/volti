// Small helpers for building elements and text, used everywhere. No state.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Device pixels to a CSS pixel on this screen. */
export const dpr = () => window.devicePixelRatio || 1;

export const plural = (n: number, word: string, words = word + 's') => `${n} ${n === 1 ? word : words}`;

/**
 * Focus a text field with its text highlighted, so typing replaces it. The first tap in it puts
 * the cursor where it lands instead: on Android, a tap on highlighted text offers cut and copy.
 */
export function focusHighlighted(input: HTMLInputElement) {
  input.focus();
  input.select();
  input.addEventListener('pointerdown', () => input.setSelectionRange(input.selectionEnd, input.selectionEnd), { once: true });
}
