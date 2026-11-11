// The tools' long-press panels: what each shows, and what choosing in it does.

import type { FontChoice } from '../../fonts/fonts';
import { markColors } from '../../markings/placed';
import { BACKGROUND_COLORS, HIGHLIGHT_COLORS, PEN_COLORS } from '../../markings/stroke';
import type { BackgroundChoice, ColorChoice } from '../../markings/tool-settings';
import { el } from '../../ui/dom';
import { closeOverlay, showMenu } from '../../ui/overlay';
import { shapeRow, swatchRow } from './_swatches';

/** Pen's or Highlight's colours, under its button. */
export function showStrokeColors(at: HTMLElement, tool: 'pen' | 'highlighter', chosen: ColorChoice, pick: (c: ColorChoice) => void): void {
  const pen = tool === 'pen';
  const row = swatchRow(pen ? PEN_COLORS : HIGHLIGHT_COLORS, pen ? markColors().color : markColors().background, chosen, (c) => { closeOverlay(); pick(c); });
  showMenu(at, pen ? 'Pen colour' : 'Highlight colour', [row]);
}

/** What the Text panel shows. */
export interface TextPanel { fonts: FontChoice[]; font: string; color: ColorChoice; background: BackgroundChoice; backgroundColor: ColorChoice }

/** What the Symbols panel's settings show. */
export interface SymbolSettingsView { color: ColorChoice; background: BackgroundChoice; backgroundColor: ColorChoice }

/** The settings' choices, for Text and for Symbols. */
export interface LookActions {
  color(c: ColorChoice): void;
  background(b: BackgroundChoice): void;
  backgroundColor(c: ColorChoice): void;
}

/** A labelled part of a panel. */
const part = (label: string, content: HTMLElement) => {
  const box = el('div', 'panel-part');
  box.append(el('div', 'label', label), content);
  return box;
};

/**
 * Colour, Background and Background colour (once there is a shape), as the Text and Symbols panels
 * have them; `v` is kept here and changed by each choice, so the rows redraw in place.
 */
export function lookParts(v: SymbolSettingsView, act: LookActions, redraw: () => void): HTMLElement[] {
  const fill = v.backgroundColor === 'default' ? markColors().background : v.backgroundColor;
  const parts = [
    part('Colour', swatchRow(PEN_COLORS, markColors().color, v.color, (c) => { v.color = c; act.color(c); redraw(); })),
    part('Background', shapeRow(v.background, fill, (b) => { v.background = b; act.background(b); redraw(); })),
  ];
  if (v.background !== 'none') {
    parts.push(part('Background colour', swatchRow(BACKGROUND_COLORS, markColors().background, v.backgroundColor, (c) => { v.backgroundColor = c; act.backgroundColor(c); redraw(); })));
  }
  return parts;
}

/** Text's font, colour and background, under its button. A choice redraws the panel and keeps it open. */
export function showTextPanel(at: HTMLElement, v: TextPanel, act: LookActions & { font(id: string): void }): void {
  const panel = el('div', 'tool-panel');
  const draw = () => {
    const select = el('select', 'font-select');
    select.setAttribute('aria-label', 'Font');
    for (const c of v.fonts) {
      const o = el('option', '', c.name);
      o.value = c.id;
      o.selected = c.id === v.font;
      select.append(o);
    }
    select.addEventListener('change', () => { v.font = select.value; act.font(select.value); draw(); });
    panel.replaceChildren(part('Font', select), ...lookParts(v, act, draw));
  };
  draw();
  showMenu(at, 'Text', [panel]);
}
