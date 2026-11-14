// Settling the conflicts of a set of gestures: those that can turn a page, checked against each
// other (_fit.ts), and each one that conflicts set to none with why. Pure: the trials come in
// as given (face/store.ts and the dialog load them).

import { settle, type Contender } from './_fit';
import { levelsOf, type FaceSettings } from './gestures';
import { framesOf, type Trial } from './_recording';

/** The settings with every gesture that conflicts set to none with its note; `changedId` gives way first. `trialsOf` has the trials of every gesture with a direction. */
export function settled(s: FaceSettings, trialsOf: Map<string, Trial[]>, changedId?: string): FaceSettings {
  const contenders: Contender[] = [];
  for (const g of s.gestures) {
    const l = levelsOf(g, s.hold);
    if (!l || g.direction === 'none') continue;
    contenders.push({ id: g.id, name: g.name, template: g.fit.template!, release: l.release, held: (trialsOf.get(g.id) ?? []).filter((t) => !t.disabled).map((t) => framesOf(t).held) });
  }
  const conflicts = settle(contenders, changedId);
  if (!conflicts.size) return s;
  return { ...s, gestures: s.gestures.map((g) => (conflicts.has(g.id) ? { ...g, direction: 'none', note: `Set to None: ${conflicts.get(g.id)}.` } : g)) };
}
