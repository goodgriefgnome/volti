// The symbol tool: a tap on empty music places the current symbol there (unselected); the rest is _placing.ts.

import { compactMarking } from '../../markings/model';
import { setInk } from '../../scores/edits';
import { symbolSizeOf } from '../../scores/model';
import { claimMarking } from '../../scores/ownership';
import { placed, placingTool } from './_placing';

export const symbolTool = placingTool('Symbol', (host, slot, at) => {
  const sym = host.placing(), state = host.state();
  if (!sym) return;
  const color = host.symbolColor();
  const made = placed(sym, at, symbolSizeOf(state.score) * sym.scale);
  const claimed = claimMarking(slot.frame, compactMarking(color ? { ...made, color } : made), host.aspects());
  if (!claimed) return;
  const { cut, marking } = claimed;
  host.commit(setInk(state, cut.id, [...(state.ink[cut.id] ?? []), marking]), cut.id);
});
