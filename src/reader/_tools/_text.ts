// The Text tool: a tap on empty music, or a press dragged and lifted over a page, starts typing
// there; until then the press shows "Ag". It owns text markings (selecting one lends it), their
// typing field, the ghost, the font, and placing, editing and re-shaping text. The state machine for
// a press, and the box round the selected marking, are _placing.ts.

import { ACADEMICO, fontChoices, fontMetrics, shapeWith, type FontChoice } from '../../fonts/fonts';
import { mix } from '../../markings/draw';
import { compactMarking, type Marking } from '../../markings/model';
import { baselineStart, markColors, textMark, type Background, type PlacedMark } from '../../markings/placed';
import { saveGlyphs } from '../../markings/store';
import { backgroundOf, ownColor, type BackgroundChoice, type ColorChoice } from '../../markings/tool-settings';
import { replaceMarking, setInk, textResized, textSizeOf } from '../../scores/edits';
import { claimMarking } from '../../scores/ownership';
import { centreOnFrame, movedTo, type Selected } from '../../scores/placing';
import type { FrameSlot } from '../_spread';
import { showTextPanel, type TextPanel } from './_tool-panels';
import { textFace, type Look } from './_faces';
import { placingTool } from './_placing';
import type { Tool, ToolHost } from './_tool';
import { TypingField } from './_typing';
import { failed, failedOnce } from '../../ui/failure';

