// The recording screen: the page recordings play over, shown whole-screen and still, with the
// instruction over its top; trials follow one another, each with its tones and the frames taken as
// the watcher gives them, until a tap anywhere stops it. What a trial is (its timetable, its
// frames) is _recording.ts's; this is the clock and the words.

import { el } from '../ui/dom';
import { planTrial, recorder, TONE_LONG_MS, TONE_MS, TONES, type Trial } from './_recording';
import { stopTones, tone } from './_tones';
import type { FaceFrame } from './gestures';

/** What takes each frame the watcher gives: its picture's scores, its channels (null without a face) and its time (ms). */
export type FrameListener = (f: FaceFrame | null, x: Float32Array | null, now: number) => void;

export interface RecordingScreen { stop(): void }

const NO_FACE = "Your face wasn't seen for most of that trial. Try again.";

export interface RecordingScreenOptions {
  name: string;
  /** The page to show, drawn to fit the screen. */
  page: HTMLCanvasElement;
  /** The dialog's frame listeners. */
  frames: Set<FrameListener>;
  /** The trials finished (perhaps none) and, when it ended early, why. */
  done(trials: Trial[], problem?: string): void;
}

/**
 * Record trials of a gesture over `page`: three seconds to start playing, then trial after trial,
 * each with its tones and its instruction, without end. A tap anywhere, or `stop`, ends it: the
 * trials finished are kept and the one under way is thrown away. A trial with too few held or rest
 * frames ends it there, with why.
 */
export function recordUntilTapped(o: RecordingScreenOptions): RecordingScreen {
  const screen = el('div', 'face-recording-screen');
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-label', `Recording “${o.name}”`);
  const picture = el('div', 'page');
  picture.append(o.page);
  const bar = el('div', 'bar');
  const instruction = el('p', 'instruction');
  const which = el('strong', '', `Recording “${o.name}”`);
  const second = el('span', '', 'Turn the sound on to hear the tones.');
  const info = el('div', 'info');
  info.append(which, second);
  bar.append(instruction, info);
  screen.append(picture, bar);
  document.body.append(screen);

  const trials: Trial[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let listener: FrameListener | undefined;
  let over = false;

  const kept = (trial: number) => {
    which.textContent = `Recording “${o.name}” · trial ${trial}`;
    second.textContent = `${trials.length} kept · tap anywhere to stop`;
  };

  /** Run `f` when the performance clock reaches `when` (ms). */
  const at = (when: number, f: () => void) => {
    const t = setTimeout(() => { timers.delete(t); f(); }, Math.max(0, when - performance.now()));
    timers.add(t);
  };
  const end = (problem?: string) => {
    if (over) return;
    over = true;
    timers.forEach(clearTimeout);
    timers.clear();
    if (listener) o.frames.delete(listener);
    stopTones();
    screen.remove();
    o.done(trials, problem);
  };
  screen.addEventListener('pointerdown', (e) => { e.preventDefault(); end(); });

  const trial = (k: number) => {
    kept(k);
    instruction.textContent = 'Keep playing. Wait for the rising tones.';
    const plan = planTrial(Math.random);
    const rec = recorder();
    const start = performance.now();
    // Every tone is scheduled now, by the audio clock; each comes back with when it will be heard.
    const length = (i: number) => (i === 2 ? TONE_LONG_MS : TONE_MS);
    const ups = TONES.map((f, i) => tone(f, plan.ups[i], length(i)));
    const downs = [...TONES].reverse().map((f, i) => tone(f, plan.downs[i], length(i)));
    if (listener) o.frames.delete(listener);
    listener = (f, x, now) => {
      if (f && x && now >= start) rec.push(now - start, x, f.yaw, f.pitch);
    };
    o.frames.add(listener);
    at(ups[0], () => { instruction.textContent = 'Ready: on the third tone'; });
    at(ups[2], () => { instruction.textContent = 'Hold it'; });
    at(downs[0], () => { instruction.textContent = 'Let go on the third tone'; });
    at(downs[2], () => { instruction.textContent = 'Let go. Keep playing.'; });
    at(start + plan.end, () => {
      const t = rec.finish(ups[2] - start, downs[2] - start);
      if (!t) return end(NO_FACE);
      trials.push(t);
      trial(trials.length + 1);
    });
  };

  // Before the first trial: three seconds to start playing.
  instruction.textContent = 'Start playing. The first trial starts in 3… 2… 1…';
  at(performance.now() + 3000, () => trial(1));
  return { stop: () => end() };
}
