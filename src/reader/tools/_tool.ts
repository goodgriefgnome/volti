// What every tool is: the Tool interface, and what a tool may ask of the reader. A tool acts on the
// frames with a pointer; each tool has its own file here, and _tools.ts makes them.

import type { SymbolLibrary, LibrarySymbol } from '../../markings/library';
import type { Marking, Point } from '../../markings/model';
import type { Zoom, View } from '../../render/zoom';
import type { PlacedMark } from '../../markings/placed';
import type { State } from '../../scores/model';
import type { Selected } from '../../scores/placing';
import type { Loupe } from '../_loupe';
import type { FrameSlot } from '../_spread';
import type { ReaderView } from '../_view';

/** What a tool needs from the reader. */
export interface ToolHost extends ReaderView {
  penColor(): string;
  highlightColor(): string;
  /** The colour new symbols get; undefined: the app's marking colour. */
  symbolColor(): string | undefined;
  /** The symbol the symbol tool places: the current one of its group. */
  placing(): LibrarySymbol | undefined;
  library(): SymbolLibrary | undefined;
  /** The placed marking showing its box, if any. */
  selected(): Selected | undefined;
  select(s: Selected | undefined): void;
  /** A selected symbol was changed to the next of its group: with Symbols as the tool, that symbol is the tool's now. */
  cycled(sym: LibrarySymbol): void;
  /** The loupe shown while a marking is dragged. */
  loupe(): Loupe;
  /** Draw a frame's ink again; `extra` is a marking still being made. */
  paintInk(slot: FrameSlot, extra?: Marking): void;
  /** Draw a frame's ink as it would be in `s`, without taking the edit: a marking being dragged. The selection's box is hidden until the next `select`. */
  paintState(slot: FrameSlot, s: State): void;
  /** The word "Ag" as new text would be placed, centred as typing starts at `at`, in a tint that reads as a marker; undefined until it is shaped. */
  textGhost(at: [number, number]): PlacedMark | undefined;
  /** Start typing a new text marking with the middle of its capitals at `at` on the slot's frame. */
  newText(slot: FrameSlot, at: [number, number]): void;
  /** Edit the selected text marking. */
  editText(sel: Selected): void;
  /**
   * Take an edit: undo, save, reflow, and show the frame holding `focus`. `selected` is the
   * selected marking as it is in `s`, when the edit replaced it, so the selection doesn't end.
   */
  commit(s: State, focus?: string, selected?: Selected): void;
  /** Show a state now, without an undo step: the eraser's sweep so far. */
  show(s: State, slot: FrameSlot): void;
  /** One undo step back to `before`, for what was shown since: the eraser lifted. */
  undoTo(before: State, slot: FrameSlot): void;
  /** Its button shows `face` from now on: set when the tool is made, and whenever its look changes. */
  setButtonFace(face: ButtonFace): void;
  /** The typing field is open (until Text owns it). */
  typing(): boolean;
  /** Close the typing field, placing what is in it (until Text owns it). */
  finishTyping(): void;
  /** Unequip it: the hand tool is equipped. */
  unequip(): void;
  /** Its chrome layer in a frame. Elements in it with `data-own-presses` get their presses untouched. */
  layer(slot: FrameSlot): HTMLElement;
  /** Move the music up by `px` CSS pixels, to clear the on-screen keyboard; 0 puts it back. */
  lift(px: number): void;
}

/** What the hand tool may ask of the reader besides. */
export interface HandHost extends ToolHost {
  setZoom(z: Zoom): void;
  view(): View;
  minScale(): number;
  toggleToolbar(): void;
  /** Cuts is on: a long press on the music opens the cut menu. */
  cutsOn(): boolean;
  /** The cut menu at a point on the screen. */
  cutMenu(screenPoint: { x: number; y: number }): void;
}

/** The tools, by the name the toolbar selects them by; the hand tool has no button. */
export type ToolName = 'hand' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'symbol';

/** Each tool's name on its button. */
export const TOOL_LABELS: Record<ToolName, string> = { hand: 'Hand', pen: 'Pen', highlighter: 'Highlight', eraser: 'Erase', text: 'Text', symbol: 'Symbols' };

/** What a tool's toolbar button shows: `key` changes when the picture does, so the toolbar draws it again only then. */
export interface ButtonFace { key: string; draw(): Node }

/** The reader's intrinsic behaviours a tool can suppress. */
export interface Suppressions {
  /** Every step before the tool's: each press is the tool's (Text while typing). */
  allPresses?: true;
  /** A second finger starting a pinch (a marking held). */
  pinching?: true;
  /** The selecting step (Pen, Highlight, Erase). */
  selecting?: true;
}

/** A press, as the reader hands it to a tool after the steps before it. */
export interface Press {
  /** The frame it is on; undefined off the frames, which only the hand tool gets. */
  slot?: FrameSlot;
  /** Where it is on the frame: x as a fraction of its width, y in frame widths from its top; then pressure. */
  framePoint: Point;
  /** Where it is on the screen, in CSS pixels: for the loupe, panning and menus. */
  screenPoint: { x: number; y: number };
  /** What the selecting step found: the tool's chrome, or a marking it selected for this tool. */
  on?: { what: 'chrome' } | { what: 'grabbed'; sel: Selected };
}

/**
 * One pointer using a tool on a frame, from going down to lifting. Points are on the frame: x as
 * a fraction of its width, y in frame widths from its top.
 */
export interface ToolPointer {
  move(framePoint: Point, screenPoint: { x: number; y: number }): void;
  /** After the points of one pointer event have all been moved through. */
  moved?(): void;
  /** The pointer lifted, or the system cancelled it (`cancelled`: it decided this was a palm). */
  end(cancelled: boolean): void;
  /** Forget it: a palm, or a finger that turned out to start a pinch. */
  drop(): void;
}

export interface Tool {
  readonly name: ToolName;
  /** Its button's name. */
  readonly label: string;
  /** Whether `m` is its own: selecting `m` lends it, and its button face and panel show `m`. At most one tool owns a marking. */
  ownsMarking?(m: Marking): boolean;
  /** What it suppresses now; the reader asks once for each pointer going down. */
  suppressions?(): Suppressions;

  /** Show its long-press panel under `anchor`: for the selected marking when it owns it. */
  showPanel?(anchor: HTMLElement): void;

  /** It went on the lend stack: equipped by its button, or lent. */
  onEquipped?(): void | Promise<void>;
  /** It left the lend stack. */
  onUnequipped?(): void | Promise<void>;
  /** The selection changed (`host.selected()`): draw its chrome again, and set its button face again when it shows the selection. Every tool is told. */
  onSelectionChanged?(): void;

  /**
   * Draw all its chrome over the frames, in its layers, from its own state, the selection and the
   * zoom (`host.selected()`, `host.zoom()`): the only place it draws chrome. The reader calls it
   * after `onEquipped`, and when the layout (the layers are then new) or the zoom changes; the tool
   * calls it itself when its own state or the selection changes. The toolbar is not chrome.
   */
  drawChrome?(): void;
  /** Whether a press at `framePoint` on `slot` is on its chrome (box, handles). */
  isChromeAt?(slot: FrameSlot, framePoint: Point): boolean;
  /** A press, after the reader's steps; undefined: declined, the hand tool gets it. */
  start(press: Press): ToolPointer | undefined;
}
