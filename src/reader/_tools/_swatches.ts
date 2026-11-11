// Rows of colour and background swatches, for the tools' long-press panels.

import { markingColors, type Background } from '../../markings/placed';
import type { BackgroundChoice, ColorChoice } from '../../markings/tool-settings';
import { el } from '../../ui/dom';

export const BACKGROUNDS: [choice: BackgroundChoice, label: string][] = [
  ['none', 'No background'], ['box', 'Box'], ['tag-left', 'Tag pointing left'], ['tag-right', 'Tag pointing right'],
];

/** The outline of each shape in a 24 × 16 picture. */
const SHAPE_POINTS: Record<Background['shape'], string> = {
  box: '3,2 21,2 21,14 3,14',
  'tag-left': '3,2 21,2 21,14 3,14 0,8',
  'tag-right': '3,2 21,2 24,8 21,14 3,14',
};

/** A small picture of a background shape in `fill` (the default background colour) (none: an empty square crossed by a line). */
export function backgroundPicture(choice: BackgroundChoice, fill = markingColors().background): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 16');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  if (choice === 'none') {
    const rect = document.createElementNS(ns, 'rect');
    for (const [k, v] of Object.entries({ x: '3', y: '2', width: '18', height: '12', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })) rect.setAttribute(k, v);
    const line = document.createElementNS(ns, 'line');
    for (const [k, v] of Object.entries({ x1: '3', y1: '14', x2: '21', y2: '2', stroke: 'currentColor', 'stroke-width': '1.5' })) line.setAttribute(k, v);
    svg.append(rect, line);
  } else {
    const shape = document.createElementNS(ns, 'polygon');
    shape.setAttribute('points', SHAPE_POINTS[choice]);
    shape.setAttribute('fill', fill);
    svg.append(shape);
  }
  return svg;
}

/** A row of swatches: Default first (a dashed ring, `defaultColor` its fill), then `colors`; `chosen` lit. */
export function swatchRow(colors: readonly string[], defaultColor: string, chosen: ColorChoice, pick: (c: ColorChoice) => void): HTMLElement {
  const row = el('div', 'swatch-row');
  row.setAttribute('role', 'group');
  const swatch = (choice: ColorChoice, fill: string, label: string, cls = '') => {
    const b = el('button', `swatch ${cls}`.trim());
    b.type = 'button';
    b.style.setProperty('--swatch', fill);
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(chosen === choice));
    b.addEventListener('click', () => pick(choice));
    return b;
  };
  row.append(swatch('default', defaultColor, 'Default', 'default'), ...colors.map((c, i) => swatch(c, c, `Colour ${i + 1}`)));
  return row;
}

/** The background shapes (none, box, tags), `chosen` lit, filled with `fill`. */
export function shapeRow(chosen: BackgroundChoice, fill: string, pick: (b: BackgroundChoice) => void): HTMLElement {
  const row = el('div', 'shape-row');
  row.setAttribute('role', 'group');
  for (const [choice, label] of BACKGROUNDS) {
    const b = el('button', 'shape');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.setAttribute('aria-pressed', String(chosen === choice));
    b.append(backgroundPicture(choice, fill));
    b.addEventListener('click', () => pick(choice));
    row.append(b);
  }
  return row;
}
