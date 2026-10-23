// The pen and highlighter: making a stroke as the pointer moves, and giving it to a cut when the
// pointer lifts.

import type { Point } from '../../markings/model';
import { compact, drawPenSegment, HIGHLIGHT_COLOR, HIGHLIGHT_SIZE, PEN_SIZE, type Stroke } from '../../markings/stroke';
import { setInk } from '../../scores/edits';
import { claimMarking } from '../../scores/ownership';
import { frameTarget } from '../../render/paint';
import type { FrameSlot } from '../spread';
import type { Tool, ToolHost } from './tool';

/** Draw a stroke as it is written: the pen a segment at a time, the highlighter all again. */
function drawLive(host: ToolHost, slot: FrameSlot, s: Stroke, a: Point, b: Point) {
  if (s.tool !== 'pen') { host.paintInk(slot, s); return; }
  drawPenSegment(frameTarget(slot.ink.getContext('2d')!, slot.ink.width), s, a, b);
  const d = slot.detail;
  if (d) drawPenSegment(frameTarget(d.ink.getContext('2d')!, d.W, d.x, d.y), s, a, b);
}

/** The pen, in the chosen colour, or the highlighter. A finished stroke goes to the cut that holds most of it. */
export const penTool = (kind: 'pen' | 'highlighter'): Tool => ({
  label: kind === 'pen' ? 'Pen' : 'Highlight',
  start(host, slot, p) {
    const hl = kind === 'highlighter';
    const stroke: Stroke = {
      tool: hl ? 'highlighter' : 'pen',
      color: hl ? HIGHLIGHT_COLOR : host.penColor(),
      size: hl ? HIGHLIGHT_SIZE : PEN_SIZE,
      points: [p],
    };
    drawLive(host, slot, stroke, p, p);
    return {
      move(p) {
        const prev = stroke.points.at(-1)!;
        stroke.points.push(p);
        if (stroke.tool === 'pen') drawLive(host, slot, stroke, prev, p);
      },
      moved() {
        if (stroke.tool === 'highlighter') host.paintInk(slot, stroke);
      },
      end(cancelled) {
        if (cancelled) { host.paintInk(slot); return; } // the system decided it was a palm
        const claimed = claimMarking(slot.frame, { ...stroke, points: compact(stroke.points) }, host.aspects);
        if (!claimed) { host.paintInk(slot); return; }
        const { cut, marking } = claimed, state = host.state();
        host.commit(setInk(state, cut.id, [...(state.ink[cut.id] ?? []), marking]), cut.id);
      },
      drop() {
        host.paintInk(slot);
      },
    };
  },
});
