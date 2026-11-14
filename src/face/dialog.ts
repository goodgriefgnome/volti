// The Face gestures dialog, from the library's ⋯ menu and the reader's face button: the list of the
// gestures the person defines, which way each turns and its On level, the one hold, with the camera
// on so they can be tried in place. Every change is saved at once.

import { buttonStatus } from './button-status';
import { faceButton } from './face-button';
import { activeOf, HOLD_RANGE, hasGestures, levelsOf, newGesture, NO_GESTURES, withFit, withLevels, type FaceSettings, type Gesture, type TurnDir } from './gestures';
import { openDetails, type Details, type DetailsHost } from './_details';
import { buildFit } from './_fit';
import { listOrder, statusOf, isFitted } from './_dialog-helpers';
import { strengthMeter } from './_meter';
import { readyTones } from './_tones';
import type { Trial } from './_recording';
import { settled } from './_settling';
import { deleteDisabledTrials, deleteTrials, loadFaceSettings, loadTrials, saveFaceSettings, saveTrials, setTrialDisabled } from './store';
import type { Shown } from './_trials';
import { strength } from './_template';
import { FaceWatcher, type CameraStatus } from './watcher';
import { button, el } from '../ui/dom';
import { failed, failedOnce } from '../ui/failure';
import { buttonRow, closeOverlay, showDialog, showOnTop, whenOverlayCloses } from '../ui/overlay';
import { recordUntilTapped, type FrameListener, type RecordingScreen } from './_recording-screen';

const DIRECTIONS: [value: string, label: string][] = [['next', 'Next'], ['prev', 'Back'], ['none', 'None']];

/** A page of music drawn to fit the screen, for a recording to play over. */
export type PagePicture = HTMLCanvasElement;

/**
 * Asks which page to record over, over the dialog, and calls `start` with its picture; `close`
 * takes the question away. It is the library's part (dialogs/face-play-from.ts), given by whoever
 * opens the dialog: face/ is below the library and can't reach it.
 */
export type PlayFrom = (name: string, start: (page: PagePicture) => void) => { close(): void };

