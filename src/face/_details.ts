// A fitted face gesture's Details in its row: its rest level and each rep's peak, and a table of its
// template's channels, with the channels' values now beside what they must be.

import type { Gesture } from './gestures';
import { CHANNELS, pastLimit, shortOf } from './_template';
import { el } from '../ui/dom';

const two = (v: number) => v.toFixed(2);
/** How far short or past a limit a channel must be, over this, to show in the warning colour. */
const BAD = 0.25;

/** A fitted gesture's Details: the line and the table; `update` shows a frame's values in the Now column. */
export function faceDetails(g: Gesture): { el: HTMLDetailsElement; update(x: Float32Array | null): void } {
  const t = g.fit.template!;
  const details = el('details', 'face-details');
  details.append(el('summary', '', 'Details'));
  details.append(el('p', 'hint', `Rest level ${two(g.fit.rest ?? 0)}. Each rep, left out: ${(g.fit.peaks ?? []).map(two).join(', ')}.`));
  const table = el('table');
  const head = table.insertRow();
  for (const h of ['Channel', 'Must be', 'At rest', 'Rest reaches', 'Separation', 'Now']) head.append(el('th', '', h));
  /** A row's cells, and its Now cell, which `update` fills. */
  const add = (cells: string[]) => {
    const tr = table.insertRow();
    cells.forEach((text, i) => {
      const c = tr.insertCell();
      c.textContent = text;
      if (i > 1) c.className = 'n';
    });
    const now = tr.insertCell();
    now.className = 'n';
    return now;
  };
  const updates: ((x: Float32Array | null) => void)[] = [];
  /** Shows a channel's value and how far off it is (0 to 1), in the warning colour over a quarter. */
  const show = (cell: HTMLElement, v: number | undefined, off: number) => {
    cell.textContent = v === undefined ? '–' : `${two(v)} (${two(off)})`;
    cell.classList.toggle('bad', v !== undefined && off > BAD);
  };
  for (const r of t.rows) {
    const cell = add([CHANNELS[r.c], `${r.side > 0 ? '≥' : '≤'} ${two(r.edge)}`, two(r.rest), two(r.far), two(r.separation)]);
    updates.push((x) => show(cell, x?.[r.c], x ? shortOf(r, x[r.c]) : 0));
  }
  for (const k of t.limits) {
    const cell = add([CHANNELS[k.c], `${k.side > 0 ? '≤' : '≥'} ${two(k.limit)}, out at ${two(k.full)}`, two(k.rest), '', '']);
    updates.push((x) => show(cell, x?.[k.c], x ? pastLimit(k, x[k.c]) : 0));
  }
  const wrap = el('div', 'face-table');
  wrap.append(table);
  details.append(wrap);
  updates.forEach((u) => u(null));
  return { el: details, update: (x) => { if (details.open) updates.forEach((u) => u(x)); } };
}
