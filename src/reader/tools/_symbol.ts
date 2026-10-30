// The symbol tool: tapping the music places the current symbol or selects a placed marking, tapping
// the selected one cycles it to the next symbol of its group, and dragging moves a placed marking, or
// resizes the selected one from a corner handle.

import { type LibrarySymbol, nextSymbol, scaleOf } from '../../markings/library';
import { compactMarking, type Point } from '../../markings/model';
import type { PlacedMark } from '../../markings/placed';
import { replaceMarking, setInk, setSymbolSize } from '../../scores/edits';
import { symbolSizeOf, type State } from '../../scores/model';
import { claimMarking } from '../../scores/ownership';
import { centreOnFrame, extentOnFrame, movedTo, placedAt, resizedFrom, type Selected } from '../../scores/placing';
import { isTap } from '../_gestures';
import type { Tool, ToolHost } from './_tool';

/** How far from a marking's ink a tap still counts as on it, in CSS pixels. */
const TAP_MARGIN_PX = 12;
/** How far from a corner of the selected marking's box a press still takes its handle, in CSS pixels. */
const HANDLE_REACH_PX = 24;

/** How far inside the edge of the selected marking's box a press still takes a handle, in CSS pixels, for a box big enough. */
const HANDLE_INSET_PX = 3;

/** A placed symbol made from a library symbol, centred at `at` of its frame. */
const placed = (sym: LibrarySymbol, at: [number, number], size: number): PlacedMark => ({
  kind: 'symbol', text: sym.text, font: sym.font, glyphs: sym.glyphs.map((g) => [...g]), at, size,
});

/** Replace the selected symbol with the next of its group, and make the size it implies the score's symbol size. */
function cycle(host: ToolHost, cut: string, mark: PlacedMark) {
  const lib = host.library();
  const next = lib && nextSymbol(lib, mark.font, mark.text);
  if (!lib || !next) return;
  const size = (mark.size / scaleOf(lib, mark.font, mark.text)) * next.scale;
  const replacement = compactMarking({ ...placed(next, mark.at, size), ...(mark.color ? { color: mark.color } : {}) }) as PlacedMark;
  host.commit(setSymbolSize(replaceMarking(host.state(), cut, mark, replacement), size / next.scale), cut);
  host.select({ cut, mark: replacement });
}

/** What a pointer that has gone down is doing, once it moves far enough not to be a tap. */
type Grab =
  | { kind: 'move'; from: Selected; centre: readonly [number, number] }
  | { kind: 'resize'; from: Selected; corner: 0 | 1 | 2 | 3; ext: [number, number, number, number]; centre: readonly [number, number] };

export const symbolTool: Tool = {
  label: 'Symbol',
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

    let last: Point = p0;
    let dragging = false;
    const moved = () => !isTap({ x0: p0[0] * px, y0: p0[1] * px, x1: last[0] * px, y1: last[1] * px, ms: 0 });

    /** The state the drag so far makes, the marking as it is in it, and the size it implies for a symbol. */
    const dragged = (g: Grab) => {
      if (g.kind === 'move') return movedTo(host.state(), slot.frame, g.from, [g.centre[0] + last[0] - p0[0], g.centre[1] + last[1] - p0[1]], aspects);
      const r = resizedFrom(g.ext, g.corner, [last[0], last[1]], g.centre, g.from.mark.size);
      return movedTo(host.state(), slot.frame, g.from, r.at, aspects, r.size);
    };

    const tap = () => {
      if (hit) {
        if (host.selected()?.mark === hit.mark) cycle(host, hit.cut.id, hit.mark);
        else host.select({ cut: hit.cut.id, mark: hit.mark });
        return;
      }
      const sym = host.placing(), state = host.state();
      if (!sym) return;
      const claimed = claimMarking(slot.frame, compactMarking(placed(sym, at0, symbolSizeOf(state.score) * sym.scale)), aspects);
      if (!claimed) return;
      const { cut, marking } = claimed;
      host.commit(setInk(state, cut.id, [...(state.ink[cut.id] ?? []), marking]), cut.id);
      host.select({ cut: cut.id, mark: marking as PlacedMark });
    };

    /** Forget the drag: show the ink as it is, and the box again. */
    const drop = () => {
      if (dragging) { host.paintInk(slot); host.select(host.selected()); }
    };

    return {
      move(p) {
        last = p;
        if (!grab) return;
        if (!dragging && moved()) dragging = true;
        if (dragging) host.paintState(slot, dragged(grab).state);
      },
      end(cancelled) {
        if (cancelled) { drop(); return; }
        if (!dragging) {
          if (isTap({ x0: p0[0] * px, y0: p0[1] * px, x1: last[0] * px, y1: last[1] * px, ms: performance.now() - t0 })) tap();
          return;
        }
        const g = grab!, r = dragged(g);
        let state: State = r.state;
        if (g.kind === 'resize' && g.from.mark.kind === 'symbol') {
          state = setSymbolSize(state, r.selected.mark.size / scaleOf(host.library(), g.from.mark.font, g.from.mark.text));
        }
        host.commit(state, r.selected.cut);
        host.select(r.selected);
      },
      drop,
    };
  },
};
