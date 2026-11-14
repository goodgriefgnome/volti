// A channel's row in a gesture's details: a switch, its name (and its partner's, when it has a
// limit), a bar of lanes with the threshold as a pennant and the limit as a bracket, both dragged
// or moved with the arrow keys, and the thresholds in numbers. The values now are shown as dots.

import { el } from '../ui/dom';
import { CHANNELS, type Limit, type Row } from './_template';

export interface ChannelRowOptions {
  row: Row;
  /** The limit on this channel's partner, if it has one. */
  limit?: Limit;
  /** The channel is forced off: its row is greyed, with everything left where it was. */
  off: boolean;
  /** The limit's own forced-off: its chip, lane and bracket are greyed. */
  limitOff: boolean;
  /** The switch: on, or off (forced off). */
  useChannel(on: boolean): void;
  /** The limit's chip: on, or off. */
  useLimit(on: boolean): void;
}

export interface ChannelRow {
  el: HTMLElement;
  /** The channels' values now (null without a face). */
  show(x: Float32Array | null): void;
}

const pct = (v: number) => `${v * 100}%`;
const two = (v: number) => v.toFixed(2);
const SVG = 'http://www.w3.org/2000/svg';

/** A bracket, ] for a limit to stay under and [ for one to stay over. */
function bracket(under: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 12 22');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', under ? 'M2 2h7v18H2' : 'M10 2H3v18h7');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '3');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

export function channelRow(o: ChannelRowOptions): ChannelRow {
  const { row, limit } = o;
  const root = el('div', o.off ? 'face-ft off' : 'face-ft');

  const sw = el('button', o.off ? 'face-switch' : 'face-switch on');
  sw.type = 'button';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(!o.off));
  sw.setAttribute('aria-label', CHANNELS[row.c]);
  sw.addEventListener('click', () => o.useChannel(o.off));

  const names = el('div', 'face-names');
  names.append(el('span', 'fname', CHANNELS[row.c]));
  if (limit) {
    const chip = el('button', o.limitOff ? 'face-partner off' : 'face-partner');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(!o.limitOff));
    chip.append(bracket(limit.side > 0), CHANNELS[limit.c]);
    chip.addEventListener('click', () => o.useLimit(o.limitOff));
    names.append(chip);
  }

  // The bar: one scale, 0 to 1. The channel's lane, and under it its partner's when it has a limit.
  const bar = el('div', 'face-bar');
  const lane = el('div', limit ? 'lane top' : 'lane only');
  const band = el('div', 'band');
  band.style.left = pct(Math.min(row.rest, row.far));
  band.style.width = pct(Math.abs(row.far - row.rest));
  lane.append(band);
  const restTick = el('div', limit ? 'rest-tick top' : 'rest-tick only');
  restTick.style.left = pct(row.rest);
  const dot = el('div', limit ? 'dot top' : 'dot only');
  dot.hidden = true;
  bar.append(lane, restTick, dot);

  let edge = row.edge;
  const pennant = el('div', `pennant ${limit ? 'pair' : 'only'} ${row.side > 0 ? 'least' : 'most'}`);
  pennant.style.left = pct(edge);
  pennant.tabIndex = o.off ? -1 : 0;
  pennant.setAttribute('role', 'slider');
  pennant.setAttribute('aria-label', `${CHANNELS[row.c]} threshold`);
  pennant.dataset.focus = `p${row.c}`;

  const thr = el('div', 'face-thr');
  const edgeText = el('span', '', `${row.side > 0 ? '≥' : '≤'} ${two(edge)}`);
  thr.append(edgeText);

  let partnerDot: HTMLElement | undefined;
  let limitAt = limit?.limit ?? 0;
  let limitText: HTMLElement | undefined;
  let bracketEl: HTMLElement | undefined;
  if (limit) {
    const low = el('div', o.limitOff ? 'lane low grey' : 'lane low');
    bar.append(low);
    partnerDot = el('div', 'dot low');
    partnerDot.hidden = true;
    bar.append(partnerDot);
    bracketEl = el('div', `br ${limit.side > 0 ? 'under' : 'over'}${o.limitOff ? ' grey' : ''}`);
    bracketEl.append(bracket(limit.side > 0));
    bracketEl.style.left = pct(limitAt);
    bracketEl.tabIndex = o.off || o.limitOff ? -1 : 0;
    bracketEl.setAttribute('role', 'slider');
    bracketEl.setAttribute('aria-label', `${CHANNELS[limit.c]} limit`);
    bracketEl.dataset.focus = `b${limit.c}`;
    limitText = el('span', o.limitOff ? 'lim off' : 'lim', `${limit.side > 0 ? '≤' : '≥'} ${two(limitAt)}`);
    thr.append(limitText);
  }
  bar.append(pennant);
  if (bracketEl) bar.append(bracketEl);
  if (o.off) bar.classList.add('grey');

  root.append(sw, names, bar, thr);

  return {
    el: root,
    show(x) {
      dot.hidden = !x;
      if (partnerDot) partnerDot.hidden = !x;
      if (!x) return;
      const v = x[row.c];
      dot.style.left = pct(v);
      dot.classList.toggle('good', row.side * (v - edge) >= 0);
      pennant.setAttribute('aria-valuenow', two(edge));
      if (limit && partnerDot) {
        const w = x[limit.c];
        partnerDot.style.left = pct(w);
        partnerDot.classList.toggle('hot', limit.side * (w - limitAt) > 0);
        bracketEl?.setAttribute('aria-valuenow', two(limitAt));
      }
    },
  };
}
