// The Text tool: a tap on empty music, or a press dragged and lifted over a page, starts typing
// there; until then the press shows "Ag". The rest is _placing.ts.

import { placingTool } from './_placing';
import type { Tool, ToolHost } from './_tool';

export const textTool = (host: ToolHost): Tool => placingTool(host, 'text', (slot, at) => host.newText(slot, at), (at) => host.textGhost(at));
