// The Page scale dialog, from the library's ⋯ menu: how far a page may shrink to fit more on a
// screen.

import { saveSmallestScale } from '../settings/store';
import { smallestScalePercent } from '../settings/turning';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { failedOnce } from '../ui/failure';

/** `changed` is called when a new scale has been let go of: the pages kept offline depend on it. */
export function openPageScale(changed: () => void): void {
  const d = showDialog('Page scale');
  const input = document.createElement('input');
  input.type = 'range';
  Object.assign(input, { min: '10', max: '100', step: '5', value: String(smallestScalePercent()) });
  input.setAttribute('aria-label', 'Smallest page scale');
  const value = el('span', 'value');
  const hint = el('p', 'hint');
  const show = () => {
    value.textContent = `${input.value}%`;
    hint.textContent = `Pages may shrink to fit more on a screen, down to ${input.value}% of their full size.`;
  };
  show();
  input.addEventListener('input', () => {
    show();
    void saveSmallestScale(Number(input.value)).catch((e) => failedOnce('save the page scale', e));
  });
  input.addEventListener('change', changed);
  const row = el('div', 'page-scale-row');
  row.append(input, value);
  d.append(row, hint, buttonRow(button('Done', closeOverlay, 'primary')));
}
