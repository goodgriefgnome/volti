// The eraser: taking away the markings it touches, the whole sweep as one undo step.

import { hitDistance, type Point } from '../../markings/model';
import { setInk } from '../../scores/edits';
import { visible } from '../../scores/ownership';
import type { FrameSlot } from '../_spread';
import { iconFace } from './_faces';
import { TOOL_LABELS, type Tool, type ToolHost } from './_tool';

const ERASER_RADIUS = 0.012;

/** Take away the markings on the frame that the eraser at `p` touches. */
function eraseAt(host: ToolHost, slot: FrameSlot, p: Point) {
  let s = host.state();
  for (const item of slot.frame.items) {
    const { cut } = item, aspect = host.aspects()[cut.page];
    const list = s.ink[cut.id] ?? [];
    // The point on this cut's page; the eraser stays the same size on screen however far you zoom in.
    const q: Point = [p[0], cut.y0 + (p[1] - item.top) / aspect, p[2]];
    const keep = list.filter((m) => !(visible(m, cut, aspect) && hitDistance(m, q, ERASER_RADIUS / host.zoom().s, aspect) !== undefined));
    if (keep.length !== list.length) s = setInk(s, cut.id, keep);
  }
  if (s === host.state()) return;
  host.show(s, slot);
}

/** The eraser: markings go as it touches them, and the whole sweep is one undo step. */
export const eraserTool = (host: ToolHost): Tool => {
  host.setButtonFace(iconFace('M8 20h12M5 15l8-8 5 5-6 6H9z'));
  return {
    name: 'eraser',
    label: TOOL_LABELS.eraser,
    suppressions: () => ({ selecting: true }),
    start({ slot, framePoint: p }) {
      if (!slot) return undefined;
      const before = host.state();
      eraseAt(host, slot, p);
      return {
        move(p) { eraseAt(host, slot, p); },
        end() {
          if (host.state() !== before) host.undoTo(before, slot);
        },
        drop() {},
      };
    },
  };
};
