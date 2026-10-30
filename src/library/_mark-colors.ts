// The Marking colours dialog, from the library's ⋯ menu: the app's colours for placed markings and
// their backgrounds.

import { BUILT_IN_COLORS, markColors, type MarkColors } from '../markings/placed';
import { saveMarkColors } from '../markings/store';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';

const ROWS: [key: keyof MarkColors, name: string][] = [['color', 'Marking'], ['background', 'Background']];

export function openMarkColors(): void {
  const d = showDialog('Marking colours');
  for (const [key, name] of ROWS) {
    const row = el('div', 'mark-colors-row');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = markColors()[key];
    input.setAttribute('aria-label', `${name} colour`);
    const builtIn = button('Built-in', () => set(BUILT_IN_COLORS[key]), 'quiet');
    const set = (color: string) => {
      input.value = color;
      builtIn.disabled = color === BUILT_IN_COLORS[key];
      void saveMarkColors({ ...markColors(), [key]: color }).catch((e) => console.warn('Could not save the marking colours:', e));
    };
    builtIn.disabled = input.value === BUILT_IN_COLORS[key];
    input.addEventListener('input', () => set(input.value));
    row.append(el('span', 'name', name), input, builtIn);
    d.append(row);
  }
  d.append(
    el('p', 'hint', 'For symbols and text without a colour of their own. Pen and highlighter strokes keep theirs.'),
    buttonRow(button('Done', closeOverlay, 'primary')),
  );
}
