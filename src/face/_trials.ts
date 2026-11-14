// The trials panel in a gesture's details: a row of chips for what to show (the strength, a channel,
// a limit's channel), and every trial, the latest first, scrolling with the dialog: a switch to enable
// or disable it, its number, a trace of what is shown, and its numbers. What the traces and numbers
// are is _dialog-helpers.ts's.

import { el } from '../ui/dom';
import { trialView, type TrialView } from './_dialog-helpers';
import type { Trial } from './_recording';
import { CHANNELS } from './_template';
import type { Gesture } from './gestures';

export type Shown = 'strength' | number;

export interface TrialsPanelOptions {
  g: Gesture;
  /** All its trials, in stored order. */
  trials: Trial[];
  shown: Shown;
  /** The chip picked. */
  show(shown: Shown): void;
  /** The switch of the trial at `index` (stored order). */
  disable(index: number, disabled: boolean): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const two = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');

/** A trial's trace: what is shown through the trial, 0 at the bottom and 1 at the top, its held part shaded, the two levels dashed, a tick under each misfire. */
function trace(v: TrialView): SVGSVGElement {
  const length = Math.max(1, v.trace[v.trace.length - 1]?.t ?? 1);
  const s = svg('svg', { class: 'trace', viewBox: `0 0 ${length} 1`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  s.append(svg('rect', { class: 'held', x: v.held[0], y: 0, width: Math.max(0, v.held[1] - v.held[0]), height: 1 }));
  for (const level of v.levels) s.append(svg('line', { class: 'level', x1: 0, x2: length, y1: 1 - level, y2: 1 - level }));
  s.append(svg('polyline', { class: 'line', points: v.trace.map((p) => `${p.t},${1 - Math.min(1, Math.max(0, p.v))}`).join(' ') }));
  for (const t of v.misfires) s.append(svg('line', { class: 'misfire', x1: t, x2: t, y1: 0.86, y2: 1 }));
  return s;
}

export function trialsPanel(o: TrialsPanelOptions): HTMLElement {
  const { g } = o;
  const panel = el('div', 'face-trials');
  const template = g.fit.template;

  // What to show: the strength, then the channels of the template, then each limit's channel.
  const chips = el('div', 'face-chips');
  chips.append(el('span', '', 'Show'));
  const choices: { shown: Shown; label: string }[] = [{ shown: 'strength', label: 'Strength' }];
  for (const r of template?.rows ?? []) choices.push({ shown: r.c, label: CHANNELS[r.c] });
  for (const k of template?.limits ?? []) choices.push({ shown: k.c, label: CHANNELS[k.c] });
  // A channel shown that is not in the template now (it was forced off, or the fit changed) is the strength.
  const shown: Shown = choices.some((c) => c.shown === o.shown) ? o.shown : 'strength';
  for (const c of choices) {
    const chip = el('button', c.shown === shown ? 'chip on' : 'chip', c.label);
    chip.type = 'button';
    if (c.shown !== 'strength') chip.classList.add('mono');
    chip.addEventListener('click', () => o.show(c.shown));
    chips.append(chip);
  }
  if (template) panel.append(chips);

  const table = el('div', 'face-trials-table');
  const names = shown === 'strength' ? ['Held', 'At rest'] : ['Held', 'At rest', 'Past'];
  const head = el('div', `tr head${names.length === 2 ? ' two' : ''}`);
  head.append(el('span', ''), el('span', 'n', '#'), el('span', '', template ? 'trace' : ''), ...(template ? names : []).map((n) => el('span', 'n', n)));
  table.append(head);

  // The latest first.
  for (let i = o.trials.length - 1; i >= 0; i--) {
    const t = o.trials[i];
    const v = template ? trialView(t, i, o.trials, g, shown) : undefined;
    const row = el('div', `tr${names.length === 2 ? ' two' : ''}${t.disabled ? ' off' : ''}${v?.bad.some(Boolean) && !t.disabled ? ' flagged' : ''}`);
    const sw = el('button', t.disabled ? 'face-switch' : 'face-switch on');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(!t.disabled));
    sw.setAttribute('aria-label', `Trial ${i + 1}`);
    sw.addEventListener('click', () => o.disable(i, !t.disabled));
    row.append(sw, el('span', 'n', String(i + 1)));
    if (v) {
      const cell = el('span', 'trace-cell');
      cell.append(trace(v));
      row.append(cell);
      v.numbers.forEach((n, k) => {
        const text = shown !== 'strength' && k === 2 ? `${Math.round(n * 100)}%` : two(n);
        row.append(el('span', v.bad[k] ? 'n bad' : 'n', text));
      });
    }
    table.append(row);
  }
  panel.append(table);
  return panel;
}
