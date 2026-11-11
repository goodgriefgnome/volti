// The hand tool: the tool when no other is equipped by its button, with no button of its own. A
// press with it pans the music; a tap hides or shows the toolbar; a long press opens the cut menu,
// while Cuts is on.

import { drag } from '../../render/zoom';
import { LONG_PRESS_MS } from '../../ui/long-press';
import { isTap } from '../_gestures';
import { TOOL_LABELS, type HandHost, type Tool } from './_tool';

/** How far a press may move and still be a long press, in CSS pixels. */
const PRESS_SLOP_PX = 6;

export const handTool = (host: HandHost): Tool => ({
  name: 'hand',
  label: TOOL_LABELS.hand,
  start({ screenPoint: p0 }) {
    const start = host.zoom(), t0 = performance.now();
    let last = p0, dead = false;
    // The cut menu, if the press stays where it is long enough; the pan is over then.
    let timer = host.cutsOn() ? setTimeout(() => { dead = true; host.cutMenu(p0); }, LONG_PRESS_MS) : undefined;
    const stopTimer = () => { clearTimeout(timer); timer = undefined; };
    return {
      move(_, screenPoint) {
        if (dead) return;
        last = screenPoint;
        if (Math.hypot(last.x - p0.x, last.y - p0.y) > PRESS_SLOP_PX) stopTimer();
        host.setZoom(drag(start, last.x - p0.x, last.y - p0.y, host.view()));
      },
      end(cancelled) {
        stopTimer();
        if (!dead && !cancelled && isTap({ x0: p0.x, y0: p0.y, x1: last.x, y1: last.y, ms: performance.now() - t0 })) host.toggleToolbar();
      },
      drop() {
        stopTimer();
        dead = true;
      },
    };
  },
});
