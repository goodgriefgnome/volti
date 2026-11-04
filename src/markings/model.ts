// What all kinds of marking share. A marking is something drawn or placed on the music; a score's
// ink is its markings, kept per page of the original. This file has the Marking type, the _KindBehaviour each kind
// gives, and the functions the rest of the app uses on any marking, so cut edits, the eraser and
// drawing work for every kind. Code for one kind goes in that kind's file (stroke.ts, placed.ts). To add a
// kind, such as a post-it: add it to the Marking union, give its behaviour in a new file,
// pick it out in behaviour(), and add a tool to make it in reader/tools/.

import type { Drawing } from './draw';
import { _placed, type PlacedMark } from './placed';
import { _strokes, type Stroke } from './stroke';

/** x and y as fractions of the page width and height, so ink survives any zoom; then pen pressure 0..1. */
export type Point = [x: number, y: number, pressure: number];

/** A stroke, or a symbol or text placed whole. */
export type Marking = Stroke | PlacedMark;

/**
 * What markings are drawn on: a page drawn `w` x `h` in size (pixels on a canvas, points in a PDF);
 * when it covers only part of the page (a zoomed-in close-up), (ox, oy) is where that part starts.
 */
export interface DrawTarget { draw: Drawing; w: number; h: number; ox: number; oy: number }

/**
 * A marking's PDF annotation, besides its appearance: an Ink annotation's paths (in the target's
 * units, y downwards), colour, and a width for apps that draw it themselves; a Stamp's contents
 * and colour; a FreeText's contents.
 */
export type _Annotation =
  | { subtype: 'Ink'; paths: (readonly [number, number])[][]; color: string; width: number }
  | { subtype: 'Stamp'; contents: string; color: string }
  | { subtype: 'FreeText'; contents: string };

/** What each kind of marking does. Lengths are in page widths; `aspect` is the page's height / width. */
export interface _KindBehaviour<M> {
  /** Where it is: a marking made or moved goes on the page of the cut holding this point (the nearest cut, when none does), and the cuts that hold it show it. */
  anchor(m: M): Point;
  /** The same marking with each of its points moved by f, as from frame to page coordinates. */
  map(m: M, f: (p: Point) => Point): M;
  /**
   * How far `p` is from it, in page widths, when within `radius` of it (0 on it); undefined when
   * further. `aspect` is its page's height / width.
   */
  hitDistance(m: M, p: Point, radius: number, aspect: number): number | undefined;
  draw(t: DrawTarget, m: M): void;
  /** What its PDF annotation says besides its appearance (which `draw` makes), placed on `t`. */
  annotation(t: DrawTarget, m: M): _Annotation;
  /** Rounded, to keep what is stored small. */
  compact(m: M): M;
  /** A copy that shares nothing with it. */
  copy(m: M): M;
}

/** Strokes were stored before other kinds existed, so they carry no kind of their own. */
const behaviour = (m: Marking): _KindBehaviour<Marking> => ('kind' in m ? _placed : _strokes) as _KindBehaviour<Marking>;

export const anchorOf = (m: Marking) => behaviour(m).anchor(m);
export const mapMarking = (m: Marking, f: (p: Point) => Point) => behaviour(m).map(m, f);
export const hitDistance = (m: Marking, p: Point, radius: number, aspect: number) => behaviour(m).hitDistance(m, p, radius, aspect);
export const compactMarking = (m: Marking) => behaviour(m).compact(m);
export const copyMarking = (m: Marking) => behaviour(m).copy(m);

export const annotationOf = (t: DrawTarget, m: Marking) => behaviour(m).annotation(t, m);

export function drawMarkings(t: DrawTarget, list: readonly Marking[]) {
  for (const m of list) behaviour(m).draw(t, m);
}
