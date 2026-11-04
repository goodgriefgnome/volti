// The Text tool: a tap on empty music, or a press dragged and lifted over a page, starts typing
// there; until then the press shows "Ag". The rest is _placing.ts.

import { placingTool } from './_placing';
import type { Tool, ToolHost } from './_tool';

export const textTool = (host: ToolHost): Tool => {
  const placing = placingTool(host, 'text', (m) => 'kind' in m && m.kind === 'text', (slot, at) => host.newText(slot, at), (at) => host.textGhost(at));
  return {
    ...placing,
    // While the field is open, every press is Text's, and only finishes typing.
    suppressions: () => (host.typing() ? { allPresses: true } : placing.suppressions!()),
    showPanel: () => host.textPanel(),
    start(press) {
      if (host.typing()) { host.finishTyping(); return undefined; }
      return placing.start(press);
    },
  };
};
