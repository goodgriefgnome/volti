// The strength meter with an On handle: a gesture's strength now, 0 to 1, with On as a handle that
// is dragged (the whole meter takes the pointer) or moved with the arrow keys, and Release as a
// dashed line that follows it. The list shows it small; a gesture's details show it tall, with tags
// and ticks under it.

import { el } from '../ui/dom';
import { clamp, LEVEL_RANGE } from './gestures';

export interface MeterOptions {
  /** The details' meter: 24 px tall, with tags on the handles and ticks under it. The list's is 8 px with a 14 px handle. */
  tall: boolean;
  on: number;
  release: number;
  /** Under a tall meter: the rest level, and each enabled trial's held strength; one under On is in the warning colour. */
  ticks?: { rest: number; trials: number[] };
  /** On was moved to this (to 0.01, in range). */
  drag(on: number): void;
}

export interface Meter {
  el: HTMLElement;
  /** The strength now. */
  show(strength: number): void;
  /** On and Release moved, by the caller. */
  levels(on: number, release: number): void;
}

const STEP = 0.01;
const round = (v: number) => Math.round(v / STEP) * STEP;

export function strengthMeter(o: MeterOptions): Meter {
  const root = el('div', o.tall ? 'face-meter tall' : 'face-meter');
  const track = el('div', 'track');
  const fill = el('div', 'fill');
  track.append(fill);
  const releaseLine = el('div', 'release');
  const handle = el('div', 'on');
  handle.tabIndex = 0;
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'On');
  handle.setAttribute('aria-valuemin', String(LEVEL_RANGE.min));
  handle.setAttribute('aria-valuemax', String(LEVEL_RANGE.max));
  const onTag = el('span', 'tag');
  const releaseTag = el('span', 'tag');
  if (o.tall) {
    handle.append(onTag, el('span', 'line'));
    releaseLine.append(releaseTag, el('span', 'line'));
  } else handle.append(el('span', 'line'));
  root.append(track, releaseLine, handle);
  const ticks = el('div', 'ticks');
  if (o.tall && o.ticks) root.append(ticks);

  let on = o.on;
  const levels = (nextOn: number, release: number) => {
    on = nextOn;
    handle.style.left = `${nextOn * 100}%`;
    releaseLine.style.left = `${release * 100}%`;
    handle.setAttribute('aria-valuenow', nextOn.toFixed(2));
    onTag.textContent = `On ${nextOn.toFixed(2)}`;
    releaseTag.textContent = release.toFixed(2);
    for (const t of ticks.querySelectorAll<HTMLElement>('.trial-tick')) t.classList.toggle('low', Number(t.dataset.at) < nextOn);
  };
  if (o.tall && o.ticks) {
    const addTick = (v: number, cls: string, label?: string) => {
      const t = el('span', `tick ${cls}`);
      t.style.left = `${v * 100}%`;
      t.dataset.at = String(v);
      if (label) t.append(el('span', 'label', label));
      ticks.append(t);
    };
    addTick(o.ticks.rest, 'rest', 'rest');
    o.ticks.trials.forEach((v, i) => addTick(v, 'trial-tick', i === 0 ? 'trials' : undefined));
  }
  levels(o.on, o.release);

  const move = (to: number) => {
    const v = clamp(round(to), LEVEL_RANGE.min, LEVEL_RANGE.max);
    if (v === on) return;
    // The handle follows at once; the caller then gives Release, which follows On.
    on = v;
    handle.style.left = `${v * 100}%`;
    o.drag(v);
  };
  const at = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    move((e.clientX - r.left) / r.width);
  };
  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    at(e);
  });
  root.addEventListener('pointermove', (e) => { if (root.hasPointerCapture(e.pointerId)) at(e); });
  handle.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? STEP : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -STEP : 0;
    if (!d) return;
    e.preventDefault();
    move(on + d);
  });

  return {
    el: root,
    show: (s) => { fill.style.width = `${clamp(s, 0, 1) * 100}%`; },
    levels,
  };
}
