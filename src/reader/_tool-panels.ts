// The tools' long-press panels: what each shows, and what choosing in it does.

import { markColors } from '../markings/placed';
import { HIGHLIGHT_COLORS, PEN_COLORS } from '../markings/stroke';
import type { ColorChoice } from '../markings/tool-settings';
import { closeOverlay, showMenu } from '../ui/overlay';
import { swatchRow } from './_swatches';

/** Pen's or Highlight's colours, under its button. */
export function showStrokeColors(at: HTMLElement, tool: 'pen' | 'highlighter', chosen: ColorChoice, pick: (c: ColorChoice) => void): void {
  const pen = tool === 'pen';
  const row = swatchRow(pen ? PEN_COLORS : HIGHLIGHT_COLORS, pen ? markColors().color : markColors().background, chosen, (c) => { closeOverlay(); pick(c); });
  showMenu(at, pen ? 'Pen colour' : 'Highlight colour', [row]);
}
