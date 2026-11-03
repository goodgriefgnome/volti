// The tools that place markings whole, symbols and text: tapping selects, the selected marking's
// second tap cycles or edits it, dragging moves it or resizes it from a corner. What a tap on empty
// music does is what tells the tools apart.

import { type LibrarySymbol, nextSymbol, scaleOf } from '../../markings/library';
import { compactMarking, type Point } from '../../markings/model';
import { markExtent, type PlacedMark } from '../../markings/placed';
import { replaceMarking, setSymbolSize, textResized } from '../../scores/edits';
import type { Placed } from '../../scores/frames';
import { symbolSizeOf, type Cut, type State } from '../../scores/model';
import { centreOnFrame, extentOnFrame, handleRadius, MIN_BOX_PX, movedTo, placedAt, pressOnSelection, resizedFrom, selectionBox, type Selected } from '../../scores/placing';
import { isTap } from '../_gestures';
import { loupeTarget, type SharpInk } from '../_loupe';
import { slotUnder, type FrameSlot } from '../_spread';
import type { Tool, ToolHost } from './_tool';

/** How far from a marking's ink a tap still counts as on it, in CSS pixels. */
const TAP_MARGIN_PX = 12;

/**
 * The selected marking's box on `item`'s frame, and the radius of its handles (frame widths), with
 * `px` the CSS pixels in a frame width: what the box drawn by `SelectionBox` is.
 */
function selectionOn(item: Placed, sel: Selected, aspect: number, px: number): { box: [number, number, number, number]; r: number } | undefined {
  const ext = extentOnFrame(item, sel.mark, aspect);
  if (!ext) return undefined;
  const box = selectionBox(ext, MIN_BOX_PX / px);
  return { box, r: handleRadius(Math.min(box[2] - box[0], box[3] - box[1]) * px) / px };
}

/** A placed symbol made from a library symbol, centred at `at` of its frame. */
export const placed = (sym: LibrarySymbol, at: [number, number], size: number): PlacedMark => ({
  kind: 'symbol', text: sym.text, font: sym.font, glyphs: sym.glyphs.map((g) => [...g]), at, size,
  ...(sym.background && { background: { ...sym.background } }),
});

/** Replace the selected symbol with the next of its group, and make the size it implies the score's symbol size. */
function cycle(host: ToolHost, cut: string, mark: PlacedMark) {
  const lib = host.library();
  const next = lib && nextSymbol(lib, mark.font, mark.text);
  if (!lib || !next) return;
  const size = (mark.size / scaleOf(lib, mark.font, mark.text)) * next.scale;
  // It keeps its own colour and background, not the next symbol's.
  const { background: _, ...fresh } = placed(next, mark.at, size);
  const replacement = compactMarking({ ...fresh, ...(mark.color ? { color: mark.color } : {}), ...(mark.background ? { background: { ...mark.background } } : {}) }) as PlacedMark;
  host.commit(setSymbolSize(replaceMarking(host.state(), cut, mark, replacement), size / next.scale), cut, { cut, mark: replacement });
  host.select({ cut, mark: replacement });
  host.cycled(next);
}

/** What a tap does, from what is selected and what was hit. */
export function _tapAction(selected: PlacedMark | undefined, hit: PlacedMark | undefined): 'deselect' | 'select' | 'again' | 'place' {
  if (selected) return !hit ? 'deselect' : hit === selected ? 'again' : 'select';
  return hit ? 'select' : 'place';
}

/**
 * Whether a press at `p` on `slot` is on a placed marking, or on the selected marking's box or
 * one of its handles: what, with no tool, goes to `selectingTool` instead of panning.
 */
export function pressesMarking(host: ToolHost, slot: FrameSlot, press: Point): boolean {
  const p: [number, number] = [press[0], press[1]], px = slot.w * host.zoom().s, aspects = host.aspects();
  if (placedAt(slot.frame, host.state().ink, aspects, p, TAP_MARGIN_PX / px)) return true;
  const sel = host.selected(), item = sel && slot.frame.items.find((i) => i.cut.id === sel.cut);
  const on = sel && item && selectionOn(item, sel, aspects[item.cut.page], px);
  return !!on && !!pressOnSelection(on.box, on.r, p);
}

/**
 * What lifting after a press on a marking does: `moved` is whether the finger ended anywhere but
 * where it went down, `tap` whether the press qualifies as a tap (quick, and within the tap
 * distance). A tap keeps what moving it did and then acts; a slower press is only a move, however
 * small; a tap that moved nothing is only the tap.
 */
export function _lifted(moved: boolean, tap: boolean): 'tap' | 'move-then-tap' | 'move' {
  return !tap ? 'move' : moved ? 'move-then-tap' : 'tap';
}

