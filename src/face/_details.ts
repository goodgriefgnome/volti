// A gesture's details view in the Face gestures dialog: what is wrong with it, its On level on a
// meter, its channels (each with its switch, threshold and limit), and adding a channel. The dialog
// gives it a host for what changes the gesture, and puts what it makes in place of the list.

import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showOnTop } from '../ui/overlay';
import { channelRow, type ChannelRow } from './_channel-row';
import { blameLine } from './_dialog-helpers';
import { flagText } from './_fit';
import { strengthMeter } from './_meter';
import { framesOf, type Trial } from './_recording';
import type { FrameListener } from './_round';
import { candidates, CHANNELS, fit, partnerOf, strength, withThreshold, type Template } from './_template';
import { levelsOf, withChannels, withLevels, withoutOn, type Gesture, type TurnDir } from './gestures';

const DIRECTIONS: [value: string, label: string][] = [['next', 'Next'], ['prev', 'Back'], ['none', 'None']];

/** What the details can ask of the dialog. */
export interface DetailsHost {
  /** Takes each frame; the details add theirs and take it away on `dispose`. */
  frames: Set<FrameListener>;
  /** The one hold, for levels. */
  hold(): number;
  /** A gesture's name with its pencil. */
  nameCell(g: Gesture): HTMLElement;
  setDirection(id: string, direction: TurnDir | 'none'): void;
  /** Ask before deleting the gesture and its trials. */
  deleteGesture(g: Gesture): void;
  /** Change a gesture in place; saved soon while On is being dragged. */
  change(id: string, to: (g: Gesture) => Gesture, soon?: boolean): void;
  /** Fit the gesture again after `edit` (a channel change), and show its details again. */
  refit(id: string, edit?: (g: Gesture) => Gesture): void;
  /** Try `template` for the gesture, while a threshold is dragged; none puts the fitted one back. */
  tryTemplate(id: string, template?: Template): void;
  record(g: Gesture): void;
  /** Why the last recording ended early, if it did. */
  problemOf(id: string): string | undefined;
  back(): void;
}

export interface Details {
  /** The head: back, the name, the direction, Delete…. */
  header: HTMLElement;
  /** The rest, down to the foot row. */
  body: HTMLElement;
  /** Take away what listens for frames. */
  dispose(): void;
}

const MOVES_TEXT = 'No channel moves clearly enough.';

