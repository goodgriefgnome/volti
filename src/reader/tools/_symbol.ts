// The symbol tool: tapping the music places the current symbol or selects a placed marking, and
// tapping the selected one cycles it to the next symbol of its group.

import { type LibrarySymbol, nextSymbol, scaleOf } from '../../markings/library';
import { compactMarking, type Point } from '../../markings/model';
import type { PlacedMark } from '../../markings/placed';
import { setSymbolSize, replaceMarking, setInk } from '../../scores/edits';
import { symbolSizeOf } from '../../scores/model';
import { claimMarking } from '../../scores/ownership';
import { placedAt } from '../../scores/placing';
import { isTap } from '../_gestures';
import type { Tool, ToolHost } from './_tool';

/** How far from a marking's ink a tap still counts as on it, in CSS pixels. */
const TAP_MARGIN_PX = 12;

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

export const symbolTool: Tool = {
  label: 'Symbol',
  start(host, slot, p0) {
    const t0 = performance.now();
    let last: Point = p0;
    return {
      move(p) { last = p; },
      end(cancelled) {
        if (cancelled) return;
        const zoom = host.zoom().s, px = slot.w * zoom;
        if (!isTap({ x0: p0[0] * px, y0: p0[1] * px, x1: last[0] * px, y1: last[1] * px, ms: performance.now() - t0 })) return;
        const state = host.state();
        const hit = placedAt(slot.frame, state.ink, host.aspects(), [p0[0], p0[1]], TAP_MARGIN_PX / px);
        if (hit) {
          if (host.selected()?.mark === hit.mark) cycle(host, hit.cut.id, hit.mark);
          else host.select({ cut: hit.cut.id, mark: hit.mark });
          return;
        }
        const sym = host.placing();
        if (!sym) return;
        const claimed = claimMarking(slot.frame, compactMarking(placed(sym, [p0[0], p0[1]], symbolSizeOf(state.score) * sym.scale)), host.aspects());
        if (!claimed) return;
        const { cut, marking } = claimed;
        host.commit(setInk(state, cut.id, [...(state.ink[cut.id] ?? []), marking]), cut.id);
        host.select({ cut: cut.id, mark: marking as PlacedMark });
      },
      drop() {},
    };
  },
};
