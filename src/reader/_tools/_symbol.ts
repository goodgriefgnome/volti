// The Symbols tool: a tap on empty music, or a press dragged and lifted over a page, places the
// current symbol there (unselected); the rest of a press is _placing.ts. It owns symbol markings
// (selecting one lends it), the symbol library and each group's current symbol, and picking,
// adding, arranging and cycling symbols, with the library editor and the glyph picker it opens.

import { addAdhoc, findSymbol, moveGroup, moveSymbol, nextSymbol, replaceSymbol, scaleOf, symbolsOf, type LibrarySymbol, type SymbolAt, type SymbolLibrary } from '../../markings/symbol-library';
import { compactMarking, type Marking } from '../../markings/model';
import { markingColors, type Background, type PlacedMarking } from '../../markings/placed';
import { BRAVURA } from '../../fonts/fonts';
import { saveLibrary } from '../../markings/store';
import { backgroundOf, ownColor, type BackgroundChoice, type ColorChoice } from '../../markings/tool-settings';
import { replaceMarking, setInk, setSymbolSize } from '../../scores/edits';
import { symbolSizeOf } from '../../scores/model';
import { claimMarking } from '../../scores/ownership';
import type { Selected } from '../../scores/placing';
import { closeOverlay, showDialog } from '../../ui/overlay';
import { glyphPicker } from './_glyph-picker';
import { editLibrary } from './_symbol-library-editor';
import { showSymbolPanel } from './_symbol-panel';
import { lastSymbol, makeSymbol, reorderedCurrents, savedLibrary, symbolLibrary } from './_symbol-library';
import type { SymbolSettingsView } from './_tool-panels';
import { symbolFace, type Look } from './_faces';
import { placingTool } from './_placing';
import type { Tool, ToolHost } from './_tool';
import { failed } from '../../ui/failure';

/** A placed symbol made from a library symbol, centred at `at` of its frame. */
export const placed = (sym: LibrarySymbol, at: [number, number], size: number): PlacedMarking => ({
  kind: 'symbol', text: sym.text, font: sym.font, glyphs: sym.glyphs.map((g) => [...g]), at, size,
  ...(sym.background && { background: { ...sym.background } }),
});

const isSymbol = (m: Marking) => 'kind' in m && m.kind === 'symbol';

