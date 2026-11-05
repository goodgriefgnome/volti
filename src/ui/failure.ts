// What a failure says on screen, and what it leaves in the console: one sentence for every error,
// made from the error's own message, so a new kind of error needs teaching to nobody.

import { NoAccess, PasswordNotGiven, Unreachable } from '../originals/types';

/** `Could not <what> “<title>”: <the error's message>`; logged unless it is one the person can put right (no access, offline, no password). */
export function failed(what: string, e: unknown, title?: string): string {
  if (!(e instanceof NoAccess || e instanceof Unreachable || e instanceof PasswordNotGiven)) console.error(e);
  return `Could not ${what}${title ? ` “${title}”` : ''}: ${(e as Error)?.message ?? String(e)}`;
}

/** The sentences already told this session. */
const told = new Set<string>();
/** Where failures nobody asked about are shown: the library's status line, or the reader's `say`. */
let shown: ((sentence: string) => void) | undefined;
/** Told before anything shows them (at start-up): shown when something does. */
const waiting: string[] = [];

/**
 * Show failures of the background kind (`failedOnce`) through `say`, until the returned function is
 * called, which goes back to what showed them before.
 */
export function showFailuresWith(say: (sentence: string) => void): () => void {
  const before = shown;
  shown = say;
  for (const sentence of waiting.splice(0)) say(sentence);
  return () => { shown = before; };
}

/**
 * For something that didn't happen without anyone asking for it (a save in the background, a
 * thumbnail): its failure is shown the first time this session, so a full disk isn't said for
 * every page; every time it is in the console.
 */
export function failedOnce(what: string, e: unknown): void {
  const sentence = failed(what, e);
  if (told.has(sentence)) return;
  told.add(sentence);
  if (shown) shown(sentence); else waiting.push(sentence);
}
