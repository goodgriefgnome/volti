// The tools, made for one reader, and the groups the toolbar shows their buttons in. A new tool
// is a file here and a line in `makeTools`; adding it to `TOOLBAR` shows its button.

import { eraserTool } from './_eraser';
import { penTool } from './_pen';
import { symbolTool } from './_symbol';
import { textTool } from './_text';
import type { HandHost, Tool, ToolHost, ToolName } from './_tool';

/** The toolbar's groups of tools, in order, with a rule between groups. */
export const TOOLBAR: ToolName[][] = [['pen', 'highlighter', 'eraser'], ['text', 'symbol']];

/** The tools, made for one reader; `hand` is for the hand tool, which has no button. */
export function makeTools(host: ToolHost, _hand: HandHost): Record<ToolName, Tool> {
  return {
    pen: penTool(host, 'pen'),
    highlighter: penTool(host, 'highlighter'),
    eraser: eraserTool(host),
    text: textTool(host),
    symbol: symbolTool(host),
  };
}
