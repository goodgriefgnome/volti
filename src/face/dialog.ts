// The Face gestures dialog, from the library's ⋯ menu and the reader's face button: the list of the
// gestures the person defines, which way each turns and its On level, the one hold, with the camera
// on so they can be tried in place. Every change is saved at once.

import { buttonStatus } from './button-status';
import { faceButton } from './face-button';
import { activeOf, HOLD_RANGE, hasGestures, levelsOf, newGesture, NO_GESTURES, withFit, withLevels, type FaceSettings, type Gesture, type TurnDir } from './gestures';
import { buildFit } from './_fit';
import { listOrder, statusOf, isFitted } from './_dialog-helpers';
import { strengthMeter } from './_meter';
import { readyTones } from './_tones';
import type { Trial } from './_recording';
import { settled } from './_settling';
import { loadFaceSettings, loadTrials, saveFaceSettings, saveTrials } from './store';
import { strength } from './_template';
import { FaceWatcher, type CameraStatus } from './watcher';
import { button, el } from '../ui/dom';
import { failed, failedOnce } from '../ui/failure';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
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
  const frameListeners = new Set<FrameListener>();

  /* ---------- the preview ---------- */

  const preview = faceButton({ interactive: false });
  const problem = el('p', 'hint error');
  const showButton = () => preview.show(buttonStatus({ available: hasGestures(settings), watching: trying ? 'on' : 'off', camera, faceSeen }));
  const watcher = new FaceWatcher({
    status: (s) => { camera = s; showButton(); },
    face: (seen) => { faceSeen = seen; showButton(); },
    frame: (f, x, now) => frameListeners.forEach((l) => l(f, x, now)),
    progress: (p) => preview.progress(p),
    turn: () => preview.pulse(),
    failed: (e) => {
      trying = false;
      problem.textContent = failed('start the camera', e);
      showButton();
    },
  }, []);
  watcher.video.className = 'face-video';

  // The one hold, for every gesture; it can't be moved before the settings are loaded.
  const holdLabel = el('span', '', 'Gesture hold');
  const holdValue = el('span', 'value', `${NO_GESTURES.hold} ms`);
  const holdInput = document.createElement('input');
  holdInput.type = 'range';
  Object.assign(holdInput, { min: String(HOLD_RANGE.min), max: String(HOLD_RANGE.max), step: '50', value: String(NO_GESTURES.hold), disabled: true });
  holdInput.setAttribute('aria-label', 'Gesture hold');
  holdInput.addEventListener('input', () => {
    holdValue.textContent = `${holdInput.value} ms`;
    commit({ ...settings, hold: Number(holdInput.value) });
  });
  const hold = el('div', 'face-hold');
  hold.append(holdLabel, holdValue, holdInput);

  const stage = el('div', 'face-stage');
  stage.append(watcher.video, el('div', 'face-preview-button'), hold);
  stage.querySelector('.face-preview-button')!.append(preview.el);
  showButton();
  d.append(stage, problem);

  /* ---------- the settings ---------- */

  /** Changes that wait their turn, so one that loads trials can't be overtaken by the next. */
  let queue: Promise<void> = Promise.resolve();
  const later = (f: () => Promise<void> | void) => { queue = queue.then(f).catch((e) => failedOnce('change the face gestures', e)); };

  /** These settings, kept and tried; saved at once, or soon (while On is being dragged). */
  let saving: ReturnType<typeof setTimeout> | undefined;
  const save = (soon: boolean) => {
    clearTimeout(saving);
    const run = () => { saving = undefined; void saveFaceSettings(settings).catch((e) => failedOnce('save the face gestures', e)); };
    if (soon) saving = setTimeout(run, 200);
    else run();
  };
  const commit = (next: FaceSettings, soon = false) => {
    settings = next;
    watcher.setGestures(activeOf(next));
    showButton();
    save(soon);
  };
  /** One gesture changed, in place. */
  const change = (id: string, to: (g: Gesture) => Gesture, soon = false) => commit({ ...settings, gestures: settings.gestures.map((g) => (g.id === id ? to(g) : g)) }, soon);

  /** The trials of every gesture that can turn a page, for the conflict check. */
  async function trialsOfActive(s: FaceSettings): Promise<Map<string, Trial[]>> {
    const map = new Map<string, Trial[]>();
    for (const g of s.gestures) if (g.direction !== 'none') map.set(g.id, await loadTrials(g.id));
    return map;
  }

  /* ---------- the list ---------- */

  const rows = el('div', 'face-rows');
  const meters = new Map<string, (x: Float32Array | null) => void>();
  frameListeners.add((_f, x) => meters.forEach((m) => m(x)));
  d.append(rows);

  /** Why a round ended early, by the gesture it was for, until the next round. */
  const problems = new Map<string, string>();

  const setDirection = (id: string, direction: TurnDir | 'none') => later(async () => {
    // Its old note, if it was set to none for a conflict, goes.
    const next: FaceSettings = { ...settings, gestures: settings.gestures.map((g) => { if (g.id !== id) return g; const { note: _note, ...rest } = g; return { ...rest, direction }; }) };
    // A gesture given a direction can conflict: it is the first to give way.
    commit(direction === 'none' ? next : settled(next, await trialsOfActive(next), id));
    renderRows();
  });

  /** A gesture's name with its pencil; the pencil swaps the name for a field, with OK and Cancel. */
  const nameCell = (g: Gesture) => {
    const cell = el('div', 'face-named');
    const show = () => {
      const pencil = button('', () => edit(), 'icon');
      pencil.setAttribute('aria-label', `Rename “${g.name}”`);
      pencil.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.3 2.3l2.4 2.4-8.2 8.2-3.2.8.8-3.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      cell.replaceChildren(el('span', 'name', g.name), pencil);
    };
    const edit = () => {
      const input = el('input', 'name');
      input.type = 'text';
      input.value = g.name;
      input.setAttribute('aria-label', 'Gesture name');
      const ok = () => {
        const text = input.value.trim();
        if (!text) return;
        later(() => { change(g.id, (x) => ({ ...x, name: text })); renderRows(); });
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') { e.stopPropagation(); show(); } });
      cell.replaceChildren(input, button('OK', ok, 'primary'), button('Cancel', show, 'quiet'));
      input.focus();
      input.select();
    };
    show();
    return cell;
  };

  /** Open a gesture's details. */
  const openDetails = (_g: Gesture) => {};

  const renderRows = () => {
    rows.replaceChildren();
    meters.clear();
    if (loaded && !settings.gestures.length) rows.append(el('p', 'hint', 'No gestures yet. Add one, and record yourself doing it.'));
    for (const g of listOrder(settings.gestures)) {
      const fitted = isFitted(g);
      const row = el('div', fitted ? 'face-row' : 'face-row unfitted');
      const status = statusOf(g);
      const record = button('Record', () => startRound(g));
      row.append(nameCell(g));
      if (fitted) {
        const select = document.createElement('select');
        select.setAttribute('aria-label', `${g.name}: turns`);
        for (const [value, label] of DIRECTIONS) select.append(new Option(label, value, false, g.direction === value));
        select.addEventListener('change', () => setDirection(g.id, select.value as TurnDir | 'none'));
        row.append(select);
        const levels = levelsOf(g, settings.hold);
        if (levels) {
          const template = g.fit.template!;
          const meter = strengthMeter({
            tall: false,
            on: levels.on,
            release: levels.release,
            drag: (on) => {
              change(g.id, (x) => withLevels(x, on), true);
              const l = levelsOf(settings.gestures.find((x) => x.id === g.id)!, settings.hold)!;
              meter.levels(l.on, l.release);
            },
          });
          meters.set(g.id, (x) => meter.show(x ? strength(template, x) : 0));
          row.append(meter.el);
        }
        row.append(record, el('span', 'face-chevron', '›'));
        row.addEventListener('click', (e) => { if (!(e.target as Element).closest('button, select, input, .face-meter')) openDetails(g); });
      } else row.append(record);
      const lines = el('div', 'face-status');
      lines.append(el('p', status.warn ? 'bad' : '', status.text));
      if (problems.has(g.id)) lines.append(el('p', 'bad', problems.get(g.id)));
      row.append(lines);
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
    // An On still being dragged is saved now.
    if (saving) save(false);
    // What a round just kept is saved first.
    void queue.then(() => closed?.());
  });

  renderRows();
  void watcher.start();
  void loadFaceSettings().then((s) => {
    if (!d.isConnected) return;
    loaded = true;
    add.disabled = false;
    holdInput.disabled = false;
    holdInput.value = String(s.hold);
    holdValue.textContent = `${s.hold} ms`;
    commit(s);
    renderRows();
  }, (e) => failedOnce("load the face gestures' settings", e));
}
