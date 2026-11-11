// The pen and highlighter: making a stroke as the pointer moves, and giving it to a cut when the
// pointer lifts.

import { compact, drawPenSegment, HIGHLIGHT_SIZE, PEN_SIZE, type Stroke } from '../../markings/stroke';
import { type Point } from '../../markings/model';
import { markingColors } from '../../markings/placed';
import { strokeColor } from '../../markings/tool-settings';
import { frameTarget } from '../../render/draw';
import { claimMarking } from '../../scores/ownership';
import { setInk } from '../../scores/edits';
import type { FrameSlot } from '../_slots';
import { showStrokeColors } from './_tool-panels';
import { inkFace } from './_faces';
import { TOOL_LABELS, type Tool, type ToolHost } from './_tool';

/** Draw a stroke as it is written: the pen a segment at a time, the highlighter all again. */
function drawLive(host: ToolHost, slot: FrameSlot, s: Stroke, a: Point, b: Point) {
  if (s.tool !== 'pen') { host.drawInk(slot, s); return; }
  drawPenSegment(frameTarget(slot.ink.getContext('2d')!, slot.ink.width), s, a, b);
  const d = slot.closeUp;
  if (d) drawPenSegment(frameTarget(d.ink.getContext('2d')!, d.W, d.x, d.y), s, a, b);
}

/** Each tool's icon on its button. */
const PEN_ICONS = { pen: 'M4 20l4-1 11-11-3-3L5 16z', highlighter: 'M5 20h7M7 16l9-9 3 3-9 9H7z' };

/** The pen, in the picked colour, or the highlighter. A finished stroke goes on the page of the cut where it starts. */
export const penTool = (host: ToolHost, kind: 'pen' | 'highlighter'): Tool => {
  /** The colour it draws in. */
  const color = () => strokeColor(kind, host.settings()[kind].color, markingColors());
  const setFace = () => host.setButtonFace(inkFace(PEN_ICONS[kind], color()));
  setFace();
  return {
    name: kind,
    label: TOOL_LABELS[kind],
    suppressions: () => ({ selecting: true }),
    onSettingsChanged: setFace,
    showPanel(anchor) {
      const tool = kind;
      showStrokeColors(anchor, tool, host.settings()[tool].color, (c) => host.setSettings((s) => ({ ...s, [tool]: { color: c } })));
    },
    start(press) {
      const { slot, framePoint: p } = press;
      if (!slot) return undefined;
      const hl = kind === 'highlighter';
      const stroke: Stroke = {
        tool: hl ? 'highlighter' : 'pen',
        color: color(),
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
          if (stroke.tool === 'highlighter') host.drawInk(slot, stroke);
        },
        end(cancelled) {
          if (cancelled) { host.drawInk(slot); return; } // the system decided it was a palm
          const claimed = claimMarking(slot.frame, { ...stroke, points: compact(stroke.points) }, host.aspects());
          if (!claimed) { host.drawInk(slot); return; }
          const { cut, marking } = claimed, state = host.state();
          host.commit(setInk(state, cut.page, [...(state.ink[cut.page] ?? []), marking]), cut.id);
        },
        drop() {
          host.drawInk(slot);
        },
      };
    },
  };
};
