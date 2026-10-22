import { eraserTool } from './eraser';
import { penTool } from './pen';
import type { Tool, ToolName } from './tool';

export const TOOLS: Record<ToolName, Tool> = {
  pen: penTool('pen'),
  highlighter: penTool('highlighter'),
  eraser: eraserTool,
};
