// The symbol tool: a tap on empty music, or a press dragged and lifted over a page, places the current symbol there (unselected); the rest is _placing.ts.

import { compactMarking } from '../../markings/model';
import { setInk } from '../../scores/edits';
import type { PlacedMark } from '../../markings/placed';
import { symbolSizeOf } from '../../scores/model';
import { claimMarking } from '../../scores/ownership';
import { placed, placingTool } from './_placing';
import type { Tool, ToolHost } from './_tool';

/** The current symbol as it would be placed, centred at `at`: its colour and background. */
function symbolMark(host: ToolHost, at: [number, number]): PlacedMark | undefined {
  const sym = host.placing();
  if (!sym) return undefined;
  const made = placed(sym, at, symbolSizeOf(host.state().score) * sym.scale), color = host.symbolColor();
  return color ? { ...made, color } : made;
}

export const symbolTool = (host: ToolHost): Tool => placingTool(host, 'symbol', (m) => 'kind' in m && m.kind === 'symbol', (slot, at) => {
  const made = symbolMark(host, at), state = host.state();
  if (!made) return;
  const claimed = claimMarking(slot.frame, compactMarking(made), host.aspects());
  if (!claimed) return;
  const { cut, marking } = claimed;
  host.commit(setInk(state, cut.id, [...(state.ink[cut.id] ?? []), marking]), cut.id);
}, (at) => symbolMark(host, at));
