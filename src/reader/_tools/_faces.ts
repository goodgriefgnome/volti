// What the tools' buttons show: an icon, an icon over the colour a tool draws in, the T of Text in
// its look, and the symbol of Symbols in its look. Each is a `ButtonFace`, drawn by the toolbar when
// its key changes.

import { cssFamily } from '../../fonts/fonts';
import type { LibrarySymbol } from '../../markings/symbol-library';
import { markColors, type Background } from '../../markings/placed';
import { el } from '../../ui/dom';
import { symbolPicture } from './_symbol-picture';
import { backgroundPicture } from './_swatches';
import type { ButtonFace } from './_tool';

/** What a placing tool's button shows: the selected marking's look, or the next marking's. */
export interface Look { font?: string; color: string; background?: Background }

/** A tool's or button's icon, drawn in the button's colour from the path `d` in a 24 x 24 box. */
export function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('tool-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** A button showing an icon. */
export const iconFace = (d: string): ButtonFace => ({ key: d, draw: () => icon(d) });

/** A button showing an icon, with the colour the tool draws in under it. */
export function inkFace(d: string, color: string): ButtonFace {
  return {
    key: `${d}|${color}`,
    draw() {
      const f = document.createDocumentFragment(), ink = el('span', 'ink');
      ink.style.background = color;
      f.append(icon(d), ink);
      return f;
    },
  };
}

/** The Text button's T: in the look's font and colour, on its background. */
export function textFace(look: Look): ButtonFace {
  return {
    key: `${look.font}|${look.color}|${JSON.stringify(look.background)}|${markColors().background}`,
    draw() {
      const face = el('span', 'text-look');
      if (look.background) {
        const back = backgroundPicture(look.background.shape, look.background.color ?? markColors().background);
        back.removeAttribute('width');
        back.removeAttribute('height');
        back.setAttribute('preserveAspectRatio', 'none');
        face.append(back);
      }
      const t = el('span', 't', 'T');
      t.style.color = look.color;
      face.append(t);
      // In its own font once that has loaded.
      if (look.font) void cssFamily(look.font).then((family) => { t.style.fontFamily = `"${family}"`; }, (e) => console.warn('Could not load a font:', e));
      return face;
    },
  };
}

/** The Symbols button's picture: the symbol in the look's colour, on its background, or a generic pp. */
export function symbolFace(sym: LibrarySymbol | undefined, look: Look): ButtonFace {
  return {
    key: `${sym?.font}|${sym?.text}|${sym?.scale}|${look.color}|${JSON.stringify(look.background)}|${markColors().background}`,
    draw: () => (sym ? symbolPicture(sym, look.color, 28, undefined, look.background) : el('span', 'pp', 'pp')),
  };
}
