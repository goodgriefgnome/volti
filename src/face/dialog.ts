// The Face gestures dialog, from the library's ⋯ menu and the reader's face button: the gestures
// the person defines, which way each turns and its On level, and the one hold, with the camera on
// so they can be tried in place. Every change is saved at once.

import { buttonStatus } from './button-status';
import { faceButton } from './face-button';
import { activeOf, HOLD_RANGE, LEVEL_RANGE, hasGestures, levelsOf, newGesture, NO_GESTURES, withFit, withLevels, type FaceSettings, type Gesture, type TurnDir } from './gestures';
import { buildFit, flagText } from './_fit';
import { ROUND } from './_recording';
import { readyTones } from './_tones';
import type { Trial } from './_recording';
import { settled } from './_settling';
import { deleteTrials, loadFaceSettings, loadTrials, saveFaceSettings, saveTrials } from './store';
import { strength } from './_template';
import { FaceWatcher, type CameraStatus } from './watcher';
import { button, el, plural } from '../ui/dom';
import { failed, failedOnce } from '../ui/failure';
import { buttonRow, closeOverlay, showDialog, showOnTop, whenOverlayCloses } from '../ui/overlay';
import { faceDetails } from './_details';
import { recordRound, type FrameListener, type Round } from './_round';

const DIRECTIONS: [value: string, label: string][] = [['next', 'Next'], ['prev', 'Back'], ['none', 'None']];

