// How the reader lays out and turns pages on this device: whether a turn advances a page or a
// screen, how far a page may shrink to fit more on a screen, and how long a turn slides. Held in memory, loaded at start-up
// (settings/store.ts). Pure: no storage.

export type Advance = 'page' | 'screen';

/** Advance from what is stored: 'page' or 'screen'; anything else is 'page'. */
export function advanceFrom(raw: unknown): Advance {
  return raw === 'screen' ? 'screen' : 'page';
}

/** The smallest scale, in percent, from what is stored: a whole multiple of 5 from 10 to 100; anything else is 90. */
export function smallestScaleFrom(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 10 && raw <= 100 && raw % 5 === 0 ? raw : 90;
}

let current: Advance = 'page';
let percent = 90;
let ms = 300;

export const advance = (): Advance => current;
export function setAdvance(a: Advance): void { current = a; }

/** The smallest scale as a fraction, 0.1 to 1. */
export const smallestScale = (): number => percent / 100;
/** The smallest scale in percent, as the dialog shows it. */
export const smallestScalePercent = (): number => percent;
export function setSmallestScalePercent(p: number): void { percent = smallestScaleFrom(p); }

/** The slide time, in ms, from what is stored: a whole multiple of 50 from 0 to 1,000; anything else is 300. */
export function slideMsFrom(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 1000 && raw % 50 === 0 ? raw : 300;
}

/** How long a turn slides, in ms; 0 is no slide. */
export const slideMs = (): number => ms;
export function setSlideMs(m: number): void { ms = slideMsFrom(m); }