export function openDetails(host: DetailsHost, g: Gesture, trials: Trial[]): Details {
  const listeners: FrameListener[] = [];
  const listen = (l: FrameListener) => { listeners.push(l); host.frames.add(l); };

  /* ---------- the head ---------- */

  const header = el('div', 'face-view-head');
  const back = button('‹', () => host.back(), 'quiet');
  back.setAttribute('aria-label', 'Back to the list');
  const select = document.createElement('select');
  select.setAttribute('aria-label', `${g.name}: turns`);
  for (const [value, label] of DIRECTIONS) select.append(new Option(label, value, false, g.direction === value));
  select.addEventListener('change', () => host.setDirection(g.id, select.value as TurnDir | 'none'));
  header.append(back, host.nameCell(g), select, button('Delete…', () => host.deleteGesture(g), 'quiet warn'));

  const body = el('div', 'face-view-body');

  /* ---------- what is wrong ---------- */

  const wrong: string[] = [];
  for (const f of g.fit.flags) wrong.push(f.kind === 'firesAtRest' ? [flagText(f), blameLine(g, trials)].filter(Boolean).join(' ') : flagText(f));
  if (g.note) wrong.push(g.note);
  const why = host.problemOf(g.id);
  if (why) wrong.push(why);
  if (wrong.length) {
    const box = el('div', 'face-issue');
    for (const w of wrong) box.append(el('p', '', w));
    body.append(box);
  }

  /* ---------- On level ---------- */

  const template = g.fit.template;
  /** The template in use: the fitted one, or with a threshold moved while it is dragged. */
  let live = template;
  const levels = levelsOf(g, host.hold());
  let meter: ReturnType<typeof strengthMeter> | undefined;
  if (template && levels) {
    const head = el('div', 'face-sec-head');
    const reset = button('Reset', () => host.change(g.id, withoutOn), 'quiet');
    reset.hidden = g.on === undefined;
    head.append(el('h3', '', 'On level'), reset);
    meter = strengthMeter({
      tall: true,
      on: levels.on,
      release: levels.release,
      ticks: { rest: g.fit.rest ?? 0, trials: g.fit.peaks ?? [] },
      drag: (on) => {
        host.change(g.id, (x) => withLevels(x, on), true);
        // The gesture is the dialog's now; this view's own copy gives the new Release.
        const l = levelsOf(withLevels(g, on), host.hold())!;
        meter!.levels(l.on, l.release);
        reset.hidden = false;
      },
    });
    body.append(head, meter.el);
  }

  /* ---------- channels ---------- */

  const head = el('div', 'face-sec-head');
  const resetChannels = button('Reset', () => host.refit(g.id, (x) => withChannels(x, () => ({ forcedOff: [], forcedOn: [], thresholds: {} }))), 'quiet');
  resetChannels.hidden = !g.channels;
  head.append(el('h3', '', 'Channels'), resetChannels);
  body.append(head);

  // Every channel the fit would use as changed by hand, but with none forced off: a channel forced off stays in its place, greyed.
  const frames = trials.filter((t) => !t.disabled).map(framesOf);
  const shown: Template = fit(frames, g.channels && { forcedOff: [], forcedOn: g.channels.forcedOn, thresholds: g.channels.thresholds });
  const off = new Set(g.channels?.forcedOff ?? []);
  const channelsBox = el('div', 'face-channels');
  const rowUis: ChannelRow[] = [];

  /** Move a threshold of a channel, by its name, and fit again. */
  const setThreshold = (c: number, v: number) => host.refit(g.id, (x) => withChannels(x, (ch) => ({ ...ch, thresholds: { ...ch.thresholds, [CHANNELS[c]]: v } })));
  /** Force a channel off or back on. */
  const forceOff = (c: number, forced: boolean) => host.refit(g.id, (x) => withChannels(x, (ch) => ({ ...ch, forcedOff: forced ? [...new Set([...ch.forcedOff, CHANNELS[c]])] : ch.forcedOff.filter((n) => n !== CHANNELS[c]) })));

  /** A threshold dragged to `v`: the meters, the ring and the dots use it at once. Gives where it ends up. */
  const drag = (c: number, v: number): number => {
    if (!template) return v;
    live = withThreshold(template, c, v);
    host.tryTemplate(g.id, live);
    return live.rows.find((r) => r.c === c)?.edge ?? live.limits.find((k) => k.c === c)?.limit ?? v;
  };

  if (!shown.rows.length) channelsBox.append(el('p', 'hint', MOVES_TEXT));
  for (const row of shown.rows) {
    const limit = shown.limits.find((k) => partnerOf(k.c) === row.c);
    const ui = channelRow({
      row,
      limit,
      off: off.has(CHANNELS[row.c]),
      limitOff: !!limit && off.has(CHANNELS[limit.c]),
      useChannel: (on) => forceOff(row.c, !on),
      useLimit: (on) => limit && forceOff(limit.c, !on),
      drag,
      set: setThreshold,
    });
    rowUis.push(ui);
    channelsBox.append(ui.el);
  }
  body.append(channelsBox);

  const addChannel = button('Add channel…', () => pickChannel());
  const addFoot = el('div', 'face-ft-foot');
  addFoot.append(addChannel);
  body.append(addFoot);

  /** A list over the dialog of every channel not in the template, by separation; those that move can be picked. */
  const pickChannel = () => {
    const { dialog, close } = showOnTop('Add a channel');
    const list = el('div', 'face-picker');
    const head = el('div', 'pk-head');
    head.append(el('span', '', 'Channel'), el('span', '', 'span'), el('span', '', 'separation ▾'));
    list.append(head);
    for (const c of candidates(frames, shown)) {
      const item = el('button', c.moves ? 'pk' : 'pk none');
      item.type = 'button';
      item.disabled = !c.moves;
      item.append(el('span', 'fname', CHANNELS[c.c]), el('span', 'n', c.span.toFixed(2)), el('span', 'n', c.separation.toFixed(2)));
      item.addEventListener('click', () => {
        close();
        host.refit(g.id, (x) => withChannels(x, (ch) => ({ ...ch, forcedOn: [...new Set([...ch.forcedOn, CHANNELS[c.c]])], forcedOff: ch.forcedOff.filter((n) => n !== CHANNELS[c.c]) })));
      });
      list.append(item);
    }
    dialog.append(list, buttonRow(button('Cancel', close)));
  };

  /* ---------- the foot ---------- */

  body.append(buttonRow(button('Record', () => host.record(g)), button('Done', closeOverlay, 'primary')));

  listen((_f, x) => {
    rowUis.forEach((r) => r.show(x));
    if (live) meter?.show(x ? strength(live, x) : 0);
  });

  return {
    header,
    body,
    dispose: () => {
      for (const l of listeners) host.frames.delete(l);
      host.tryTemplate(g.id);
    },
  };
}
