// What the tools that place markings whole, symbols and text, share: a press selected by the reader
// is moved or resized from the first pixel, the selected marking's second tap cycles or edits it,
// and a press on empty music shows a ghost and places. What differs is what a tool gives (`Placing`).

import type { Marking, Point } from '../../markings/model';
import { markExtent, type PlacedMark } from '../../markings/placed';
import type { Placed } from '../../scores/frames';
import { symbolSizeOf, type Cut, type State } from '../../scores/model';
import { centreOnFrame, extentOnFrame, handleRadius, MIN_BOX_PX, movedTo, pressOnSelection, resizedFrom, selectionBox, type Selected } from '../../scores/placing';
import { isTap } from '../_gestures';
import { loupeTarget, type SharpInk } from '../_loupe';
import { slotUnder, type FrameSlot } from '../_spread';
import { SelectionBox } from './_selection';
import { TOOL_LABELS, type Press, type Tool, type ToolHost, type ToolName } from './_tool';


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

/** What a tap does, from what was selected before the press and the marking it grabbed (undefined: empty music). */
export function _tapAction(selected: PlacedMark | undefined, hit: PlacedMark | undefined): 'select' | 'again' | 'place' {
  return !hit ? 'place' : hit === selected ? 'again' : 'select';
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

/** What differs between the tools that place markings whole. */
export interface Placing {
  name: ToolName;
  /** Whether a marking is its own. */
  owns(m: Marking): boolean;
  /** What a tap on empty music does, and what lifting after pressing on empty music and dragging does, on the slot the finger is over. */
  place(slot: FrameSlot, at: [number, number]): void;
  /** What the press shows under the finger meanwhile: a marking centred at `at`; undefined: nothing to place yet. */
  ghost(at: [number, number]): PlacedMark | undefined;
  /** The second tap on its selected marking. */
  again(sel: Selected): void;
  /** The state with the marking resized to `size`: what a resize sets on the score. */
  resized(s: State, size: number, from: PlacedMark): State;
  /** Whether its chrome is hidden for now (its field is open on the marking). */
  chromeHidden?(): boolean;
  label?: string;
}

/**
 * A tool for placed markings: the state machine for a press (ghost and placing on empty music;
 * moving, resizing and the second tap on the selected marking), and the box with its handles and
 * delete button. What differs is in `spec`.
 */
export function placingTool(host: ToolHost, spec: Placing): Tool {
  const { name, owns, place, ghost, label = TOOL_LABELS[name] } = spec;
  // Whether its pointer holds a marking, moving or resizing it: a second finger then doesn't pinch.
  let held = false;
  // The selection before the last change and now: a press on the marking that was already selected goes again.
  let before: Selected | undefined, now: Selected | undefined;
  // The box, handles and delete button of the selected marking when it is its own; hidden while one is moved.
  let box: SelectionBox | undefined; // made when first shown: it is DOM
  let moving = false;
  const drawChrome = () => {
    const sel = host.selected();
    const slot = sel && !moving && !spec.chromeHidden?.() && owns(sel.mark) ? host.slots().find((sl) => sl.frame.items.some((i) => i.cut.id === sel.cut)) : undefined;
    const item = slot && slot.frame.items.find((i) => i.cut.id === sel!.cut);
    const ext = item && sel ? extentOnFrame(item, sel.mark, host.aspects()[item.cut.page]) : undefined;
    if (slot && ext) (box ??= new SelectionBox(() => host.delete())).show(host.layer(slot), slot, ext, host.zoom().s);
    else box?.hide();
  };
  return {
    name,
    label,
    ownsMarking: owns,
    suppressions: () => (held ? { pinching: true } : {}),
    onSelectionChanged() {
      before = now;
      now = host.selected();
      drawChrome();
    },
    drawChrome,
    isChromeAt(slot, framePoint) {
      const sel = host.selected(), item = sel && slot.frame.items.find((i) => i.cut.id === sel.cut);
      const box = sel && item && selectionOn(item, sel, host.aspects()[item.cut.page], slot.w * host.zoom().s);
      return !!box && !!pressOnSelection(box.box, box.r, [framePoint[0], framePoint[1]]);
    },
    start({ slot, framePoint: p0, on }: Press) {
      if (!slot) return undefined;
      const t0 = performance.now();
      const px = slot.w * host.zoom().s; // CSS pixels in a frame width
      const aspects = host.aspects();
      const at0: [number, number] = [p0[0], p0[1]];
      const itemOf = (cut: string) => slot.frame.items.find((i) => i.cut.id === cut);

      // A press on a handle of the selected marking's box resizes it; on the box, moves it (and a tap acts on it); on a marking the reader selected for it, moves that.
      // What was selected before this press, read before anything else tells the tool of a change.
      const priorMark = on?.what === 'chrome' ? host.selected()?.mark : before?.mark;
      let grab: Grab | undefined;
      let hit: { cut: Cut; mark: PlacedMark } | undefined;
      const sel = host.selected(), selItem = sel && itemOf(sel.cut);
      if (on?.what === 'chrome' && sel && selItem) {
        const box = selectionOn(selItem, sel, aspects[selItem.cut.page], px);
        const pressed = box && pressOnSelection(box.box, box.r, at0);
        const centre = centreOnFrame(selItem, sel.mark, aspects[selItem.cut.page]);
        if (box && pressed?.kind === 'handle') grab = { kind: 'resize', from: sel, corner: pressed.corner, ext: box.box, centre };
        else { grab = { kind: 'move', from: sel, centre }; hit = { cut: selItem.cut, mark: sel.mark }; }
      } else if (on?.what === 'grabbed') {
        const item = itemOf(on.sel.cut);
        if (item) {
          hit = { cut: item.cut, mark: on.sel.mark as PlacedMark };
          grab = { kind: 'move', from: on.sel, centre: centreOnFrame(item, on.sel.mark as PlacedMark, aspects[item.cut.page]) };
        }
      }

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
        const marked = target ?? (hit && { page: hit.cut.page, cut: hit.cut.id, mark: hit.mark });
        switch (_tapAction(priorMark, hit?.mark)) {
          case 'select': host.select(marked!); break;
          case 'again': spec.again(marked!); break;
          case 'place': {
            // Where the ghost was when the finger lifted, so what was shown is what is placed.
            const under = slotUnder(host.slots(), slot, [last[0], last[1]]);
            if (under) place(under.slot, under.at);
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
        const mark = now && ghost(now.at);
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
        if (dragging) { moving = false; host.paintInk(slot); host.select(host.selected()); }
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
        moving = true;
        box?.hide();
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
        } else if (!on) showGhost(client);
      }

      held = !!grab;
      return {
        move(p, c) {
          last = p;
          client = c;
          if (!grab && !placing) {
            if (!moved()) return;
            placing = true;
          }
          frame ||= requestAnimationFrame(draw);
        },
        end(cancelled) {
          held = false;
          cancelFrame();
          if (cancelled) { drop(); return; }
          if (placing) {
            // Lifting over a slot places there; anywhere else places nothing.
            const under = slotUnder(host.slots(), slot, [last[0], last[1]]);
            drop();
            if (under) place(under.slot, under.at);
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
          moving = false;
          let state: State = r.state;
          if (g.kind === 'resize') {
            state = spec.resized(state, r.selected.mark.size, g.from.mark);
          }
          host.commit(state, r.selected.cut, r.selected);
          host.select(r.selected);
          if (how === 'move-then-tap') tap(r.selected);
        },
        drop() { held = false; cancelFrame(); drop(); },
      };
    },
  };
}
