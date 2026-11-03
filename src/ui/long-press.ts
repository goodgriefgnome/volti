// A press held on an element, told apart from a tap.

/** How long a press is held to count as a long press. */
export const LONG_PRESS_MS = 500;

/**
 * Call `onLong` when `target` is pressed this long without moving away; the click that follows a
 * long press is swallowed, so a tap still does what the element's click handler does.
 */
export function onLongPress(target: HTMLElement, onLong: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let long = false;
  const stop = () => clearTimeout(timer);
  target.addEventListener('pointerdown', () => {
    long = false;
    stop();
    timer = setTimeout(() => { long = true; onLong(); }, LONG_PRESS_MS);
  });
  target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop);
  target.addEventListener('pointerleave', stop);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  // Capturing, so it runs before the click handler the element already has.
  target.addEventListener('click', (e) => {
    if (!long) return;
    long = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
}
