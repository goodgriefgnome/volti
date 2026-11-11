// The Marking colours dialog, from the library's ⋯ menu: the app's colours for placed markings and
// their backgrounds.

import { BUILT_IN_COLORS, markingColors, type MarkingColors } from '../markings/placed';
import { saveMarkingColors } from '../markings/store';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { failedOnce } from '../ui/failure';

const ROWS: [key: keyof MarkingColors, name: string][] = [['color', 'Marking'], ['background', 'Background']];

export function openMarkingColors(): void {
  const d = showDialog('Marking colours');
  for (const [key, name] of ROWS) {
    const row = el('div', 'marking-colors-row');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = markingColors()[key];
    input.setAttribute('aria-label', `${name} colour`);
    const builtIn = button('Built-in', () => set(BUILT_IN_COLORS[key]), 'quiet');
    const set = (color: string) => {
      input.value = color;
      builtIn.disabled = color === BUILT_IN_COLORS[key];
      void saveMarkingColors({ ...markingColors(), [key]: color }).catch((e) => failedOnce('save the marking colours', e));
    };
    builtIn.disabled = input.value === BUILT_IN_COLORS[key];
    input.addEventListener('input', () => set(input.value));
    row.append(el('span', 'name', name), input, builtIn);
    d.append(row);
  }
  d.append(
    el('p', 'hint', 'For symbols, text and backgrounds on Default, and for new pen and highlighter strokes on Default. Strokes keep the colour they were drawn in.'),
    buttonRow(button('Done', closeOverlay, 'primary')),
  );
}
