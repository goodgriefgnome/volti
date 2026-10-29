// Which presses, taps and keys turn the page, and which way. New ways of turning go here. Pure: no
// DOM.

export type Gesture = 'next' | 'prev' | 'toggleChrome';

/**
 * Width of the band at each side of the stage that turns the page while the toolbar shows: the
 * cut tabs' touch area. What shows of it is narrower, as the tabs are.
 */
export const TURN_BAND_PX = 64;
/** Share of the stage's width, in the middle, where a tap shows the toolbar while it is hidden. */
export const MIDDLE_SHARE = 0.2;
const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_MS = 400;

/**
 * Which way a finger (or pen, when not writing) going down at `x` on the stage turns the page:
 * while the toolbar is hidden, back in the left share of the stage and forward in the right, none
 * in the middle `MIDDLE_SHARE` (a tap there shows the toolbar); only in the band at each side
 * while it shows.
 */
export function turnFor(x: number, stageWidth: number, toolbar: boolean): 'next' | 'prev' | null {
  if (!toolbar) {
    const edge = (1 - MIDDLE_SHARE) / 2;
    if (x < stageWidth * edge) return 'prev';
    if (x > stageWidth * (1 - edge)) return 'next';
    return null;
  }
  if (x <= TURN_BAND_PX) return 'prev';
  if (x >= stageWidth - TURN_BAND_PX) return 'next';
  return null;
}

/** A finger (or pen) going down and up on the score. */
export interface Motion { x0: number; y0: number; x1: number; y1: number; ms: number }

/** Whether it was a tap: lifted soon, near where it went down. */
export function isTap(m: Motion): boolean {
  return Math.abs(m.x1 - m.x0) <= TAP_MAX_MOVE_PX && Math.abs(m.y1 - m.y0) <= TAP_MAX_MOVE_PX && m.ms <= TAP_MAX_MS;
}

/** Page-turn pedals send keyboard keys; most send arrows or Page Up/Down. */
export function gestureForKey(key: string): Gesture | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
      return 'next';
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
      return 'prev';
    default:
      return null;
  }
}
