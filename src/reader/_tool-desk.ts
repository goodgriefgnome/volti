// The reader's tools: the lend stack (the tool equipped by its button, with tools lent on top by
// a selection or for one press), telling tools when they are equipped and unequipped, the
// selection, each tool's chrome layers, the tools' settings, and each tool's host. What a tool
// does is in tools/.

import { loadToolSettings, saveToolSettings } from '../markings/store';
import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from '../markings/tool-settings';
import { replaceMarking } from '../scores/edits';
import { shows } from '../scores/ownership';
import { setThisTimeOnly, type Selected } from '../scores/placing';
import { el } from '../ui/dom';
import { failed, failedOnce } from '../ui/failure';
import type { InputHost } from './_input';
import { LendStack, type StackChange } from './_lending';
import type { OpenScore } from './_open-scores';
import type { FrameSlot } from './_slots';
import { makeTools } from './_tools/_tools';
import type { ButtonFace, HandHost, Tool, ToolName } from './_tools/_tool';
import type { Toolbar } from './_toolbar';

/** What the tools get from the reader that isn't the desk's to give. */
export type DeskBase = Omit<InputHost & HandHost,
  'tool' | 'selected' | 'select' | 'delete' | 'setThisTimeOnly' | 'settings' | 'setSettings'
  | 'lendForPress' | 'endPressLend' | 'unequip' | 'layer' | 'setButtonFace'>;

export interface ToolDeskHost {
  /** The toolbar, once it is made. */
  toolbar(): Toolbar | undefined;
  /** The frames on the screen. */
  slots(): FrameSlot[];
  /** The current item's score, once open. */
  current(): OpenScore | undefined;
  /** What the toolbar shows may have changed. */
  changed(): void;
  say(text: string): void;
}

export class ToolDesk {
  /** The tool equipped by its button, with the tools a selection has lent on top of it. */
  private stack = new LendStack<ToolName>('hand');
  /** The tools' being told of the stack's changes, in order. */
  private told: Promise<void> = Promise.resolve();
  /** What each tool's button shows, as the tool last set it. */
  private faces = new Map<ToolName, ButtonFace>();
  /** Each tool's settings for new markings; kept across restarts. */
  private current: ToolSettings = DEFAULT_TOOL_SETTINGS;
  /** The placed marking showing its box, while a symbol is the tool. */
  private selection: Selected | undefined;

  /** The tools, made for this reader. */
  readonly tools: Record<ToolName, Tool>;
  /** The hand tool's host, which pointer input is given too. */
  readonly handHost: InputHost & HandHost;

  constructor(private base: DeskBase, private host: ToolDeskHost) {
    const own = {
      tool: () => this.active,
      selected: () => this.selection,
      select: (s: Selected | undefined) => this.select(s),
      delete: () => this.deleteSelected(),
      setThisTimeOnly: (on: boolean) => this.setThisTimeOnly(on),
      settings: () => this.current,
      setSettings: (change: (s: ToolSettings) => ToolSettings) => this.setSettings(change),
      lendForPress: (tool: ToolName) => { this.tell(this.stack.lend(tool, 'press')); this.refreshSelection(); },
      endPressLend: () => { this.tell(this.stack.end('press')); this.refreshSelection(); },
      unequip: () => { this.useTool('hand'); host.changed(); },
    };
    // Each tool gets a host whose chrome layers and button face are its own.
    const hostFor = (tool: ToolName): InputHost & HandHost => ({
      ...base,
      ...own,
      layer: (slot) => this.layerFor(tool, slot),
      setButtonFace: (face) => this.setFace(tool, face),
    });
    this.handHost = hostFor('hand');
    this.tools = makeTools(hostFor, this.handHost);
    void loadToolSettings().then((s) => { this.current = s; host.changed(); }, (e) => failedOnce("load the tools' settings", e));
  }

  /** The active tool: the one on top of the stack. */
  get active(): ToolName { return this.stack.active; }

  get selected(): Selected | undefined { return this.selection; }

  get settings(): ToolSettings { return this.current; }

  /** Tapping the active tool again puts it away. */
  setTool(t: ToolName) {
    this.useTool(this.active === t ? 'hand' : t);
    this.host.changed();
  }

  /** Change the tool; the selection ends with it, between Text and a symbol too, and nothing is given back. */
  useTool(t: ToolName) {
    if (t !== this.active) {
      this.tell(this.stack.equip(t));
      this.deselect();
    }
  }

  /** Tell the tools what the change to the stack did: each is told in turn, waiting for the one before, and then the new tool draws its chrome. */
  private tell(change: StackChange<ToolName>) {
    if (!change.unequipped.length && !change.equipped.length) return;
    this.told = this.told.then(async () => {
      for (const t of change.unequipped) await this.tools[t].onUnequipped?.();
      for (const t of change.equipped) { await this.tools[t].onEquipped?.(); this.tools[t].drawChrome?.(); }
    }).catch((e) => failedOnce('switch tools', e));
  }

