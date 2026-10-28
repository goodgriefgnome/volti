// Where to pick up reading: the one thing last read and where in it, and the rule that decides
// whether opening something resumes there. Pure: no DOM, no storage (_store.ts keeps it).

/** What is stored under `last-read` (STORAGE.md). */
export type LastRead =
  /** An excerpt of score `id`: the span it plays (as Span). With neither end, the whole score. */
  | { kind: 'excerpt'; id: string; first?: string; last?: string; cut: string }
  | { kind: 'setlist'; id: string; entry: string; cut: string };

/** What is opened: an excerpt of a score (no ends: the whole score), or a setlist (without a tapped entry). */
export type Opening = { kind: 'excerpt'; id: string; first?: string; last?: string } | { kind: 'setlist'; id: string };

/** Where to start `opening`: where `last` was, if it names the same thing; else undefined (its beginning). */
export function resumeAt(last: LastRead | undefined, opening: Opening): { entry?: string; cut: string } | undefined {
  if (!last || last.kind !== opening.kind || last.id !== opening.id) return undefined;
  if (last.kind === 'setlist') return { entry: last.entry, cut: last.cut };
  // A whole score and an excerpt of it are different things to resume, as are two excerpts.
  const o = opening as Extract<Opening, { kind: 'excerpt' }>;
  return last.first === o.first && last.last === o.last ? { cut: last.cut } : undefined;
}
