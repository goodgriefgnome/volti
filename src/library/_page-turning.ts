// The Page turning dialog, from the library's ⋯ menu: how far a page may shrink to fit more on a
// screen, and how long a turn slides.

import { saveSlideMs, saveSmallestScale } from '../settings/store';
import { slideMs, smallestScalePercent } from '../settings/turning';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { failedOnce } from '../ui/failure';

/** A row: a label, a range input and its value, then its hint; `show` writes the value and the hint from the input, as it moves, and `save` keeps it. */
function sliderRow(d: HTMLElement, label: string, ariaLabel: string, range: { min: number; max: number; step: number; value: number }, show: (input: HTMLInputElement, value: HTMLElement, hint: HTMLElement) => void, save: (n: number) => void) {
  const input = document.createElement('input');
  input.type = 'range';
  Object.assign(input, { min: String(range.min), max: String(range.max), step: String(range.step), value: String(range.value) });
  input.setAttribute('aria-label', ariaLabel);
  const value = el('span', 'value');
  const hint = el('p', 'hint');
  const row = el('div', 'page-turning-row');
  row.append(el('span', 'name', label), input, value);
  d.append(row, hint);
  show(input, value, hint);
  input.addEventListener('input', () => { show(input, value, hint); save(Number(input.value)); });
  return input;
}

/** `changed` is called when a new scale has been let go of: the pages kept offline depend on it. */
export function openPageTurning(changed: () => void): void {
  const d = showDialog('Page turning');
  const scale = sliderRow(d, 'Smallest page scale', 'Smallest page scale', { min: 10, max: 100, step: 5, value: smallestScalePercent() }, (input, value, hint) => {
    value.textContent = `${input.value}%`;
    hint.textContent = `Pages may shrink to fit more on a screen, down to ${input.value}% of their full size.`;
  }, (n) => void saveSmallestScale(n).catch((e) => failedOnce('save the page scale', e)));
  scale.addEventListener('change', changed);
  sliderRow(d, 'Slide', 'Slide time', { min: 0, max: 1000, step: 50, value: slideMs() }, (input, value, hint) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    value.textContent = input.value === '0' ? 'Off' : `${input.value} ms`;
    hint.textContent = reduced ? "This device asks for reduced motion, so turns don't slide."
      : input.value === '0' ? 'Turns show the next pages at once.' : `A turn slides the pages along over ${input.value} ms.`;
  }, (n) => void saveSlideMs(n).catch((e) => failedOnce('save the slide time', e)));
  d.append(buttonRow(button('Done', closeOverlay, 'primary')));
}
