// The library editor: groups and their symbols, and a symbol's font, characters, scale and background. One
// dialog whose content changes between views.

import { BRAVURA, fontChoices, shapeWith, type FontChoice } from '../fonts/fonts';
import { addGlyph, glyphKey } from '../markings/glyphs';
import {
  addGroup, findSymbol, moveGroup, putSymbol, removeGroup, removeSymbol, replaceSymbol, symbolFrom, symbolsOf,
  type LibrarySymbol, type SymbolLibrary,
} from '../markings/library';
import { markColors, type Background } from '../markings/placed';
import { button, el, plural } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, showOnTop } from '../ui/overlay';
import { glyphPicker } from './_glyph-picker';
import { BACKGROUNDS, backgroundPicture } from './_symbol-row';
import { hasInk, symbolPicture } from './_symbol-picture';
import { makeSymbol } from './_symbols';

export interface LibraryEditorHost {
  library(): SymbolLibrary;
  /** Save a changed library (Reader.setLibrary). */
  change(lib: SymbolLibrary): void;
}

/** The scale a symbol can have. */
const MIN_SCALE = 0.25, MAX_SCALE = 4, SCALE_STEP = 0.05;
/** The size of the symbol view's preview, and the em of scale 1 in it, in CSS pixels. */
const PREVIEW_PX = 128, PREVIEW_EM = 30;
/** How long after a change the characters are shaped for the preview. */
const PREVIEW_MS = 150;
/** Bravura's fingering 1, drawn beside a symbol to show its size against a known one. */
const REFERENCE = '';

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampScale = (n: number) => round2(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)));

/** A symbol being edited: what the fields hold. */
interface Draft { font: string; text: string; scale: number; group: number; background?: Background }

/** The symbol with this background, or none, without a `background` key when none. */
function withBackground(sym: LibrarySymbol, background: Background | undefined): LibrarySymbol {
  const { background: _, ...rest } = sym;
  return background ? { ...rest, background: { ...background } } : rest;
}

