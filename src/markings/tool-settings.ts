// Pure. Each tool's settings for the markings it makes, kept for the whole app: their types,
// defaults, and what a choice resolves to.

import type { Background, MarkColors } from './placed';

/** A colour choice: 'default' follows the app's Marking colours. */
export type ColorChoice = string | 'default';

/** A marking's background: none, or the shape of one. */
export type BackgroundChoice = 'none' | Background['shape'];

export interface ToolSettings {
  pen: { color: ColorChoice };
  highlighter: { color: ColorChoice };
  /** `font` undefined: the font new text gets now (ACADEMICO). */
  text: { font?: string; color: ColorChoice; background: BackgroundChoice; backgroundColor: ColorChoice };
  symbol: { color: ColorChoice };
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  pen: { color: 'default' },
  highlighter: { color: 'default' },
  text: { color: 'default', background: 'none', backgroundColor: 'default' },
  symbol: { color: 'default' },
};

const SHAPES: readonly string[] = ['none', 'box', 'tag-left', 'tag-right'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const colorOf = (v: unknown, fallback: ColorChoice): ColorChoice => (typeof v === 'string' && v ? v : fallback);

/** Stored settings, with anything missing or of the wrong type taken from the defaults. */
export function toolSettingsFrom(stored: unknown): ToolSettings {
  const d = DEFAULT_TOOL_SETTINGS, s = isObject(stored) ? stored : {};
  const part = (k: string): Record<string, unknown> => (isObject(s[k]) ? (s[k] as Record<string, unknown>) : {});
  const text = part('text');
  return {
    pen: { color: colorOf(part('pen').color, d.pen.color) },
    highlighter: { color: colorOf(part('highlighter').color, d.highlighter.color) },
    text: {
      ...(typeof text.font === 'string' && text.font ? { font: text.font } : {}),
      color: colorOf(text.color, d.text.color),
      background: typeof text.background === 'string' && SHAPES.includes(text.background) ? (text.background as BackgroundChoice) : d.text.background,
      backgroundColor: colorOf(text.backgroundColor, d.text.backgroundColor),
    },
    symbol: { color: colorOf(part('symbol').color, d.symbol.color) },
  };
}

/** The colour a stroke is drawn in: Default is the marking colour for the pen, the background colour for the highlighter. */
export function strokeColor(tool: 'pen' | 'highlighter', choice: ColorChoice, colors: MarkColors): string {
  if (choice !== 'default') return choice;
  return tool === 'pen' ? colors.color : colors.background;
}

/** What a placed marking stores for a choice: undefined for Default (it follows the Marking colours). */
export const ownColor = (choice: ColorChoice): string | undefined => (choice === 'default' ? undefined : choice);

/** A background for a placed marking: undefined for 'none'; its colour only when not Default. */
export function backgroundOf(shape: BackgroundChoice, color: ColorChoice): Background | undefined {
  if (shape === 'none') return undefined;
  const own = ownColor(color);
  return own === undefined ? { shape } : { shape, color: own };
}
