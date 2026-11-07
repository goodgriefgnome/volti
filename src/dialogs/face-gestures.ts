// The Face gestures dialog, from the library's ⋯ menu and the reader's face button: which gesture
// turns which way, how sensitive and how long a hold, with the camera on so they can be tried in
// place, and calibration. Every change is saved at once.

import { attempts, calibrated, restLevel, ATTEMPTS } from '../face/calibration';
import { buttonState } from '../face/button-state';
import { faceButton } from '../face/face-button';
import { DEFAULT_FACE_SETTINGS, GESTURES, HOLD_RANGE, hasGestures, measure, thresholdRange, type FaceFrame, type FaceGesture, type FaceSettings, type TurnDir } from '../face/gestures';
import { loadFaceSettings, saveFaceSettings } from '../face/store';
import { FaceWatcher, type CameraStatus } from '../face/watcher';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog, whenOverlayCloses } from '../ui/overlay';
import { failed, failedOnce } from '../ui/failure';

/** How long calibration's resting step lasts, and the most each gesture's step does. */
const REST_MS = 10_000;
const STEP_MS = 15_000;

const DIRECTIONS: [value: string, label: string][] = [['next', 'Next'], ['prev', 'Back'], ['none', 'None']];

/** The Face gestures dialog: starts the camera while open; `closed` is called when it closes, however. */
export function openFaceGestures(closed?: () => void): void {
  const d = showDialog('Face gestures', 'face-gestures');
  let settings: FaceSettings = DEFAULT_FACE_SETTINGS;
  let camera: CameraStatus = 'stopped';
  let faceSeen = false;
  let trying = true;
  let page = 1;
  /** Taking each frame, for the meters and for calibration. */
  const frameListeners = new Set<(f: FaceFrame | null) => void>();

  /* ---------- the preview ---------- */

  const preview = faceButton({ interactive: false });
  const pageNumber = el('div', 'face-page', '1');
  const problem = el('p', 'hint error');
  const showButton = () => preview.show(buttonState({ available: hasGestures(settings), watching: trying ? 'on' : 'off', camera, faceSeen }));
  const watcher = new FaceWatcher({
    status: (s) => { camera = s; showButton(); },
    face: (seen) => { faceSeen = seen; showButton(); },
    frame: (f) => frameListeners.forEach((l) => l(f)),
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
  }, settings);
  watcher.video.className = 'face-video';
  const stage = el('div', 'face-stage');
  stage.append(watcher.video, el('div', 'face-preview-button'), pageNumber);
  stage.querySelector('.face-preview-button')!.append(preview.el);
  showButton();
  d.append(stage, problem);

  /* ---------- the gestures ---------- */

  const rows = el('div', 'face-rows');
  const meters = new Map<FaceGesture, (f: FaceFrame | null) => void>();
  frameListeners.add((f) => meters.forEach((m) => m(f)));
  d.append(rows);

  const change = (g: FaceGesture, to: Partial<FaceSettings[FaceGesture]>) => {
    settings = { ...settings, [g]: { ...settings[g], ...to } };
    watcher.setSettings(settings);
    showButton();
    void saveFaceSettings(settings).catch((e) => failedOnce('save the face gestures', e));
  };

  /** A slider's row: its label, the slider and its value. */
  const slider = (label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, set: (v: number) => void) => {
    const row = el('label', 'face-slider');
    const input = document.createElement('input');
    input.type = 'range';
    Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(value) });
    const text = el('span', 'value', show(value));
    input.addEventListener('input', () => { text.textContent = show(Number(input.value)); set(Number(input.value)); });
    row.append(el('span', '', label), input, text);
    return row;
  };

  /** The rows, from `notes` (what calibration said of each gesture). */
  const renderRows = (notes: Partial<Record<FaceGesture, string>> = {}) => {
    rows.replaceChildren();
    meters.clear();
    for (const { id, name, kind } of GESTURES) {
      const row = el('div', 'face-row');
      const select = document.createElement('select');
      select.setAttribute('aria-label', `${name}: turns`);
      for (const [value, label] of DIRECTIONS) select.append(new Option(label, value, false, settings[id].direction === value));
      select.addEventListener('change', () => { change(id, { direction: select.value as TurnDir | 'none' }); renderRows(); });
      const head = el('div', 'face-row-head');
      head.append(el('span', 'name', name), select);
      row.append(head);
      if (settings[id].direction !== 'none') {
        const range = thresholdRange(id);
        const scale = kind === 'angle' ? range.max : 1;
        const track = el('div', 'face-meter');
        const fill = el('div', 'fill');
        const mark = el('div', 'mark');
        track.append(fill, mark);
        const placeMark = () => { mark.style.left = `${(settings[id].threshold / scale) * 100}%`; };
        placeMark();
        meters.set(id, (f) => { fill.style.width = `${f ? Math.max(0, Math.min(1, measure(id, f) / scale)) * 100 : 0}%`; });
        // Left is less sensitive: a higher threshold, so the slider runs from the highest threshold to the lowest.
        const step = kind === 'angle' ? 1 : 0.01;
        row.append(
          track,
          slider('Sensitivity', -range.max, -range.min, step, -settings[id].threshold, () => '', (v) => { change(id, { threshold: -v }); placeMark(); }),
          slider('Hold', HOLD_RANGE.min, HOLD_RANGE.max, 50, settings[id].hold, (v) => `${v} ms`, (v) => change(id, { hold: v })),
        );
      }
      if (notes[id]) row.append(el('p', 'hint error', notes[id]));
      rows.append(row);
    }
    calibrate.disabled = !hasGestures(settings);
  };

  /* ---------- calibration ---------- */

  const calibrating = el('div', 'face-calibrating');
  calibrating.hidden = true;
  const instruction = el('p', 'instruction');
  const countdown = el('p', 'hint');
  let stopCalibrating = () => {};
  calibrating.append(instruction, countdown, buttonRow(button('Cancel', () => stopCalibrating(), 'quiet')));
  d.append(calibrating);

  const calibrate = button('Calibrate', () => startCalibration(), '');
  const done = button('Done', closeOverlay, 'primary');
  d.append(buttonRow(calibrate, done));

  function startCalibration() {
    const set = GESTURES.filter((g) => settings[g.id].direction !== 'none');
    if (!set.length) return;
    rows.hidden = true;
    calibrate.hidden = true;
    calibrating.hidden = false;
    const rest = new Map<FaceGesture, number>();
    const resting = new Map<FaceGesture, number[]>(set.map((g) => [g.id, []]));
    const samples = new Map<FaceGesture, number[]>(set.map((g) => [g.id, []]));
    // Step 0 is the rest; step i the i-th gesture.
    let step = -1;
    let stepStart = 0;
    let timer: ReturnType<typeof setInterval>;

    const onFrame = (f: FaceFrame | null) => {
      if (!f) return;
      if (step < 0) { for (const g of set) resting.get(g.id)!.push(measure(g.id, f)); return; }
      const g = set[step].id;
      samples.get(g)!.push(measure(g, f));
      // Three attempts are in once the third has fallen back under the line.
      const s = samples.get(g)!;
      const found = attempts(s, rest.get(g)!);
      if (found.length >= ATTEMPTS) {
        const top = Math.max(...s);
        if (f && measure(g, f) <= rest.get(g)! + (top - rest.get(g)!) / 2) next();
      }
    };
    const finish = () => {
      clearInterval(timer);
      frameListeners.delete(onFrame);
      stopCalibrating = () => {};
      calibrating.hidden = true;
      rows.hidden = false;
      calibrate.hidden = false;
    };
    const next = () => {
      step++;
      stepStart = performance.now();
      if (step === 0) {
        for (const g of set) rest.set(g.id, restLevel(resting.get(g.id)!));
      }
      if (step >= set.length) { conclude(); return; }
      instruction.textContent = `${set[step].name} three times`;
    };
    const conclude = () => {
      const notes: Partial<Record<FaceGesture, string>> = {};
      let updated = settings;
      for (const g of set) {
        const r = calibrated(g.id, settings[g.id], rest.get(g.id)!, attempts(samples.get(g.id)!, rest.get(g.id)!));
        if ('tune' in r) updated = { ...updated, [g.id]: r.tune };
        else notes[g.id] = `${g.name}: not reliable for you; try another gesture.`;
      }
      settings = updated;
      watcher.setSettings(settings);
      void saveFaceSettings(settings).catch((e) => failedOnce('save the face gestures', e));
      finish();
      renderRows(notes);
    };
    stopCalibrating = () => { finish(); renderRows(); };

    instruction.textContent = 'Play as you normally would for 10 seconds, without gesturing.';
    stepStart = performance.now();
    frameListeners.add(onFrame);
    timer = setInterval(() => {
      const length = step < 0 ? REST_MS : STEP_MS;
      const left = Math.max(0, length - (performance.now() - stepStart));
      countdown.textContent = `${Math.ceil(left / 1000)} s`;
      if (left > 0) return;
      next();
    }, 100);
  }

  whenOverlayCloses(() => {
    stopCalibrating();
    watcher.stop();
    closed?.();
  });

  renderRows();
  void watcher.start();
  void loadFaceSettings().then((s) => {
    if (!d.isConnected) return;
    settings = s;
    watcher.setSettings(s);
    showButton();
    renderRows();
  }, (e) => failedOnce("load the face gestures' settings", e));
}
