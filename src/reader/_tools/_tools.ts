// The tools, made for one reader, and the groups the toolbar shows their buttons in. A new tool
// is a file here and a line in `makeTools`; adding it to `TOOLBAR` shows its button.

import { eraserTool } from './_eraser';
import { handTool } from './_hand';
import { penTool } from './_pen';
import { symbolTool } from './_symbol';
import { textTool } from './_text';
import type { HandHost, Tool, ToolHost, ToolName } from './_tool';

/** The toolbar's groups of tools, in order, with a rule between groups. */
export const TOOLBAR: Exclude<ToolName, 'hand'>[][] = [['pen', 'highlighter', 'eraser'], ['text', 'symbol']];

/**
 * The tools, made for one reader. Each gets the host made for it by `hostFor`, whose layers and
 * button face are its own; `hand` is for the hand tool, which has no button.
 */
export function makeTools(hostFor: (tool: ToolName) => ToolHost, hand: HandHost): Record<ToolName, Tool> {
  return {
    hand: handTool(hand),
    pen: penTool(hostFor('pen'), 'pen'),
    highlighter: penTool(hostFor('highlighter'), 'highlighter'),
    eraser: eraserTool(hostFor('eraser')),
    text: textTool(hostFor('text')),
    symbol: symbolTool(hostFor('symbol')),
  };
}
