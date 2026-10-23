// The tools, by the name the toolbar selects them by, in the toolbar's order. A new tool is added
// here, and its button then shows in the toolbar.

import { eraserTool } from './eraser';
import { penTool } from './pen';
import type { Tool } from './tool';

export const TOOLS = {
  pen: penTool('pen'),
  highlighter: penTool('highlighter'),
  eraser: eraserTool,
} satisfies Record<string, Tool>;

export type ToolName = keyof typeof TOOLS;

export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];
