// The Text tool: a tap on empty music starts typing there; the rest is _placing.ts.

import { placingTool } from './_placing';

export const textTool = placingTool('Text', (host, slot, at) => host.newText(slot, at));
