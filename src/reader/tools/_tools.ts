// The tools, by the name the toolbar selects them by, in the toolbar's order. A new tool is added
// here, and its button then shows in the toolbar.

import { eraserTool } from './_eraser';
import { penTool } from './_pen';
import { textTool } from './_text';
import type { Tool } from './_tool';

export const TOOLS = {
  pen: penTool('pen'),
  highlighter: penTool('highlighter'),
  eraser: eraserTool,
  text: textTool,
} satisfies Record<string, Tool>;

export type ToolName = keyof typeof TOOLS;

export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];