  /** End the selection and hide its box; the tool its marking lent, if any, goes back to what it was. The caller shows the toolbar. */
  deselect() {
    this.tell(this.stack.end('selection'));
    this.selection = undefined;
    this.selectionChanged();
  }

  /** Every tool is told the selection changed, to draw its chrome again. */
  private selectionChanged() {
    this.showLayers();
    for (const t of Object.values(this.tools ?? {})) t.onSelectionChanged?.();
  }

  /** Selecting a marking lends the tool for its kind, keeping the selection; ending the selection takes the lend off. */
  private lend(kind: ToolName) {
    if (this.active === kind) return;
    this.tell(this.stack.lend(kind, 'selection'));
  }

  /** A long press on a tool's button makes it the tool, if it isn't; when it is, the press leaves it be. */
  private useOnLongPress(tool: ToolName) {
    if (this.active === tool) return;
    this.useTool(tool);
    this.host.changed();
  }

  /** A long press on a tool's button: it becomes the tool, and its panel shows under the button. */
  panel(tool: Exclude<ToolName, 'hand'>) {
    this.useOnLongPress(tool);
    this.tools[tool].showPanel?.(this.host.toolbar()!.anchor(tool));
  }

  /** A tool's button shows `face` from now on. */
  private setFace(tool: ToolName, face: ButtonFace) {
    this.faces.set(tool, face);
    this.host.toolbar()?.setFace(tool, face);
  }

  /** Show on the toolbar the faces the tools set before it was made. */
  showFaces(toolbar: Toolbar) {
    for (const [tool, face] of this.faces) toolbar.setFace(tool, face);
  }

  /** The tool's chrome layer in a frame, made the first time it is asked for and shown while the tool is active. */
  private layerFor(tool: ToolName, slot: FrameSlot): HTMLElement {
    slot.layers ??= {};
    let layer = slot.layers[tool];
    if (!layer) {
      layer = el('div', 'tool-layer');
      layer.hidden = tool !== this.active;
      slot.box.append(layer);
      slot.layers[tool] = layer;
    }
    return layer;
  }

  /** Only the chrome of the active tool shows. */
  showLayers() {
    for (const slot of this.host.slots()) for (const [tool, layer] of Object.entries(slot.layers ?? {})) layer.hidden = tool !== this.active;
  }

  /** Every tool draws its chrome again: the layout or the zoom changed. */
  drawChromes() {
    for (const t of Object.values(this.tools ?? {})) t.drawChrome?.();
  }

  /** The toolbar is being synced: the tools set their faces again, and only the active tool's layers show. */
  sync() {
    for (const t of Object.values(this.tools ?? {})) t.onSettingsChanged?.();
    this.showLayers();
  }

  /** Change the tools' settings, save them, and show them. */
  private setSettings(change: (s: ToolSettings) => ToolSettings): void {
    this.current = change(this.current);
    saveToolSettings(this.current).catch((e) => this.host.say(failed("save the tools' settings", e)));
    this.host.changed();
  }

  select(s: Selected | undefined) {
    if (s) {
      this.selection = s;
      const owner = Object.values(this.tools).find((t) => t.ownsMarking?.(s.marking));
      if (owner) this.lend(owner.name);
    } else this.deselect();
    this.refreshSelection();
  }

  /** An edit replaced the selected marking with `s`: it stays selected, lending nothing new. */
  keepSelected(s: Selected) {
    this.selection = s;
  }

  /** The selected marking's delete button: take it away, as one undo step. */
  deleteSelected() {
    const sel = this.selection;
    if (sel) this.base.commit(replaceMarking(this.base.state(), sel.page, sel.marking), sel.cut);
  }

  /** The selected marking's "This time only": its cut's pass (on) or none (off), as one undo step; it stays selected. */
  setThisTimeOnly(on: boolean) {
    const sel = this.selection;
    if (!sel) return;
    const { state, selected } = setThisTimeOnly(this.base.state(), sel, on);
    this.base.commit(state, sel.cut, selected);
  }

  /**
   * Tell the tools what is selected: a selection ends when its marking is gone from its page's ink,
   * or the cut it was selected in is no longer played or no longer shows it.
   */
  refreshSelection() {
    const sel = this.selection, cur = this.host.current();
    const cut = sel && cur?.state.score.cuts.find((c) => c.id === sel.cut);
    if (sel && (!cur || !cut || !cur.state.ink[sel.page]?.includes(sel.marking) || !shows(cut, sel.marking))) this.deselect();
    this.selectionChanged();
    if (cur) this.host.changed();
  }

  /** Every tool on the stack is unequipped (Text finishes typing); resolves once they all have been told. */
  async finish(): Promise<void> {
    this.tell(this.stack.equip('hand'));
    await this.told;
  }
}