/** The Face gestures dialog: starts the camera while open; `closed` is called when it closes, however. */
export function openFaceGestures(closed?: () => void): void {
  const d = showDialog('Face gestures', 'face-gestures');
  let settings: FaceSettings = NO_GESTURES;
  let loaded = false;
  let camera: CameraStatus = 'stopped';
  let faceSeen = false;
  let trying = true;
  let page = 1;
  const frameListeners = new Set<FrameListener>();

  /** A slider's row: its label, the slider and its value; `set` moves it to a value kept elsewhere. */
  const slider = (label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, onInput: (v: number) => void) => {
    const row = el('label', 'face-slider');
    const input = document.createElement('input');
    input.type = 'range';
    Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(value) });
    const text = el('span', 'value', show(value));
    input.addEventListener('input', () => { text.textContent = show(Number(input.value)); onInput(Number(input.value)); });
    row.append(el('span', '', label), input, text);
    return { row, input, set: (v: number) => { input.value = String(v); text.textContent = show(v); } };
  };

  /* ---------- the preview ---------- */

  const preview = faceButton({ interactive: false });
  const pageNumber = el('div', 'face-page', '1');
  const problem = el('p', 'hint error');
  const showButton = () => preview.show(buttonStatus({ available: hasGestures(settings), watching: trying ? 'on' : 'off', camera, faceSeen }));
  const watcher = new FaceWatcher({
    status: (s) => { camera = s; showButton(); },
    face: (seen) => { faceSeen = seen; showButton(); },
    frame: (f, x, now) => frameListeners.forEach((l) => l(f, x, now)),
    progress: (p) => preview.progress(p),
    turn: (dir) => {
      page = Math.max(1, page + (dir === 'next' ? 1 : -1));
      pageNumber.textContent = String(page);
      preview.pulse();
    },
    failed: (e) => {
      trying = false;
      problem.textContent = failed('start the camera', e);
      showButton();
    },
  }, []);
  watcher.video.className = 'face-video';
  const stage = el('div', 'face-stage');
  stage.append(watcher.video, el('div', 'face-preview-button'), pageNumber);
  stage.querySelector('.face-preview-button')!.append(preview.el);
  showButton();
  // The one hold, for every gesture; it can't be moved before the settings are loaded.
  const hold = slider('Gesture hold', HOLD_RANGE.min, HOLD_RANGE.max, 50, NO_GESTURES.hold, (v) => `${v} ms`, (v) => commit({ ...settings, hold: v }));
  hold.input.disabled = true;
  d.append(stage, problem, hold.row);

  /* ---------- the settings ---------- */

  /** Changes that wait their turn, so one that loads trials can't be overtaken by the next. */
  let queue: Promise<void> = Promise.resolve();
  const later = (f: () => Promise<void> | void) => { queue = queue.then(f).catch((e) => failedOnce('change the face gestures', e)); };

  /** These settings, kept, tried and saved. */
  const commit = (next: FaceSettings) => {
    settings = next;
    watcher.setGestures(activeOf(next));
    showButton();
    void saveFaceSettings(next).catch((e) => failedOnce('save the face gestures', e));
  };
  /** One gesture changed, in place. */
  const change = (id: string, to: (g: Gesture) => Gesture) => commit({ ...settings, gestures: settings.gestures.map((g) => (g.id === id ? to(g) : g)) });

  /** The trials of every gesture that can turn a page, for the conflict check. */
  async function trialsOfActive(s: FaceSettings): Promise<Map<string, Trial[]>> {
    const map = new Map<string, Trial[]>();
    for (const g of s.gestures) if (g.direction !== 'none') map.set(g.id, await loadTrials(g.id));
    return map;
  }

  /* ---------- the gestures ---------- */

  const rows = el('div', 'face-rows');
  /** The gestures whose Details are open, kept while the rows are shown again. */
  const detailsOpen = new Set<string>();
  const meters = new Map<string, (x: Float32Array | null) => void>();
  frameListeners.add((_f, x) => meters.forEach((m) => m(x)));
  d.append(rows);

  /** Ask before `ok`, over the dialog (which stays). */
  const confirm = (title: string, text: string, label: string, ok: () => void) => {
    const { dialog, close } = showOnTop(title);
    dialog.append(
      el('p', '', text),
      buttonRow(button('Cancel', close), button(label, () => { close(); ok(); }, 'danger')),
    );
  };

  const deleteGesture = (g: Gesture) => confirm(`Delete “${g.name}”?`, 'Its trials are deleted with it.', 'Delete', () => later(async () => {
    commit({ ...settings, gestures: settings.gestures.filter((x) => x.id !== g.id) });
    await deleteTrials(g.id);
    renderRows();
  }));

  /** Why a round ended early, by the gesture it was for, until the next round. */
  const problems = new Map<string, string>();

  const clearTrials = (g: Gesture) => confirm(`Clear the trials of “${g.name}”?`, 'It will need recording again before it can turn pages.', 'Clear', () => later(async () => {
    await deleteTrials(g.id);
    problems.delete(g.id);
    change(g.id, (x) => withFit(x, buildFit([])));
    renderRows();
  }));

  const setDirection = (id: string, direction: TurnDir | 'none') => later(async () => {
    // Its old note, if it was set to none for a conflict, goes.
    const next: FaceSettings = { ...settings, gestures: settings.gestures.map((g) => { if (g.id !== id) return g; const { note: _note, ...rest } = g; return { ...rest, direction }; }) };
    // A gesture given a direction can conflict: it is the first to give way.
    commit(direction === 'none' ? next : settled(next, await trialsOfActive(next), id));
    renderRows();
  });

  const renderRows = () => {
    rows.replaceChildren();
    meters.clear();
    if (loaded && !settings.gestures.length) rows.append(el('p', 'hint', 'No gestures yet. Add one, and record yourself doing it.'));
    for (const g of settings.gestures) {
      const row = el('div', 'face-row');
      const select = document.createElement('select');
      select.setAttribute('aria-label', `${g.name}: turns`);
      for (const [value, label] of DIRECTIONS) select.append(new Option(label, value, false, g.direction === value));
      select.addEventListener('change', () => setDirection(g.id, select.value as TurnDir | 'none'));
      const head = el('div', 'face-row-head');
      head.append(el('span', 'name', g.name), select);
      const n = g.fit.trials;
      const actions = el('div', 'face-row-actions');
      actions.append(button(`Record ${ROUND} trials`, () => startRound(g)));
      if (n) actions.append(button('Clear trials', () => clearTrials(g), 'quiet'));
      actions.append(button('Delete', () => deleteGesture(g), 'quiet'));
      row.append(head, el('p', 'hint', plural(n, 'trial') + (n < 10 ? ' (10 to 15 are best)' : '')), actions);
      for (const f of g.fit.flags) row.append(el('p', 'hint error', flagText(f)));
      if (g.note) row.append(el('p', 'hint error', g.note));
      if (problems.has(g.id)) row.append(el('p', 'hint error', problems.get(g.id)));
      const levels = levelsOf(g, settings.hold);
      if (levels) {
        const template = g.fit.template!;
        const track = el('div', 'face-meter');
        const fill = el('div', 'fill');
        const tick = el('div', 'tick');
        const releaseTick = el('div', 'tick release');
        track.append(fill, tick, releaseTick);
        const placeTicks = () => {
          const l = levelsOf(settings.gestures.find((x) => x.id === g.id) ?? g, settings.hold)!;
          tick.style.left = `${l.on * 100}%`;
          releaseTick.style.left = `${l.release * 100}%`;
        };
        placeTicks();
        const details = faceDetails(g);
        details.el.open = detailsOpen.has(g.id);
        details.el.addEventListener('toggle', () => { if (details.el.open) detailsOpen.add(g.id); else detailsOpen.delete(g.id); });
        meters.set(g.id, (x) => { fill.style.width = `${x ? strength(template, x) * 100 : 0}%`; details.update(x); });
        const show = (v: number) => v.toFixed(2);
        // Moving On moves Release with it (halfway from the rest level).
        const on = slider('On', LEVEL_RANGE.min, LEVEL_RANGE.max, 0.01, levels.on, show, (v) => {
          change(g.id, (x) => withLevels(x, v));
          placeTicks();
        });
        row.append(track, on.row, details.el);
      }
      rows.append(row);
    }
  };

  /* ---------- adding a gesture ---------- */

  const nameRow = el('div', 'face-add');
  nameRow.hidden = true;
  const name = el('input', 'name');
  name.type = 'text';
  name.placeholder = 'For example, Wink right';
  name.setAttribute('aria-label', 'Gesture name');
  const addOk = button('Add', () => {
    const text = name.value.trim();
    if (!text) return;
    name.value = '';
    nameRow.hidden = true;
    add.hidden = false;
    later(() => { commit({ ...settings, gestures: [...settings.gestures, newGesture(text)] }); renderRows(); });
  }, 'primary');
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOk.click(); });
  nameRow.append(name, addOk, button('Cancel', () => { nameRow.hidden = true; add.hidden = false; }, 'quiet'));
  const add = button('Add gesture…', () => { add.hidden = true; nameRow.hidden = false; name.focus(); });
  add.disabled = true;
  const done = button('Done', closeOverlay, 'primary');
  const buttons = buttonRow(add, done);
  d.append(nameRow, buttons);

  /* ---------- recording ---------- */

  const recording = el('div', 'face-recording');
  recording.hidden = true;
  d.append(recording);
  let round: Round | undefined;

  /** Show the rows, or the round. */
  const showRound = (on: boolean) => {
    rows.hidden = on;
    buttons.hidden = on;
    nameRow.hidden = true;
    add.hidden = false;
    recording.hidden = !on;
  };

  /** Record a round of trials of `g`; nothing turns meanwhile. */
  function startRound(g: Gesture) {
    problems.delete(g.id);
    readyTones();
    watcher.setGestures([]);
    showRound(true);
    round = recordRound(recording, frameListeners, (trials, why) => {
      round = undefined;
      if (d.isConnected) showRound(false);
      later(async () => {
        if (trials.length) {
          const all = [...await loadTrials(g.id), ...trials];
          await saveTrials(g.id, all);
          // Fitted again from all its trials, its levels back to the fitted ones, and it is the first to give way.
          const fitted: FaceSettings = { ...settings, gestures: settings.gestures.map((x) => (x.id === g.id ? withFit(x, buildFit(all, x.channels)) : x)) };
          commit(settled(fitted, await trialsOfActive(fitted), g.id));
        } else commit(settings);
        if (why) problems.set(g.id, why);
        renderRows();
      });
    });
  }

  whenOverlayCloses(() => {
    round?.cancel();
    watcher.stop();
    // What a round just kept is saved first.
    void queue.then(() => closed?.());
  });

  renderRows();
  void watcher.start();
  void loadFaceSettings().then((s) => {
    if (!d.isConnected) return;
    loaded = true;
    add.disabled = false;
    hold.input.disabled = false;
    hold.set(s.hold);
    commit(s);
    renderRows();
  }, (e) => failedOnce("load the face gestures' settings", e));
}