/** What a pointer that has gone down is doing: with a grab, it moves or resizes a marking from the press. */
type Grab =
  | { kind: 'move'; from: Selected; centre: readonly [number, number] }
  | { kind: 'resize'; from: Selected; corner: 0 | 1 | 2 | 3; ext: [number, number, number, number]; centre: readonly [number, number] };

/**
 * A tool for placed markings. `place` is what a tap on empty music does, and what lifting after
 * pressing on empty music and dragging does, on the slot the finger is over. `ghost` is what the
 * press shows under the finger meanwhile: a marking centred at `at`; undefined: nothing to place yet.
 */
export function placingTool(
  label: string,
  place: (host: ToolHost, slot: FrameSlot, at: [number, number]) => void,
  ghost: (host: ToolHost, at: [number, number]) => PlacedMark | undefined,
): Tool {
  return {
    label,
    start(host, slot, p0) {
      const t0 = performance.now();
      const px = slot.w * host.zoom().s; // CSS pixels in a frame width
      const aspects = host.aspects();
      const at0: [number, number] = [p0[0], p0[1]];
      const itemOf = (cut: string) => slot.frame.items.find((i) => i.cut.id === cut);

      // A press on a handle of the selected marking's box resizes it; on the box, moves it (and a tap acts on it, whatever lies under); on another placed marking, that marking.
      let grab: Grab | undefined;
      let hit: { cut: Cut; mark: PlacedMark } | undefined;
      const sel = host.selected(), selItem = sel && itemOf(sel.cut);
      const on = sel && selItem && selectionOn(selItem, sel, aspects[selItem.cut.page], px);
      const pressed = on && pressOnSelection(on.box, on.r, at0);
      if (sel && selItem && on && pressed) {
        const centre = centreOnFrame(selItem, sel.mark, aspects[selItem.cut.page]);
        if (pressed.kind === 'handle') grab = { kind: 'resize', from: sel, corner: pressed.corner, ext: on.box, centre };
        else { grab = { kind: 'move', from: sel, centre }; hit = { cut: selItem.cut, mark: sel.mark }; }
      } else {
        hit = placedAt(slot.frame, host.state().ink, aspects, at0, TAP_MARGIN_PX / px);
        if (hit) {
          const item = itemOf(hit.cut.id)!;
          grab = { kind: 'move', from: { cut: hit.cut.id, mark: hit.mark }, centre: centreOnFrame(item, hit.mark, aspects[item.cut.page]) };
        }
      }
      // A press on empty music with a marking selected only deselects, at once: it shows, moves and places nothing, tap or drag.
      const inert = !grab && !!sel;
      if (inert) host.select(undefined);

      let last: Point = p0;
      // A press on a marking moves or resizes it from the first pixel.
      const dragging = !!grab;
      // A press on empty music that has moved on: the slot and point showing the ghost.
      let placing = false;
      let over: { slot: FrameSlot; at: [number, number] } | undefined;
      const moved = () => !isTap({ x0: p0[0] * px, y0: p0[1] * px, x1: last[0] * px, y1: last[1] * px, ms: 0 });

      /** The state the drag so far makes, the marking as it is in it, and the size it implies for a symbol. */
      const dragged = (g: Grab) => {
        if (g.kind === 'move') return movedTo(host.state(), slot.frame, g.from, [g.centre[0] + last[0] - p0[0], g.centre[1] + last[1] - p0[1]], aspects);
        const r = resizedFrom(g.ext, g.corner, [last[0], last[1]], g.centre, g.from.mark.size);
        return movedTo(host.state(), slot.frame, g.from, r.at, aspects, r.size);
      };

      /** What a tap does; `target` is the marking it was on as it is now, if the press moved it. */
      const tap = (target?: Selected) => {
        if (grab?.kind === 'resize') return; // a tap on a handle does nothing
        const on = target ?? (hit && { cut: hit.cut.id, mark: hit.mark });
        switch (_tapAction(sel?.mark, hit?.mark)) {
          case 'deselect': host.select(undefined); break;
          case 'select': host.select(on!); break;
          case 'again': if (on!.mark.kind === 'text') host.editText(on!); else cycle(host, on!.cut, on!.mark); break;
          case 'place': {
            // Where the ghost was when the finger lifted, so what was shown is what is placed.
            const under = slotUnder(host.slots(), slot, [last[0], last[1]]);
            if (under) place(host, under.slot, under.at);
            break;
          }
        }
      };

      // The loupe, while a marking is dragged: begun with the first ink box it is shown for.
      let lens = false;
      /** Show the loupe on an ink box (frame widths on slot `s`), with the finger at `client`. */
      const magnify = (s: FrameSlot, ext: readonly number[] | undefined, client: { x: number; y: number }, ink: SharpInk) => {
        if (!ext) return;
        const r = s.box.getBoundingClientRect(); // includes the zoom
        const box = { x0: r.left + ext[0] * r.width, y0: r.top + ext[1] * r.width, x1: r.left + ext[2] * r.width, y1: r.top + ext[3] * r.width };
        // The score's staff on screen: its symbol size in page widths, and a frame is a page wide.
        if (!lens) { host.loupe().begin(symbolSizeOf(host.state().score) * r.width); lens = true; }
        host.loupe().show(host.slots(), loupeTarget(box), client, ink);
      };
      const unmagnify = () => { if (lens) host.loupe().end(); lens = false; };

      /** Show the ghost under the finger, on the slot there, repainting only what changed. */
      const showGhost = (client: { x: number; y: number }) => {
        const now = slotUnder(host.slots(), slot, [last[0], last[1]]);
        const mark = now && ghost(host, now.at);
        if (over && (!now || !mark || over.slot !== now.slot)) { host.paintInk(over.slot); over = undefined; }
        if (!now || !mark) { unmagnify(); return; }
        if (!over || over.at[0] !== now.at[0] || over.at[1] !== now.at[1]) {
          host.paintInk(now.slot, mark);
          over = now;
        }
        const e = markExtent(mark);
        magnify(now.slot, e && [now.at[0] + e[0] * mark.size, now.at[1] + e[1] * mark.size, now.at[0] + e[2] * mark.size, now.at[1] + e[3] * mark.size], client, { ink: host.state().ink, extra: { slot: now.slot, mark } });
      };

      /** Forget the drag: show the ink as it is, and the box again. */
      const drop = () => {
        unmagnify();
        if (over) { host.paintInk(over.slot); over = undefined; }
        if (dragging) { host.paintInk(slot); host.select(host.selected()); }
      };

      // Pointer events come faster than frames: `move` records the latest, and what it shows is drawn once per animation frame.
      let client = { x: 0, y: 0 };
      let frame = 0;
      const draw = () => {
        frame = 0;
        if (!grab) {
          if (placing) showGhost(client);
          return;
        }
        if (!dragging) return;
        const r = dragged(grab);
        host.paintState(slot, r.state);
        const item = itemOf(r.selected.cut);
        magnify(slot, item && extentOnFrame(item, r.selected.mark, aspects[item.cut.page]), client, { ink: r.state.ink });
      };
      const cancelFrame = () => { cancelAnimationFrame(frame); frame = 0; };

      // The loupe is there from the press, on a placed marking or (with nothing selected) on empty music; a marking moves from the first pixel, a ghost is placed only past the tap distance.
      {
        const b = slot.box.getBoundingClientRect(); // includes the zoom
        client = { x: b.left + p0[0] * b.width, y: b.top + p0[1] * b.width };
        if (grab) {
          const item = itemOf(grab.from.cut);
          magnify(slot, item && extentOnFrame(item, grab.from.mark, aspects[item.cut.page]), client, { ink: host.state().ink });
        } else if (!sel) showGhost(client);
      }

      return {
        move(p, c) {
          last = p;
          client = c;
          if (!grab && !placing) {
            if (inert || !moved()) return;
            placing = true;
          }
          frame ||= requestAnimationFrame(draw);
        },
        holds: () => !!grab,
        end(cancelled) {
          cancelFrame();
          if (cancelled) { drop(); return; }
          if (placing) {
            // Lifting over a slot places there; anywhere else places nothing.
            const under = slotUnder(host.slots(), slot, [last[0], last[1]]);
            drop();
            if (under) place(host, under.slot, under.at);
            return;
          }
          const ms = performance.now() - t0;
          const tapped = isTap({ x0: p0[0] * px, y0: p0[1] * px, x1: last[0] * px, y1: last[1] * px, ms });
          if (!grab) {
            // Hide what the press showed.
            drop();
            if (tapped) tap();
            return;
          }
          const g = grab, how = _lifted(last[0] !== p0[0] || last[1] !== p0[1], tapped);
          if (how === 'tap') { drop(); tap(); return; }
          const r = dragged(g);
          unmagnify();
          let state: State = r.state;
          if (g.kind === 'resize') {
            const size = r.selected.mark.size;
            state = g.from.mark.kind === 'text'
              ? textResized(state, size)
              : setSymbolSize(state, size / scaleOf(host.library(), g.from.mark.font, g.from.mark.text));
          }
          host.commit(state, r.selected.cut, r.selected);
          host.select(r.selected);
          if (how === 'move-then-tap') tap(r.selected);
        },
        drop() { cancelFrame(); drop(); },
      };
    },
  };
}

/** With no tool, a press on a marking: a tap selects, deselects or goes again, a drag moves or resizes; it never places. */
export const selectingTool: Tool = placingTool('Select', () => {}, () => undefined);