/** The Face gestures dialog: starts the camera while open; `closed` is called when it closes, however. */
export function openFaceGestures(closed: (() => void) | undefined, playFrom: PlayFrom): void {
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
  // What a gesture's details put above the preview.
  const headSlot = el('div', 'face-view-head-slot');
  headSlot.hidden = true;
  d.append(headSlot, stage, problem);

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
  const detailsBody = el('div', 'face-view-body-slot');
  detailsBody.hidden = true;
  const meters = new Map<string, (x: Float32Array | null) => void>();
  frameListeners.add((_f, x) => meters.forEach((m) => m(x)));
  d.append(rows, detailsBody);

  /** Why a round ended early, by the gesture it was for, until the next round. */
  const problems = new Map<string, string>();

  const setDirection = (id: string, direction: TurnDir | 'none') => later(async () => {
    // Its old note, if it was set to none for a conflict, goes.
    const next: FaceSettings = { ...settings, gestures: settings.gestures.map((g) => { if (g.id !== id) return g; const { note: _note, ...rest } = g; return { ...rest, direction }; }) };
    // A gesture given a direction can conflict: it is the first to give way.
    commit(direction === 'none' ? next : settled(next, await trialsOfActive(next), id));
    render();
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
        later(() => { change(g.id, (x) => ({ ...x, name: text })); render(); });
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') { e.stopPropagation(); show(); } });
      cell.replaceChildren(input, button('OK', ok, 'primary'), button('Cancel', show, 'quiet'));
      input.focus();
      input.select();
    };
    show();
    return cell;
  };

  /* ---------- a gesture's details ---------- */

  /** The gesture whose details are shown, if any, and what they made. */
  let viewId: string | undefined;
  let details: Details | undefined;

  /** What shows: the list or a gesture's details. */
  const applyView = () => {
    rows.hidden = !!viewId;
    buttons.hidden = !!viewId;
    hold.hidden = !!viewId;
    headSlot.hidden = !viewId;
    detailsBody.hidden = !viewId;
  };

  /** Show the list again, or a gesture's details again. */
  const render = () => {
    if (!viewId || !settings.gestures.some((g) => g.id === viewId)) {
      details?.dispose();
      details = undefined;
      viewId = undefined;
      applyView();
      renderRows();
      return;
    }
    const id = viewId;
    later(async () => {
      const g = settings.gestures.find((x) => x.id === id);
      if (!g) return render();
      const trials = await loadTrials(id);
      const scrolled = d.scrollTop;
      // Where a handle had the focus, it keeps it (the keys fit again at each step).
      const focused = (document.activeElement as HTMLElement | null)?.dataset?.focus;
      details?.dispose();
      details = openDetails(host, g, trials);
      headSlot.replaceChildren(details.header);
      detailsBody.replaceChildren(details.body);
      viewId = id;
      applyView();
      if (focused) detailsBody.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus();
      d.scrollTop = scrolled;
    });
  };
  const showDetails = (id: string) => { viewId = id; render(); };

  /** Ask before `ok`, over the dialog (which stays). */
  const confirm = (title: string, text: string, label: string, ok: () => void) => {
    const { dialog, close } = showOnTop(title);
    dialog.append(el('p', '', text), buttonRow(button('Cancel', close), button(label, () => { close(); ok(); }, 'danger')));
  };

  /** What each gesture's trials panel shows, until the dialog closes. */
  const shownOf = new Map<string, Shown>();

  /** Fit a gesture again from its enabled trials, after `edit`, settle the conflicts with it first to give way, and show it again. */
  async function refitNow(id: string, edit?: (g: Gesture) => Gesture, keepOn = false) {
    const cur = settings.gestures.find((x) => x.id === id);
    if (!cur) return;
    const g = edit ? edit(cur) : cur;
    const trials = await loadTrials(id);
    const fitted: FaceSettings = { ...settings, gestures: settings.gestures.map((x) => (x.id === id ? { ...withFit(g, buildFit(trials, g.channels)), ...(keepOn && g.on !== undefined ? { on: g.on } : {}) } : x)) };
    commit(settled(fitted, await trialsOfActive(fitted), id));
    render();
  }

  const host: DetailsHost = {
    frames: frameListeners,
    hold: () => settings.hold,
    nameCell: (g) => nameCell(g),
    setDirection,
    deleteGesture: (g) => confirm(`Delete “${g.name}”?`, 'Its trials are deleted with it.', 'Delete', () => later(async () => {
      commit({ ...settings, gestures: settings.gestures.filter((x) => x.id !== g.id) });
      await deleteTrials(g.id);
      render();
    })),
    change: (id, to, soon) => change(id, to, soon),
    refit: (id, edit, keepOn) => later(() => refitNow(id, edit, keepOn)),
    disableTrial: (id, index, disabled) => later(async () => {
      await setTrialDisabled(id, index, disabled);
      await refitNow(id);
    }),
    deleteDisabled: (id) => later(async () => {
      await deleteDisabledTrials(id);
      await refitNow(id);
    }),
    confirm,
    refresh: () => render(),
    shown: { get: (id) => shownOf.get(id) ?? 'strength', set: (id, shown) => { shownOf.set(id, shown); } },
    tryTemplate: (id, template) => watcher.setGestures(activeOf(settings).map((a) => (a.id === id && template ? { ...a, template } : a))),
    record: (g) => startRecording(g),
    problemOf: (id) => problems.get(id),
    back: () => { viewId = undefined; render(); },
  };

  const renderRows = () => {
    rows.replaceChildren();
    meters.clear();
    if (loaded && !settings.gestures.length) rows.append(el('p', 'hint', 'No gestures yet. Add one, and record yourself doing it.'));
    for (const g of listOrder(settings.gestures)) {
      const fitted = isFitted(g);
      const row = el('div', fitted ? 'face-row' : 'face-row unfitted');
      const status = statusOf(g);
      const record = button('Record', () => startRecording(g));
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
        row.addEventListener('click', (e) => { if (!(e.target as Element).closest('button, select, input, .face-meter')) showDetails(g.id); });
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

  let recordingScreen: RecordingScreen | undefined;
  let asking: { close(): void } | undefined;

  /** Record trials of `g`: ask which page to play over, then record until a tap; nothing turns meanwhile. */
  function startRecording(g: Gesture) {
    problems.delete(g.id);
    readyTones();
    asking = playFrom(g.name, (page) => {
      asking = undefined;
      watcher.setGestures([]);
      recordingScreen = recordUntilTapped({
        name: g.name,
        page,
        frames: frameListeners,
        done: (trials, why) => {
          recordingScreen = undefined;
          watcher.setGestures(activeOf(settings));
          later(async () => {
            if (trials.length) {
              const all = [...await loadTrials(g.id), ...trials];
              await saveTrials(g.id, all);
              // Fitted again from all its enabled trials, its On back to the fitted one, and it is the first to give way.
              const fitted: FaceSettings = { ...settings, gestures: settings.gestures.map((x) => (x.id === g.id ? withFit(x, buildFit(all, x.channels)) : x)) };
              commit(settled(fitted, await trialsOfActive(fitted), g.id));
            } else commit(settings);
            if (why) problems.set(g.id, why);
            render();
          });
        },
      });
    });
  }

  whenOverlayCloses(() => {
    recordingScreen?.stop();
    asking?.close();
    watcher.stop();
    // An On still being dragged is saved now.
    if (saving) save(false);
    // What a recording just kept is saved first.
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
