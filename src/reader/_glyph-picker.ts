// The glyph picker: a font's glyphs in a grid, a search by SMuFL name, and the characters picked
// so far, drawn as they will be.

import { fontChoices, fontView, shapeWith, type FontView } from '../fonts/fonts';
import { smuflNames, type SmuflNames } from '../fonts/smufl';
import { addGlyph, glyphKey } from '../markings/glyphs';
import { symbolFrom } from '../markings/library';
import { button, el } from '../ui/dom';
import { buttonRow } from '../ui/overlay';
import { hasInk, symbolPicture } from './_symbol-picture';

export interface GlyphPickerOptions {
  /** The font to start with, and the characters already picked. */
  font: string;
  text: string;
  /** The OK button's label ("Place", "Use"). */
  okLabel: string;
  /** Picked: the font and characters. */
  done(font: string, text: string): void;
  cancel(): void;
}

/** The preview's size, in CSS pixels. */
const PREVIEW_PX = 72;
/** How long after a change the characters are shaped for the preview. */
const PREVIEW_MS = 150;

const SVG = 'http://www.w3.org/2000/svg';

const hex = (cp: number) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

/** Fill `into` (an open dialog, or a view of one) with the picker. */
export function glyphPicker(into: HTMLElement, o: GlyphPickerOptions): void {
  let font = o.font;
  let text = o.text;
  let view: FontView | undefined;
  let names: SmuflNames | undefined;
  /** The grid's latest build and preview, so that a slower earlier one is dropped. */
  let building = 0;
  let previewing = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  const select = el('select');
  select.setAttribute('aria-label', 'Font');
  select.hidden = true;
  const chars = el('input', 'name glyph-text');
  chars.type = 'text';
  chars.value = text;
  chars.setAttribute('aria-label', 'Characters');
  chars.placeholder = 'Tap glyphs to add them';
  const back = button('⌫', () => { setText([...text].slice(0, -1).join('')); }, 'glyph-back');
  back.setAttribute('aria-label', 'Delete the last character');
  const preview = el('div', 'glyph-preview');
  const search = el('input', 'name glyph-search');
  search.type = 'search';
  search.placeholder = 'Search by SMuFL name, such as fermata';
  search.setAttribute('aria-label', 'Search glyph names');
  const grid = el('div', 'glyph-grid');
  const caption = el('div', 'hint glyph-caption');
  const cancel = button('Cancel', () => o.cancel());
  const ok = button(o.okLabel, () => o.done(font, text), 'primary');
  ok.disabled = true;
  const typed = el('div', 'glyph-chars');
  typed.append(chars, back, preview);
  const body = el('div', 'glyph-picker-body');
  body.append(select, typed, search, grid, caption, buttonRow(cancel, ok));
  into.append(body);

  function setText(t: string) {
    text = t;
    chars.value = t;
    ok.disabled = true;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void drawPreview(), PREVIEW_MS);
  }

  /** Shape the characters and draw them as they will be; OK waits for ink. Only the glyph table gets the outlines: nothing is stored. */
  async function drawPreview() {
    const mine = ++previewing;
    let sym: ReturnType<typeof symbolFrom> | undefined;
    if (text) {
      try {
        const shaped = await shapeWith(font, text);
        for (const [gid, d] of shaped.paths) addGlyph(glyphKey(font, gid), d);
        sym = symbolFrom(font, text, 1, shaped.glyphs);
      } catch (e) { console.error(e); }
    }
    if (mine !== previewing) return;
    const inked = !!sym && hasInk(sym);
    preview.replaceChildren(...(sym && inked ? [symbolPicture(sym, getComputedStyle(into).color, PREVIEW_PX)] : []));
    ok.disabled = !inked;
  }

  /** Fill a cell's picture once it is seen: its outline fitted to the cell. */
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || !view) continue;
      seen.unobserve(e.target);
      const cell = e.target as HTMLElement;
      const d = view.pathAt(Number(cell.dataset.cp));
      if (!d) continue;
      const svg = document.createElementNS(SVG, 'svg');
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      svg.append(path);
      cell.append(svg);
      const b = path.getBBox();
      if (b.width || b.height) {
        const padX = b.width * 0.1, padY = b.height * 0.1;
        svg.setAttribute('viewBox', `${b.x - padX} ${b.y - padY} ${b.width + 2 * padX} ${b.height + 2 * padY}`);
      }
    }
  }, { root: grid, rootMargin: '200px' });

  /** The grid for the font and the search: a cell for each code point, filled as it scrolls into view. */
  async function buildGrid() {
    const mine = ++building;
    seen.disconnect();
    grid.replaceChildren();
    try {
      view = await fontView(font);
      names ??= await smuflNames().catch((e) => { console.warn('SMuFL names not loaded', e); return undefined; });
    } catch (e) {
      console.error(e);
      caption.textContent = 'Could not read the font.';
      return;
    }
    if (mine !== building) return;
    const query = search.value.trim();
    let cps = view.codePoints;
    if (query) {
      const has = new Set(cps);
      cps = names ? names.search(query).map((r) => r.cp).filter((cp) => has.has(cp)) : [];
    }
    const cells = document.createDocumentFragment();
    for (const cp of cps) {
      const name = names?.nameOf(cp);
      const cell = el('button', 'glyph-cell');
      cell.type = 'button';
      cell.dataset.cp = String(cp);
      cell.title = name ?? hex(cp);
      cell.setAttribute('aria-label', name ?? hex(cp));
      cell.addEventListener('click', () => {
        caption.textContent = name ? `${name} · ${hex(cp)}` : hex(cp);
        setText(text + String.fromCodePoint(cp));
      });
      cells.append(cell);
    }
    grid.append(cells);
    grid.scrollTop = 0;
    grid.querySelectorAll('.glyph-cell').forEach((c) => seen.observe(c));
    if (!cps.length) caption.textContent = query ? 'No glyph with that name in this font.' : '';
  }

  chars.addEventListener('input', () => setText(chars.value));
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void buildGrid(), 200);
  });
  select.addEventListener('change', () => {
    font = select.value;
    caption.textContent = '';
    setText('');
    void buildGrid();
  });

  void fontChoices().then((choices) => {
    select.replaceChildren(...choices.map((c) => {
      const opt = el('option', '', c.name);
      opt.value = c.id;
      return opt;
    }));
    if (choices.some((c) => c.id === font)) select.value = font;
    select.hidden = choices.length < 2;
  }, console.error);
  void buildGrid();
  void drawPreview();
}
