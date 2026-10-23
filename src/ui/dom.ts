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

/** A padlock, for something that needs a password; `label` says so to screen readers. */
export function lockIcon(label: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.classList.add('lock-icon');
  const shackle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shackle.setAttribute('d', 'M8 11V8a4 4 0 0 1 8 0v3');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({ x: '5', y: '11', width: '14', height: '10', rx: '2' })) body.setAttribute(k, v);
  svg.append(shackle, body);
  return svg;
}