/** Open the editor on its groups view. */
export function editLibrary(host: LibraryEditorHost): void {
  const dialog = showDialog('Symbol library', 'library-editor');
  const body = el('div', 'editor-body');
  dialog.append(body);
  let choices: FontChoice[] = [];
  const choicesLoaded = fontChoices().then((c) => { choices = c; }, console.error);
  const color = () => getComputedStyle(dialog).color;

  function groupsView() {
    const lib = host.library();
    const rows = lib.groups.map((g, i) => {
      const row = el('div', 'group-row');
      row.append(el('div', 'group-name', `Group ${i + 1}`));
      const symbols = el('div', 'group-symbols');
      g.symbols.forEach((s, j) => {
        const b = el('button', 'symbol-choice');
        b.type = 'button';
        b.setAttribute('aria-label', `Edit symbol ${j + 1} of group ${i + 1}`);
        b.append(symbolPicture(s, color()));
        b.addEventListener('click', () => void symbolView({ group: i, was: s }));
        symbols.append(b);
      });
      const add = button('+', () => void symbolView({ group: i }));
      add.setAttribute('aria-label', `Add a symbol to group ${i + 1}`);
      symbols.append(add);
      // The group's actions open in the row: a menu would close the dialog.
      const actions = el('div', 'group-actions');
      actions.hidden = true;
      const up = button('Move up', () => { host.change(moveGroup(host.library(), i, i - 1)); groupsView(); });
      const down = button('Move down', () => { host.change(moveGroup(host.library(), i, i + 1)); groupsView(); });
      up.disabled = i === 0;
      down.disabled = i === lib.groups.length - 1;
      actions.append(up, down, button('Delete group', () => deleteGroup(i)));
      const more = button('⋯', () => { actions.hidden = !actions.hidden; });
      more.setAttribute('aria-label', `Group ${i + 1} actions`);
      row.append(symbols, more, actions);
      return row;
    });
    const list = el('div', 'group-list');
    list.append(...rows);
    if (!rows.length) list.append(el('p', 'hint', 'No groups yet.'));
    const add = button('Add group', () => {
      host.change(addGroup(host.library()));
      groupsView();
      body.querySelector('.group-list')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    });
    body.replaceChildren(list, buttonRow(add, button('Done', () => closeOverlay(), 'primary')));
  }

  function deleteGroup(i: number) {
    const n = symbolsOf(host.library(), i).length;
    const remove = () => { host.change(removeGroup(host.library(), i)); groupsView(); };
    if (!n) { remove(); return; }
    const { dialog: ask, close } = showOnTop('Delete group');
    ask.append(
      el('p', '', `Delete this group and its ${plural(n, 'symbol')}? Placed symbols stay as they are.`),
      buttonRow(button('Cancel', close), button('Delete', () => { close(); remove(); }, 'primary')),
    );
  }

  /**
   * The symbol view: an existing symbol (`was`, in `group`), or a new one for the end of `group`.
   * `resume` is a draft to go on with, such as after the glyph picker.
   */
  async function symbolView(start: { group: number; was?: LibrarySymbol }, resume?: Draft) {
    await choicesLoaded;
    const was = start.was;
    const draft: Draft = resume ?? { font: was?.font ?? BRAVURA, text: was?.text ?? '', scale: was?.scale ?? 1, group: start.group, background: was?.background };
    const fontGone = !!was && !choices.some((c) => c.id === was.font);
    const lib = () => host.library();

    const font = el('select');
    font.setAttribute('aria-label', 'Font');
    const gone = el('option', '', 'Font no longer bundled');
    gone.value = was?.font ?? '';
    font.append(...(fontGone ? [gone] : []), ...choices.map((c) => { const o = el('option', '', c.name); o.value = c.id; return o; }));
    font.value = draft.font;
    const chars = el('input', 'name');
    chars.type = 'text';
    chars.value = draft.text;
    chars.setAttribute('aria-label', 'Characters');
    const pick = button('Pick glyphs…', () => {
      const picker = el('div');
      body.replaceChildren(picker);
      glyphPicker(picker, {
        font: draft.font, text: draft.text, okLabel: 'Use',
        done: (f, t) => { draft.font = f; draft.text = t; void symbolView({ ...start, was }, draft); },
        cancel: () => void symbolView({ ...start, was }, draft),
      });
    });
    const scale = el('input', 'name scale');
    scale.type = 'number';
    scale.min = String(MIN_SCALE); scale.max = String(MAX_SCALE); scale.step = String(SCALE_STEP);
    scale.value = String(draft.scale);
    scale.setAttribute('aria-label', 'Scale');
    const setScale = (v: number) => { draft.scale = clampScale(v); scale.value = String(draft.scale); void refresh(); };
    scale.addEventListener('input', () => {
      const v = parseFloat(scale.value);
      if (v >= MIN_SCALE && v <= MAX_SCALE) { draft.scale = v; void refresh(); }
    });
    scale.addEventListener('change', () => setScale(parseFloat(scale.value) || draft.scale));
    const shapes = el('div', 'symbol-backgrounds');
    shapes.setAttribute('role', 'group');
    shapes.setAttribute('aria-label', 'Background');
    const own = el('input');
    own.type = 'checkbox';
    own.setAttribute('aria-label', 'Default background colour');
    const tint = el('input');
    tint.type = 'color';
    tint.setAttribute('aria-label', 'Background colour');
    const colorRow = el('label', 'field');
    colorRow.append(el('span', 'field-label', 'Background colour'), own, el('span', '', 'Default'), tint);
    /** The background buttons and colour fields as the draft has them. */
    const showBackground = () => {
      const shape = draft.background?.shape ?? 'none';
      shapes.replaceChildren(...BACKGROUNDS.map(([choice, label]) => {
        const b = button('', () => setShape(choice));
        b.classList.add('symbol-background');
        b.setAttribute('aria-label', label);
        b.title = label;
        b.setAttribute('aria-pressed', String(shape === choice));
        b.append(backgroundPicture(choice));
        return b;
      }));
      colorRow.hidden = !draft.background;
      own.checked = !draft.background?.color;
      tint.disabled = own.checked;
      tint.value = draft.background?.color ?? markColors().background;
    };
    const setShape = (choice: (typeof BACKGROUNDS)[number][0]) => {
      draft.background = choice === 'none' ? undefined : { shape: choice, ...(draft.background?.color ? { color: draft.background.color } : {}) };
      showBackground();
      void refresh();
    };
    const setTint = () => {
      if (!draft.background) return;
      draft.background = { shape: draft.background.shape, ...(own.checked ? {} : { color: tint.value }) };
      showBackground();
      void refresh();
    };
    own.addEventListener('change', setTint);
    tint.addEventListener('input', setTint);
    showBackground();
    const group = el('select');
    group.setAttribute('aria-label', 'Group');
    group.append(...lib().groups.map((_, i) => { const o = el('option', '', `Group ${i + 1}`); o.value = String(i); return o; }));
    group.value = String(draft.group);
    group.addEventListener('change', () => { draft.group = Number(group.value); update(); });
    const at = () => (was ? findSymbol(lib(), was.font, was.text) : undefined);
    const shift = (by: number) => {
      const here = at();
      if (!was || !here || here.group < 0) return;
      host.change(putSymbol(lib(), was, here.group, here.index + by));
      update();
    };
    const left = button('Move left', () => shift(-1));
    const right = button('Move right', () => shift(1));
    const mine = el('div', 'preview-slot'), ref = el('div', 'preview-slot');
    const hint = el('p', 'hint');
    const del = button('Delete', () => { if (was) { host.change(removeSymbol(lib(), was.font, was.text)); groupsView(); } });
    const ok = button('OK', () => void save(), 'primary');

    /** The symbol as drafted, shaped when its font or characters aren't the old symbol's. */
    let sym: LibrarySymbol | undefined;
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changedText = () => !was || was.font !== draft.font || was.text !== draft.text;

    async function refresh(wait = 0) {
      const mineSeq = ++seq;
      clearTimeout(timer);
      if (wait) await new Promise<void>((r) => { timer = setTimeout(r, wait); });
      if (mineSeq !== seq) return;
      let next: LibrarySymbol | undefined;
      if (!changedText() && was) next = withBackground({ ...was, scale: draft.scale }, draft.background);
      else if (draft.text) {
        try {
          const shaped = await shapeWith(draft.font, draft.text);
          for (const [gid, d] of shaped.paths) addGlyph(glyphKey(draft.font, gid), d);
          next = withBackground(symbolFrom(draft.font, draft.text, draft.scale, shaped.glyphs), draft.background);
        } catch (e) { console.error(e); }
      }
      if (mineSeq !== seq) return;
      sym = next;
      update();
    }

    /** Draw the preview and say what OK would do. */
    function update() {
      const inked = !!sym && hasInk(sym);
      mine.replaceChildren(...(sym && inked ? [symbolPicture(sym, color(), PREVIEW_PX, PREVIEW_EM, sym.background)] : []));
      // What is in the way: no ink, or the same characters in the library already.
      const other = changedText() && draft.text ? findSymbol(lib(), draft.font, draft.text) : undefined;
      let why = '';
      let label = 'OK';
      let blocked = false;
      if (!inked) { blocked = true; why = draft.text ? 'These characters have no ink in this font.' : 'Add some characters.'; }
      else if (other && other.group >= 0) { blocked = true; why = `Already in group ${other.group + 1}.`; }
      else if (other) { why = 'Already in the ad-hoc symbols: OK moves it here.'; label = 'Move here'; }
      hint.textContent = why;
      ok.textContent = label;
      ok.disabled = blocked;
      const here = at();
      const inPlace = !!here && here.group === draft.group;
      left.disabled = !inPlace || here!.index === 0;
      right.disabled = !inPlace || here!.index >= symbolsOf(lib(), here!.group).length - 1;
      left.hidden = right.hidden = !was;
      const locked = fontGone && draft.font === was?.font;
      chars.disabled = locked;
      pick.disabled = locked;
    }

    async function save() {
      ok.disabled = true;
      try {
        const made = withBackground(
          changedText() ? await makeSymbol(draft.font, draft.text, draft.scale) : { ...was!, scale: draft.scale }, draft.background,
        );
        let next = was ? replaceSymbol(lib(), was, made) : putSymbol(lib(), made, draft.group);
        const now = findSymbol(next, made.font, made.text);
        if (now && now.group !== draft.group) next = putSymbol(next, made, draft.group);
        host.change(next);
        groupsView();
      } catch (e) { console.error(e); hint.textContent = 'Could not make the symbol.'; ok.disabled = false; }
    }

    font.addEventListener('change', () => { draft.font = font.value; void refresh(); });
    chars.addEventListener('input', () => { draft.text = chars.value; void refresh(PREVIEW_MS); });

    const field = (label: string, ...inputs: HTMLElement[]) => {
      const row = el('label', 'field');
      row.append(el('span', 'field-label', label), ...inputs);
      return row;
    };
    const scaleRow = el('div', 'scale-row');
    scaleRow.append(button('−', () => setScale(draft.scale - SCALE_STEP)), scale, button('+', () => setScale(draft.scale + SCALE_STEP)));
    const previews = el('div', 'preview');
    previews.append(mine, ref);
    body.replaceChildren(
      field('Font', font),
      field('Characters', chars), pick,
      field('Scale', scaleRow),
      field('Background', shapes), colorRow,
      field('Group', group), el('div', 'move-row'),
      previews, hint,
      buttonRow(...[was ? del : null, button('Cancel', () => groupsView()), ok]),
    );
    body.querySelector('.move-row')!.append(left, right);
    void refresh();
    // The known size beside it: Bravura's fingering 1 at scale 1.
    void shapeWith(BRAVURA, REFERENCE).then((shaped) => {
      for (const [gid, d] of shaped.paths) addGlyph(glyphKey(BRAVURA, gid), d);
      ref.replaceChildren(symbolPicture(symbolFrom(BRAVURA, REFERENCE, 1, shaped.glyphs), color(), PREVIEW_PX, PREVIEW_EM));
    }, console.error);
  }

  groupsView();
}
