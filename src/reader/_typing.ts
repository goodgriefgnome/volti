// The field text is typed in on the music: in the marking's font, size and colour, where the
// marking will be, over the frame so it zooms with it; and the on-screen keyboard kept from
// covering it.

import { cssFamily, fontMetrics } from '../fonts/fonts';
import { el } from '../ui/dom';
import type { FrameSlot } from './_spread';

export interface TypingRequest {
  slot: FrameSlot;
  font: string;
  /** Em size, in page widths. */
  size: number;
  color: string;
  /** The start of the baseline, in frame coordinates. */
  start: [number, number];
  /** What the field starts with: '' for new text. */
  text: string;
  /** Enter, or a tap elsewhere: what is in the field. */
  done(text: string): void;
  /** Escape. */
  cancel(): void;
}

/** How far above the keyboard the field is kept, in CSS pixels. */
const KEYBOARD_GAP_PX = 8;

/** The part of `navigator.virtualKeyboard` used here, which TypeScript's DOM types haven't got. */
interface VirtualKeyboard extends EventTarget { overlaysContent: boolean; readonly boundingRect: DOMRect }
const keyboard = () => (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;

export class TypingField {
  private field: HTMLInputElement | undefined;
  private request: TypingRequest | undefined;
  /** Changes when a field opens or closes, so a `show` still waiting for its font knows it was overtaken. */
  private token = 0;
  /** How far the stage is moved up, in CSS pixels. */
  private shift = 0;

  /** `stage` is moved up while the field would be under the keyboard. */
  constructor(private stage: HTMLElement) {}

  get open() { return !!this.field; }

  /** Open the field (closing one already open as `finish` does), focused, its caret at the end. */
  async show(r: TypingRequest): Promise<void> {
    this.finish();
    const token = ++this.token;
    const [family, m] = await Promise.all([cssFamily(r.font), fontMetrics(r.font)]);
    if (token !== this.token) return;

    const { slot } = r;
    const field = el('input', 'typing');
    field.type = 'text';
    field.enterKeyHint = 'done';
    field.autocapitalize = 'off';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = r.text;
    const px = r.size * slot.w;
    Object.assign(field.style, {
      left: r.start[0] * 100 + '%',
      top: ((r.start[1] - m.ascent * r.size) / slot.frame.aspect) * 100 + '%',
      fontFamily: `"${family}"`,
      fontSize: px + 'px',
      color: r.color,
    });
    field.style.setProperty('field-sizing', 'content');
    field.style.minWidth = '1em';

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.finish(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // the reader would leave otherwise
        this.close()?.cancel();
      }
    });
    field.addEventListener('blur', () => this.finish());

    this.field = field;
    this.request = r;
    slot.box.append(field);
    const vk = keyboard();
    if (vk) {
      vk.overlaysContent = true;
      vk.addEventListener('geometrychange', this.lift);
    }
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
    this.lift();
  }

  /** Close it, calling `done` with what was typed; nothing when it isn't open. */
  finish(): void {
    const text = this.field?.value ?? '';
    this.close()?.done(text);
  }

  /** Take the field away and put the page back, giving the request it was for; each request is given once. */
  private close(): TypingRequest | undefined {
    const { field, request } = this;
    this.token++;
    if (!field || !request) return undefined;
    this.field = this.request = undefined;
    field.remove();
    const vk = keyboard();
    if (vk) {
      vk.removeEventListener('geometrychange', this.lift);
      vk.overlaysContent = false;
    }
    this.move(0);
    return request;
  }

  /** Move the stage up when the keyboard would cover the field, or put it back. */
  private lift = () => {
    const vk = keyboard();
    if (!this.field || !vk) return;
    const top = vk.boundingRect.height ? vk.boundingRect.top : Infinity;
    // Where the field's bottom is with the stage in place.
    const bottom = this.field.getBoundingClientRect().bottom + this.shift;
    this.move(Math.max(0, Math.ceil(bottom - (top - KEYBOARD_GAP_PX))));
  };

  private move(shift: number) {
    this.shift = shift;
    this.stage.style.translate = shift ? `0 -${shift}px` : '';
  }
}
