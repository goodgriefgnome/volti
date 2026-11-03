// The tools that place markings whole, symbols and text: tapping selects, the selected marking's
// second tap cycles or edits it, dragging moves it or resizes it from a corner. What a tap on empty
// music does is what tells the tools apart.

import { type LibrarySymbol, nextSymbol, scaleOf } from '../../markings/library';
import { compactMarking, type Point } from '../../markings/model';
import { markExtent, type PlacedMark } from '../../markings/placed';
import { replaceMarking, setSymbolSize, textResized } from '../../scores/edits';
import type { State } from '../../scores/model';
import { centreOnFrame, extentOnFrame, movedTo, placedAt, resizedFrom, type Selected } from '../../scores/placing';
import { isTap } from '../_gestures';
import { loupeTarget, type SharpInk } from '../_loupe';
import { slotUnder, type FrameSlot } from '../_spread';
import type { Tool, ToolHost } from './_tool';

/** How far from a marking's ink a tap still counts as on it, in CSS pixels. */
const TAP_MARGIN_PX = 12;
/** How far from a corner of the selected marking's box a press still takes its handle, in CSS pixels. */
const HANDLE_REACH_PX = 24;

/** How far inside the edge of the selected marking's box a press still takes a handle, in CSS pixels, for a box big enough. */
const HANDLE_INSET_PX = 3;

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
  host.commit(setSymbolSize(replaceMarking(host.state(), cut, mark, replacement), size / next.scale), cut);
  host.select({ cut, mark: replacement });
  host.cycled(next);
}

/** What a tap does, from what is selected and what was hit. */
export function _tapAction(selected: PlacedMark | undefined, hit: PlacedMark | undefined): 'deselect' | 'select' | 'again' | 'place' {
  if (selected) return !hit ? 'deselect' : hit === selected ? 'again' : 'select';
  return hit ? 'select' : 'place';
}

/** What a pointer that has gone down is doing, once it moves far enough not to be a tap. */
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

      // A press on a corner of the selected marking's box takes the handle; on a placed marking, the marking.
      let grab: Grab | undefined;
      const sel = host.selected(), selItem = sel && itemOf(sel.cut);
      const selExt = sel && selItem && extentOnFrame(selItem, sel.mark, aspects[selItem.cut.page]);
      if (sel && selItem && selExt) {
        const corners: [number, number][] = [[selExt[0], selExt[1]], [selExt[2], selExt[1]], [selExt[2], selExt[3]], [selExt[0], selExt[3]]];
        const dist = corners.map(([x, y]) => Math.hypot(x - p0[0], y - p0[1]) * px);
        const corner = dist.indexOf(Math.min(...dist)) as 0 | 1 | 2 | 3;
        // On the box itself (a marking is often smaller than a handle), a press moves it; a handle is taken from just outside, or at the very edge.
        const inset = Math.min(HANDLE_INSET_PX, ((selExt[2] - selExt[0]) * px) / 4, ((selExt[3] - selExt[1]) * px) / 4) / px;
        const inside = p0[0] > selExt[0] + inset && p0[0] < selExt[2] - inset && p0[1] > selExt[1] + inset && p0[1] < selExt[3] - inset;
        if (!inside && dist[corner] <= HANDLE_REACH_PX) grab = { kind: 'resize', from: sel, corner, ext: selExt, centre: centreOnFrame(selItem, sel.mark, aspects[selItem.cut.page]) };
      }
      const hit = placedAt(slot.frame, host.state().ink, aspects, at0, TAP_MARGIN_PX / px);
      if (!grab && hit) {
        const item = itemOf(hit.cut.id)!;
        grab = { kind: 'move', from: { cut: hit.cut.id, mark: hit.mark }, centre: centreOnFrame(item, hit.mark, aspects[item.cut.page]) };
      }
      // A press on empty music deselects at once; `sel` still says what a tap on it does.
      if (!grab && sel) host.select(undefined);

      let last: Point = p0;
      let dragging = false;
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

      const tap = () => {
        switch (_tapAction(sel?.mark, hit?.mark)) {
          case 'deselect': host.select(undefined); break;
          case 'select': host.select({ cut: hit!.cut.id, mark: hit!.mark }); break;
          case 'again': if (hit!.mark.kind === 'text') host.editText(sel!); else cycle(host, hit!.cut.id, hit!.mark); break;
          case 'place': place(host, slot, at0); break;
        }
      };

      // The loupe, while a marking is dragged: begun with the first ink box it is shown for.
      let lens = false;
      /** Show the loupe on an ink box (frame widths on slot `s`), with the finger at `client`. */
      const magnify = (s: FrameSlot, ext: readonly number[] | undefined, client: { x: number; y: number }, ink: SharpInk) => {
        if (!ext) return;
        const r = s.box.getBoundingClientRect(); // includes the zoom
        const box = { x0: r.left + ext[0] * r.width, y0: r.top + ext[1] * r.width, x1: r.left + ext[2] * r.width, y1: r.top + ext[3] * r.width };
        if (!lens) { host.loupe().begin(box.y1 - box.y0); lens = true; }
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

      return {
        move(p, c) {
          last = p;
          client = c;
          if (!grab) {
            if (!placing && moved()) placing = true;
            if (!placing) return;
          } else {
            if (!dragging && moved()) dragging = true;
            if (!dragging) return;
          }
          frame ||= requestAnimationFrame(draw);
        },
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
          if (!dragging) {
            if (isTap({ x0: p0[0] * px, y0: p0[1] * px, x1: last[0] * px, y1: last[1] * px, ms: performance.now() - t0 })) tap();
            return;
          }
          const g = grab!, r = dragged(g);
          unmagnify();
          let state: State = r.state;
          if (g.kind === 'resize') {
            const size = r.selected.mark.size;
            state = g.from.mark.kind === 'text'
              ? textResized(state, size)
              : setSymbolSize(state, size / scaleOf(host.library(), g.from.mark.font, g.from.mark.text));
          }
          host.commit(state, r.selected.cut);
          host.select(r.selected);
        },
        drop() { cancelFrame(); drop(); },
      };
    },
  };
}
