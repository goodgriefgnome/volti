// The face gestures' button: its glyph, the look of each state, the split ring showing how close
// a turn is, the long press's filling ring and the pulse on a turn. The reader places it; its
// styles are styles/face.css.

import { LONG_PRESS_MS, onLongPress } from '../ui/long-press';
import { el } from '../ui/dom';
import type { Progress } from './_detector';
import type { FaceButtonStatus } from './button-status';
import type { TurnDir } from './gestures';

export type { FaceButtonStatus };

export interface FaceButton {
  el: HTMLElement;
  show(s: FaceButtonStatus): void;
  /** The split ring; no progress empties it. */
  progress(p?: Record<TurnDir, Progress>): void;
  /** One pulse. */
  pulse(): void;
}

const VIEWFINDER = 'M4 8V5.5C4 4.7 4.7 4 5.5 4H8M16 4h2.5c.8 0 1.5.7 1.5 1.5V8M20 16v2.5c0 .8-.7 1.5-1.5 1.5H16M8 20H5.5c-.8 0-1.5-.7-1.5-1.5V16'
  + 'M14.5 10.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0' // the head
  + 'M7.8 16.5c.9-1.6 2.4-2.5 4.2-2.5s3.3.9 4.2 2.5'; // the shoulders
const SLASH = 'M4 4l16 16'; // added for "can't turn on"

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/** The arc of radius r round (32, 32) from angle a to b, in degrees from the top, clockwise positive. */
function arc(r: number, a: number, b: number): string {
  const p = (d: number) => { const t = (d - 90) * Math.PI / 180; return `${32 + r * Math.cos(t)} ${32 + r * Math.sin(t)}`; };
  return `M${p(a)}A${r} ${r} 0 ${Math.abs(b - a) > 180 ? 1 : 0} ${b > a ? 1 : 0} ${p(b)}`;
}

/** The most a half of the ring runs round, in degrees: a gap is left at the bottom. */
const SWEEP = 170;
/** The ring's circle: 6.5 px outside the button's edge (its radius is 22). */
const RING_R = 28.5;

/** The button. `tap` and `longPress` are not called when made with `interactive: false` (the dialog's). */
export function faceButton(o: { tap?: () => void; longPress?: () => void; interactive?: boolean }): FaceButton {
  const interactive = o.interactive !== false;
  const b = el('button', 'face-button');
  b.type = 'button';
  b.setAttribute('aria-label', 'Face gestures');
  b.setAttribute('aria-pressed', 'false');

  const glyph = svgEl('svg', { viewBox: '0 0 24 24', class: 'face-glyph', 'aria-hidden': 'true' });
  glyph.append(svgEl('path', { d: VIEWFINDER }));
  const slash = svgEl('path', { d: SLASH, class: 'face-slash' });
  glyph.append(slash);

  // The split ring and the long press's filling ring, over the button.
  const rings = svgEl('svg', { viewBox: '0 0 64 64', class: 'face-rings', 'aria-hidden': 'true' });
  const path = (cls: string) => {
    const p = svgEl('path', { class: cls, d: '' });
    rings.append(p);
    return p;
  };
  const halves: Record<TurnDir, { faint: SVGPathElement; solid: SVGPathElement }> = {
    next: { faint: path('face-faint'), solid: path('face-solid') },
    prev: { faint: path('face-faint'), solid: path('face-solid') },
  };
  const press = svgEl('circle', { class: 'face-press', cx: '32', cy: '32', r: '23.25', pathLength: '100' });
  rings.append(press);
  press.style.animationDuration = `${LONG_PRESS_MS}ms`;
  b.append(glyph, rings);

  if (interactive) {
    if (o.tap) b.addEventListener('click', o.tap);
    if (o.longPress) onLongPress(b, o.longPress);
    const release = () => b.classList.remove('pressing');
    b.addEventListener('pointerdown', () => b.classList.add('pressing'));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, release);
  } else {
    b.tabIndex = -1;
    b.classList.add('inert');
  }

  const set = (p: Progress | undefined, dir: TurnDir) => {
    const sign = dir === 'next' ? 1 : -1;
    const draw = (e: SVGPathElement, f: number) => e.setAttribute('d', f > 0 ? arc(RING_R, 0, sign * SWEEP * Math.min(1, f)) : '');
    draw(halves[dir].faint, p?.near ?? 0);
    // The solid arc grows over the faint one only once the gesture is on.
    draw(halves[dir].solid, p && p.near >= 1 ? p.hold : 0);
  };

  return {
    el: b,
    show(s) {
      b.dataset.status = s;
      b.setAttribute('aria-pressed', String(s === 'starting' || s === 'watching' || s === 'noFace' || s === 'paused'));
      slash.style.display = s === 'unavailable' ? '' : 'none';
    },
    progress(p) {
      set(p?.next, 'next');
      set(p?.prev, 'prev');
    },
    pulse() {
      b.classList.remove('pulse');
      void b.offsetWidth; // so the animation starts again
      b.classList.add('pulse');
    },
  };
}
