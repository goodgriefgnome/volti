// The Text tool: a tap on empty music, or a press dragged and lifted over a page, starts typing
// there; until then the press shows "Ag". The rest is _placing.ts.

import { placingTool } from './_placing';

export const textTool = placingTool('Text', (host, slot, at) => host.newText(slot, at), (host, at) => host.textGhost(at));
