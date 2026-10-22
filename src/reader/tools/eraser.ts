import { touches, type Point } from '../../ink/model';
import { setInk } from '../../pieces/edits';
import { visible } from '../../pieces/ink';
import type { FrameSlot } from '../spread';
import type { Tool, ToolHost } from './tool';

const ERASER_RADIUS = 0.012;

/** Take away the strokes on the frame that the eraser at `p` touches. */
function eraseAt(host: ToolHost, slot: FrameSlot, p: Point) {
  let s = host.state();
  for (const item of slot.frame.items) {
    const { cut } = item, aspect = host.aspects[cut.page];
    const list = s.ink[cut.id] ?? [];
    // The point on this cut's page; the eraser stays the same size on screen however far you zoom in.
    const q: Point = [p[0], cut.y0 + (p[1] - item.top) / aspect, p[2]];
    const keep = list.filter((st) => !(visible(st, cut, aspect) && touches(st, q, aspect, ERASER_RADIUS / host.scale())));
    if (keep.length !== list.length) s = setInk(s, cut.id, keep);
  }
  if (s === host.state()) return;
  host.erased(s, slot);
}

/** The eraser: strokes go as it touches them, and the whole sweep is one undo step. */
export const eraserTool: Tool = {
  start(host, slot, p) {
    const before = host.state();
    eraseAt(host, slot, p);
    return {
      move(p) { eraseAt(host, slot, p); },
      end() {
        if (host.state() !== before) host.eraseEnded(before, slot);
      },
      drop() {},
    };
  },
};
