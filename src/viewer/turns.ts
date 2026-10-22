// How taps, swipes and keys map to page turns. New turning strategies go here.

export type Gesture = 'next' | 'prev' | 'toggleChrome';

/** Fraction of the screen width on each side that turns the page when tapped. */
export const TAP_ZONE = 0.35;
const SWIPE_MIN_PX = 60;
const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_MS = 400;

/** A finger (or pen, when not writing) going down and up on the score. */
export interface Stroke2D { x0: number; y0: number; x1: number; y1: number; ms: number }

export function gestureFor(s: Stroke2D, stageWidth: number): Gesture | null {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? 'next' : 'prev';
  if (Math.abs(dx) <= TAP_MAX_MOVE_PX && Math.abs(dy) <= TAP_MAX_MOVE_PX && s.ms <= TAP_MAX_MS) {
    if (s.x1 >= stageWidth * (1 - TAP_ZONE)) return 'next';
    if (s.x1 <= stageWidth * TAP_ZONE) return 'prev';
    return 'toggleChrome';
  }
  return null;
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
