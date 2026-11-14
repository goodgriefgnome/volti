// A channel's row in a gesture's details: a switch, its name (and its partner's, when it has a
// limit), a bar of lanes, and the thresholds in numbers. A lane holds where the trials' frames lie
// (at rest hatched, held solid) with the threshold as a pennant, and the partner's lane the limit as
// a bracket. The values now are a dot on the channel's lane and a ring on the partner's. Nothing
// here is moved by hand: the thresholds are the fit's.

import { el } from '../ui/dom';
import { CHANNELS, type Limit, type Row } from './_template';

/** Where a channel's values lie in the trials' frames, 10th to 90th percentile (`bandsOf` in _dialog-helpers.ts). */
export interface Bands { rest: [number, number]; held: [number, number] }

export interface ChannelRowOptions {
  row: Row;
  bands: Bands;
  /** The limit on this channel's partner, if it has one, and where the partner's values lie. */
  limit?: Limit;
  limitBands?: Bands;
  /** The channel is forced off: its row is greyed, with everything left where it was. */
  off: boolean;
  /** The limit's own forced-off: its chip, lane, bands and bracket are greyed. */
  limitOff: boolean;
  /** The switch: on, or off (forced off). */
  useChannel(on: boolean): void;
  /** The limit's chip: on, or off. */
  useLimit(on: boolean): void;
}

export interface ChannelRow {
  el: HTMLElement;
  /** The channels' values now (null without a face); shown when the row is off too. */
  show(x: Float32Array | null): void;
}

const pct = (v: number) => `${v * 100}%`;
const two = (v: number) => v.toFixed(2);
const SVG = 'http://www.w3.org/2000/svg';

/** A bracket icon for the chip, ] for a limit to stay under and [ for one to stay over. */
function bracketIcon(under: boolean): SVGSVGElement {
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

/** A lane with its two bands: held, then rest drawn over it. */
function lane(cls: string, bands: Bands): HTMLElement {
  const l = el('div', `lane ${cls}`);
  for (const [kind, [lo, hi]] of [['held', bands.held], ['rest', bands.rest]] as const) {
    const b = el('div', `band ${kind}`);
    b.style.left = pct(lo);
    b.style.width = pct(Math.max(0, hi - lo));
    l.append(b);
  }
  return l;
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
    chip.append(bracketIcon(limit.side > 0), CHANNELS[limit.c]);
    chip.addEventListener('click', () => o.useLimit(o.limitOff));
    names.append(chip);
  }

  // The bar: one scale, 0 to 1. The channel's lane, and under it its partner's when it has a limit.
  const bar = el('div', limit ? 'face-bar pair' : 'face-bar');
  bar.append(lane('top', o.bands));
  const restTick = el('div', 'rest-tick');
  restTick.style.left = pct(row.rest);
  const pennant = el('div', `pennant ${limit ? 'pair' : ''} ${row.side > 0 ? 'least' : 'most'}`);
  pennant.style.left = pct(row.edge);
  bar.append(restTick, pennant);
  const dot = el('div', 'dot');
  dot.hidden = true;

  const thr = el('div', 'face-thr');
  thr.append(el('span', '', `${row.side > 0 ? '≥' : '≤'} ${two(row.edge)}`));

  let ring: HTMLElement | undefined;
  if (limit && o.limitBands) {
    bar.append(lane(o.limitOff ? 'low grey' : 'low', o.limitBands));
    const br = el('div', `br ${limit.side > 0 ? 'under' : 'over'}${o.limitOff ? ' grey' : ''}`);
    br.style.left = pct(limit.limit);
    bar.append(br);
    ring = el('div', 'ring');
    ring.hidden = true;
    thr.append(el('span', o.limitOff ? 'lim off' : 'lim', `${limit.side > 0 ? '≤' : '≥'} ${two(limit.limit)}`));
  }
  // The values now are over everything.
  bar.append(dot);
  if (ring) bar.append(ring);
  root.append(sw, names, bar, thr);

  return {
    el: root,
    show(x) {
      dot.hidden = !x;
      if (ring) ring.hidden = !x;
      if (!x) return;
      dot.style.left = pct(x[row.c]);
      if (ring && limit) ring.style.left = pct(x[limit.c]);
    },
  };
}