export const textTool = (host: ToolHost): Tool => {
  const typing = new TypingField((px) => host.lift(px));
  /** The fonts text can be typed in, once known. */
  let fonts: FontChoice[] = [];
  void fontChoices().then((all) => { fonts = all.filter((c) => c.text); }, (e) => console.warn('Could not list the fonts:', e));
  let equipped = false;

  const isText = (m: Marking) => 'kind' in m && m.kind === 'text';
  /** The selected marking, when it is a text marking. */
  const selectedText = (): Selected | undefined => {
    const sel = host.selected();
    return sel && isText(sel.mark) ? sel : undefined;
  };

  /* ---------- the button ---------- */

  /** What the button shows: the selected text marking's look, else the settings for the next one. */
  const look = (): Look => {
    const m = selectedText()?.mark;
    if (m) return { font: m.font, color: m.color ?? markColors().color, ...(m.background ? { background: m.background } : {}) };
    const t = host.settings().text, background = backgroundOf(t.background, t.backgroundColor);
    return { font: t.font ?? ACADEMICO, color: ownColor(t.color) ?? markColors().color, ...(background ? { background } : {}) };
  };
  const setFace = () => host.setButtonFace(textFace(look()));
  setFace();

  /* ---------- the ghost ---------- */

  /** "Ag" shaped in a font, for the ghost; the font it was asked for, to ask once. */
  let ghostText: { font: string; glyphs: { gid: number; x: number; y: number }[]; capHeight: number } | undefined;
  let ghostFont: string | undefined;

  /** Shape "Ag" in the text font, once, so the ghost can show; it shows when this is done. */
  const prepareGhost = () => {
    const font = host.settings().text.font ?? ACADEMICO;
    if (ghostFont === font) return;
    ghostFont = font;
    ghostText = undefined;
    void (async () => {
      try {
        const [shaped, { capHeight }] = await Promise.all([shapeWith(font, 'Ag'), fontMetrics(font)]);
        await saveGlyphs(font, shaped.paths);
        if (ghostFont === font) ghostText = { font, glyphs: shaped.glyphs, capHeight };
      } catch (e) { failedOnce('draw the preview', e); }
    })();
  };

  /** What a press shows under the finger: "Ag" where typing would start, in the text's size, font and background, its colour tinted towards the selection blue. */
  const ghost = (at: [number, number]): PlacedMark | undefined => {
    const g = ghostText, t = host.settings().text;
    if (!g || g.font !== (t.font ?? ACADEMICO)) return undefined;
    const size = textSizeOf(host.state().score);
    const made = textMark(g.font, 'Ag', g.glyphs, [at[0], at[1] + (g.capHeight / 2) * size], size);
    if (!made) return undefined;
    const background = backgroundOf(t.background, t.backgroundColor);
    return { ...made, color: mix(ownColor(t.color) ?? markColors().color, '#1f6fe0', 0.25), ...(background ? { background } : {}) };
  };

  /* ---------- placing, editing and re-shaping ---------- */

  /** Shape typed text and store its glyphs; undefined, having said so, when that fails. */
  const shaped = async (font: string, text: string) => {
    try {
      const s = await shapeWith(font, text);
      await saveGlyphs(font, s.paths);
      return s;
    } catch (e) {
      host.say(failed('place the text', e));
      return undefined;
    }
  };

  /** Typed text, shaped, stored and placed in the frame of `slot`, then selected. */
  const placeText = async (slot: FrameSlot, font: string, size: number, text: string, start: [number, number]) => {
    if (!text.trim()) return;
    const s = await shaped(font, text);
    const made = s && textMark(font, text, s.glyphs, start, size);
    if (!made) return;
    const t = host.settings().text, color = ownColor(t.color), background = backgroundOf(t.background, t.backgroundColor);
    const mark: PlacedMark = { ...made, ...(color ? { color } : {}), ...(background ? { background } : {}) };
    const claimed = claimMarking(slot.frame, compactMarking(mark), host.aspects());
    if (!claimed) return;
    const { cut, marking } = claimed, state = host.state();
    host.commit(setInk(state, cut.page, [...(state.ink[cut.page] ?? []), marking]), cut.id);
  };

  /** A tap with Text as the tool: start typing a new text marking with the middle of its capitals at `at`. */
  const newText = (slot: FrameSlot, at: [number, number]) => {
    host.select(undefined);
    const font = host.settings().text.font ?? ACADEMICO, size = textSizeOf(host.state().score);
    void (async () => {
      try {
        const { capHeight } = await fontMetrics(font);
        const start: [number, number] = [at[0], at[1] + (capHeight / 2) * size];
        await typing.show({
          slot, font, size, color: ownColor(host.settings().text.color) ?? markColors().color, start, text: '',
          done: (text, typed) => void placeText(slot, typed, size, text, start),
          cancel: () => {},
        });
      } catch (e) { host.say(failed('place the text', e)); }
    })();
  };

  /** The slot showing the cut of a selected text marking, and the start of its baseline in that frame. */
  const textSite = (sel: Selected): { slot: FrameSlot; start: [number, number] } | undefined => {
    const slot = host.slots().find((sl) => sl.frame.items.some((i) => i.cut.id === sel.cut));
    const item = slot?.frame.items.find((i) => i.cut.id === sel.cut);
    if (!slot || !item) return undefined;
    const { mark } = sel, size = mark.size;
    const [cx, cy] = centreOnFrame(item, mark, host.aspects()[item.cut.page]), [bx, by] = baselineStart(mark);
    return { slot, start: [cx + bx * size, cy + by * size] };
  };

  /** The field on `sel` closed with `text`: change the marking, delete it when there is no ink, or leave it. */
  const retext = async (sel: Selected, font: string, text: string) => {
    const site = textSite(sel);
    if (!site) return;
    const { slot, start } = site;
    const state = host.state(), { mark } = sel;
    const restore = () => { host.paintInk(slot); host.select(sel); };
    if (!state.ink[sel.page]?.includes(mark)) { host.paintInk(slot); return; }
    if (text === mark.text && font === mark.font) { restore(); return; }
    const s = text.trim() ? await shaped(font, text) : undefined;
    if (text.trim() && !s) { restore(); return; }
    const next = s && textMark(font, text, s.glyphs, start, mark.size);
    if (!next) { host.commit(replaceMarking(state, sel.page, mark), sel.cut); return; }
    const moved = movedTo(state, slot.frame, sel, next.at, host.aspects(), next.size, { text, font, glyphs: next.glyphs });
    host.commit(moved.state, moved.selected.cut, moved.selected);
    host.select(moved.selected);
  };

  /** The selected text marking: open its field on it. */
  const editText = (sel: Selected) => {
    const site = textSite(sel);
    if (!site) return;
    const { slot, start } = site, { mark } = sel, size = mark.size;
    void (async () => {
      try {
        const font = (await fontChoices()).some((c) => c.id === mark.font) ? mark.font : ACADEMICO;
        // Without the marking while its field is open.
        host.paintState(slot, replaceMarking(host.state(), sel.page, sel.mark));
        await typing.show({
          slot, font, size, color: mark.color ?? markColors().color, start, text: mark.text,
          done: (text, typed) => void retext(sel, typed, text),
          cancel: () => { host.paintInk(slot); host.select(sel); },
        });
        placing.drawChrome?.(); // hides the box while the field is open
      } catch (e) {
        host.say(failed('place the text', e));
        host.paintInk(slot);
        host.select(sel);
      }
    })();
  };

  /* ---------- the panel ---------- */

  /** A colour from the panel: the selected text marking takes it, and so do new ones. */
  const panelColor = (c: ColorChoice) => {
    const sel = selectedText();
    if (sel && sel.mark.color !== ownColor(c)) {
      const { color: _, ...rest } = sel.mark, own = ownColor(c);
      const marked: PlacedMark = own ? { ...rest, color: own } : rest;
      host.commit(replaceMarking(host.state(), sel.page, sel.mark, marked), sel.cut, { ...sel, mark: marked });
    }
    host.setSettings((s) => ({ ...s, text: { ...s.text, color: c } }));
  };

  /** A background shape or colour from the panel: the selected text marking takes it, and so do new ones. */
  const panelBackground = (change: { shape?: BackgroundChoice; color?: ColorChoice }) => {
    const sel = selectedText();
    if (sel) {
      const was: Background | undefined = sel.mark.background;
      const next = backgroundOf(change.shape ?? was?.shape ?? 'none', change.color ?? was?.color ?? 'default');
      if (JSON.stringify(next) !== JSON.stringify(was)) {
        const { background: _, ...rest } = sel.mark;
        const marked: PlacedMark = next ? { ...rest, background: next } : rest;
        host.commit(replaceMarking(host.state(), sel.page, sel.mark, marked), sel.cut, { ...sel, mark: marked });
      }
    }
    host.setSettings((s) => ({ ...s, text: { ...s.text, ...(change.shape !== undefined ? { background: change.shape } : {}), ...(change.color !== undefined ? { backgroundColor: change.color } : {}) } }));
  };

  /** A font from the panel: the font of new text, of the text being typed, and of the selected text marking. */
  const setFont = (id: string) => {
    host.setSettings((s) => ({ ...s, text: { ...s.text, font: id } }));
    // The field takes the font once it has loaded, and the panel shows the field's.
    if (typing.open) void typing.setFont(id).then(setFace, (e) => host.say(failed('change the font', e)));
    else {
      const sel = selectedText();
      if (sel && sel.mark.font !== id) void retext(sel, id, sel.mark.text);
    }
  };

  const placing = placingTool(host, {
    name: 'text',
    owns: isText,
    place: newText,
    ghost,
    again: editText,
    resized: (s, size) => textResized(s, size),
    chromeHidden: () => typing.open,
  });

  return {
    ...placing,
    // While the field is open, every press is Text's, and only finishes typing; a marking held is not pinched away.
    suppressions: () => (typing.open ? { allPresses: true } : placing.suppressions!()),
    start(press) {
      if (typing.open) { typing.finish(); return undefined; }
      return placing.start(press);
    },
    showPanel(anchor) {
      const sel = selectedText()?.mark, t = host.settings().text;
      const v: TextPanel = {
        fonts,
        font: typing.font ?? sel?.font ?? t.font ?? ACADEMICO,
        color: sel ? sel.color ?? 'default' : t.color,
        background: sel ? sel.background?.shape ?? 'none' : t.background,
        backgroundColor: sel ? sel.background?.color ?? 'default' : t.backgroundColor,
      };
      showTextPanel(anchor, v, { font: setFont, color: panelColor, background: (b) => panelBackground({ shape: b }), backgroundColor: (c) => panelBackground({ color: c }) });
    },
    onEquipped() {
      equipped = true;
      prepareGhost();
    },
    onUnequipped() {
      equipped = false;
      typing.finish();
    },
    onSettingsChanged() {
      setFace();
      if (equipped) prepareGhost();
    },
    onSelectionChanged() {
      placing.onSelectionChanged!();
      setFace();
    },
    drawChrome() {
      // The layout changed and the field's frame is gone: finish typing.
      const open = typing.slot;
      if (open && !host.slots().includes(open)) typing.finish();
      placing.drawChrome!();
    },
  };
};