export const symbolTool = (host: ToolHost): Tool => {
  /** The symbol library, once it has been made. */
  let lib: SymbolLibrary | undefined;
  /** The group whose current symbol is the tool's; -1 for the ad-hoc group. */
  let group = 0;
  /** Each group's current symbol, an index into it, while the app runs. */
  let currents: number[] = [];
  /** The ad-hoc group's current symbol. */
  let adhocCurrent = 0;
  /** The font last used in the glyph picker, while the app runs. */
  let pickerFont = BRAVURA;
  let equipped = false;

  // As the app opens, a library saved before is loaded; the starter is made only when it is first needed.
  void savedLibrary().then((saved) => { if (saved && !lib) { lib = saved; setFace(); } }, (e) => console.warn('Could not load the symbol library:', e));

  const currentOf = (g: number) => (g < 0 ? adhocCurrent : currents[g] ?? 0);
  const setCurrent = (g: number, index: number) => {
    if (g < 0) adhocCurrent = index;
    else currents[g] = index;
  };

  /** The last symbol picked; none before the library has symbols. */
  const picked = (): LibrarySymbol | undefined => {
    const at = lib && lastSymbol(lib, group, currents, adhocCurrent);
    return lib && at ? symbolsOf(lib, at.group)[at.index] : undefined;
  };

  /** The selected marking, when it is a symbol. */
  const selectedSymbol = (): Selected | undefined => {
    const sel = host.selected();
    return sel && isSymbol(sel.marking) ? sel : undefined;
  };

  /* ---------- the button ---------- */

  /** The symbol the button pictures: the selected symbol's, else the last one picked. */
  const buttonSymbol = (): LibrarySymbol | undefined => {
    const m = selectedSymbol()?.marking;
    if (!m) return picked();
    const at = lib && findSymbol(lib, m.font, m.text);
    return lib && at ? symbolsOf(lib, at.group)[at.index] : { font: m.font, text: m.text, scale: 1, glyphs: m.glyphs.map((g) => [...g]) };
  };

  /** What the button shows: the selected symbol's look, else the settings for the next one. */
  const look = (): Look => {
    const m = selectedSymbol()?.marking;
    if (m) return { color: m.color ?? markingColors().color, ...(m.background ? { background: m.background } : {}) };
    const background = picked()?.background;
    return { color: ownColor(host.settings().symbol.color) ?? markingColors().color, ...(background ? { background } : {}) };
  };

  const setFace = () => host.setButtonFace(symbolFace(buttonSymbol(), look()));
  setFace();

  /* ---------- the library ---------- */

  /** The library, made the first time; undefined, having said so, when that fails. */
  const ensureLibrary = async (): Promise<SymbolLibrary | undefined> => {
    if (!lib) {
      try { lib = await symbolLibrary(); } catch (e) { host.say(failed('load the symbols', e)); }
    }
    return lib;
  };

  /**
   * Change the library: saved, kept, and shown. Every change goes through here. Each group's current
   * symbol stays in its group (the first when its place is gone), and the last group used, when it
   * is gone or empty, falls to the first group with symbols; the tool goes if there is none.
   */
  const setLibrary = (next: SymbolLibrary) => {
    lib = next;
    void saveLibrary(next).catch((e) => host.say(failed('save the symbols', e)));
    const clamp = (n: number, size: number) => (n < size ? n : 0);
    currents = next.groups.map((g, i) => clamp(currents[i] ?? 0, g.symbols.length));
    adhocCurrent = clamp(adhocCurrent, next.adhoc.length);
    if (!symbolsOf(next, group).length) {
      const first = [...next.groups.keys(), -1].find((g) => symbolsOf(next, g).length);
      if (first === undefined) { if (equipped) host.unequip(); }
      else { group = first; setCurrent(first, 0); }
    }
    setFace();
  };

  /** A symbol made current: by cycling, or picked in the panel or placed through + with no symbol selected. */
  const makeCurrent = (g: number, index: number) => {
    setCurrent(g, index);
    group = g;
    setFace();
  };

  /**
   * Replace the selected symbol with `sym`, keeping its size relative to its symbol's scale, its own
   * colour, background and pass, and the selection; the size it implies becomes the score's symbol size,
   * and `sym` its group's current symbol.
   */
  const replaceWith = (sel: Selected, sym: LibrarySymbol) => {
    const { marking } = sel;
    if (!lib) return;
    const size = (marking.size / scaleOf(lib, marking.font, marking.text)) * sym.scale;
    // It keeps its own colour, background and pass, not the new symbol's.
    const { background: _, ...fresh } = placed(sym, marking.at, size);
    const replacement = compactMarking({
      ...fresh, ...(marking.color ? { color: marking.color } : {}), ...(marking.background ? { background: { ...marking.background } } : {}),
      ...(marking.pass !== undefined ? { pass: marking.pass } : {}),
    }) as PlacedMarking;
    host.commit(setSymbolSize(replaceMarking(host.state(), sel.page, marking, replacement), size / sym.scale), sel.cut, { ...sel, marking: replacement });
    host.select({ ...sel, marking: replacement });
    const at = findSymbol(lib, sym.font, sym.text);
    if (at) makeCurrent(at.group, at.index);
  };

  /** A symbol picked in the panel: the selected symbol becomes it, and with none selected it is current. */
  const pick = (g: number, index: number) => {
    const sel = selectedSymbol(), sym = lib && symbolsOf(lib, g)[index];
    if (sel && sym) replaceWith(sel, sym);
    else makeCurrent(g, index);
  };

  /**
   * + in the second row: pick glyphs, which go among the ad-hoc symbols unless the library has
   * them; the selected symbol becomes them, and with none selected they are the tool's.
   */
  const addSymbol = () => {
    const dialog = showDialog('Place a symbol', 'glyph-picker');
    glyphPicker(dialog, {
      font: pickerFont,
      text: '',
      okLabel: 'Place',
      cancel: () => closeOverlay(),
      done: (font, text) => {
        closeOverlay();
        pickerFont = font;
        void (async () => {
          try {
            const sym = await makeSymbol(font, text, 1);
            if (!lib) return;
            let at = findSymbol(lib, font, text);
            if (!at || at.group < 0) {
              setLibrary(addAdhoc(lib, sym));
              at = { group: -1, index: 0 };
            }
            pick(at.group, at.index);
          } catch (e) { host.say(failed('make the symbol', e)); }
        })();
      },
    });
  };

  /**
   * A symbol dragged in the panel. The tool's symbol stays the tool's wherever it goes, and each
   * group's current symbol stays current in whichever group it is in now.
   */
  const moveSymbolTo = (from: SymbolAt, to: SymbolAt | 'new') => {
    if (!lib) return;
    const key = (s: LibrarySymbol) => `${s.font}|${s.text}`;
    const tool = picked(), before = lib;
    const currentKeys = new Set([...before.groups.keys(), -1].flatMap((g) => { const s = symbolsOf(before, g)[currentOf(g)]; return s ? [key(s)] : []; }));
    const next = moveSymbol(before, from, to);
    const currentIn = (g: number) => Math.max(0, symbolsOf(next, g).findIndex((s) => currentKeys.has(key(s))));
    currents = next.groups.map((_, g) => currentIn(g));
    adhocCurrent = currentIn(-1);
    const at = tool && findSymbol(next, tool.font, tool.text);
    if (at) group = at.group;
    setLibrary(next);
  };

  /** A group of the panel moved to `to`: each group keeps its current symbol, and the tool its group. */
  const moveGroupTo = (from: number, to: number) => {
    if (!lib || !lib.groups[from] || to < 0 || to >= lib.groups.length) return;
    const r = reorderedCurrents(currents, group, from, to);
    currents = r.currents;
    group = r.group;
    setLibrary(moveGroup(lib, from, to));
  };

  /* ---------- placing and cycling ---------- */

  /** The current symbol as it would be placed, centred at `at`: its colour and background. */
  const symbolMarking = (at: [number, number]): PlacedMarking | undefined => {
    const sym = picked();
    if (!sym) return undefined;
    const made = placed(sym, at, symbolSizeOf(host.state().score) * sym.scale), color = ownColor(host.settings().symbol.color);
    return color ? { ...made, color } : made;
  };

  /** Replace the selected symbol with the next of its group. */
  const cycle = (sel: Selected) => {
    const next = lib && nextSymbol(lib, sel.marking.font, sel.marking.text);
    if (next) replaceWith(sel, next);
  };

  /* ---------- the panel ---------- */

  /** A colour from the panel: the selected symbol takes it, and so do new ones. */
  const panelColor = (c: ColorChoice) => {
    const sel = selectedSymbol();
    if (sel && sel.marking.color !== ownColor(c)) {
      const { color: _, ...rest } = sel.marking, own = ownColor(c);
      const marked: PlacedMarking = own ? { ...rest, color: own } : rest;
      host.commit(replaceMarking(host.state(), sel.page, sel.marking, marked), sel.cut, { ...sel, marking: marked });
    }
    host.setSettings((s) => ({ ...s, symbol: { color: c } }));
  };

  /**
   * A background shape or colour from the panel: the selected symbol takes it, and so does the
   * library symbol (the selected symbol's, or with none selected the tool's), which the next
   * marking of it is a copy of.
   */
  const panelBackground = (change: { shape?: BackgroundChoice; color?: ColorChoice }) => {
    const sel = selectedSymbol();
    const resolve = (was: Background | undefined) => backgroundOf(change.shape ?? was?.shape ?? 'none', change.color ?? was?.color ?? 'default');
    let next: Background | undefined;
    if (sel) {
      next = resolve(sel.marking.background);
      if (JSON.stringify(next) !== JSON.stringify(sel.marking.background)) {
        const { background: _, ...rest } = sel.marking;
        const marked: PlacedMarking = next ? { ...rest, background: next } : rest;
        host.commit(replaceMarking(host.state(), sel.page, sel.marking, marked), sel.cut, { ...sel, marking: marked });
      }
    }
    const at = lib && sel && findSymbol(lib, sel.marking.font, sel.marking.text);
    const sym = sel ? lib && at && symbolsOf(lib, at.group)[at.index] : picked();
    if (lib && sym) {
      const { background: _, ...rest } = sym, was = sel ? next : resolve(sym.background);
      setLibrary(replaceSymbol(lib, sym, was ? { ...rest, background: was } : rest));
    } else setFace();
  };

  const placing = placingTool(host, {
    name: 'symbol',
    owns: isSymbol,
    place(slot, at) {
      const made = symbolMarking(at), state = host.state();
      if (!made) return;
      const claimed = claimMarking(slot.frame, compactMarking(made), host.aspects());
      if (!claimed) return;
      const { cut, marking } = claimed;
      host.commit(setInk(state, cut.page, [...(state.ink[cut.page] ?? []), marking]), cut.id);
    },
    ghost: symbolMarking,
    again: cycle,
    resized: (s, size, from) => setSymbolSize(s, size / scaleOf(lib, from.font, from.text)),
  });

  return {
    ...placing,
    async showPanel(anchor) {
      if (!await ensureLibrary()) return;
      const sel = selectedSymbol()?.marking, was = sel ? sel.background : picked()?.background;
      const v: SymbolSettingsView = {
        color: sel ? sel.color ?? 'default' : host.settings().symbol.color,
        background: was?.shape ?? 'none',
        backgroundColor: was?.color ?? 'default',
      };
      showSymbolPanel(anchor, {
        library: () => lib!,
        // The panel lights the selected symbol, as the button pictures it; with none selected, the tool's.
        tool: () => { const s = selectedSymbol()?.marking ?? picked(); return lib && s && equipped ? findSymbol(lib, s.font, s.text) : undefined; },
        pick: (at) => pick(at.group, at.index),
        move: moveSymbolTo,
        moveGroup: moveGroupTo,
        add: addSymbol,
        edit: () => { if (lib) editLibrary({ library: () => lib!, change: setLibrary }); },
      }, v, { color: panelColor, background: (b) => panelBackground({ shape: b }), backgroundColor: (c) => panelBackground({ color: c }) });
    },
    async onEquipped() {
      equipped = true;
      // The library is made the first time it is needed; with no symbol to place, the tool goes.
      if (!await ensureLibrary() || !picked()) { host.unequip(); return; }
      setFace();
    },
    onUnequipped() {
      equipped = false;
    },
    onSettingsChanged: setFace,
    onSelectionChanged() {
      placing.onSelectionChanged!();
      setFace();
    },
  };
};
