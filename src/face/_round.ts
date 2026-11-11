// A round of trials recorded in the Face gestures dialog: the countdown, each trial's tones and the
// instruction that follows them, and the frames taken as the watcher gives them. What a trial is
// (its timetable, its frames) is _recording.ts's; this is the clock and the words.

import { planTrial, recorder, ROUND, TONE_LONG_MS, TONE_MS, TONES, type Trial } from './_recording';
import { stopTones, tone } from './_tones';
import type { FaceFrame } from './gestures';
import { button, el } from '../ui/dom';
import { buttonRow } from '../ui/overlay';

/** What takes each frame the watcher gives: its picture's scores, its channels (null without a face) and its time (ms). */
export type FrameListener = (f: FaceFrame | null, x: Float32Array | null, now: number) => void;

export interface Round { cancel(): void }

const NO_FACE = "Your face wasn't seen for most of that trial. Try again.";

/**
 * Record a round of trials into `panel`: counts down, plays each trial's tones, shows its
 * instruction, takes frames from `frames` (the dialog's frame listeners), and calls `done` with the
 * trials finished (perhaps none) and, when it ended early, why. Cancelling ends it with the trials
 * finished, and no reason.
 */
export function recordRound(panel: HTMLElement, frames: Set<FrameListener>, done: (trials: Trial[], problem?: string) => void): Round {
  const label = el('p', 'hint');
  const instruction = el('p', 'instruction');
  const sound = el('p', 'hint', 'Turn the sound on to hear the tones.');
  panel.replaceChildren(label, instruction, sound, buttonRow(button('Cancel', () => cancel(), 'quiet')));

  const trials: Trial[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let listener: FrameListener | undefined;
  let over = false;

  /** Run `f` when the performance clock reaches `at` (ms). */
  const at = (when: number, f: () => void) => {
    const t = setTimeout(() => { timers.delete(t); f(); }, Math.max(0, when - performance.now()));
    timers.add(t);
  };
  const stop = () => {
    over = true;
    timers.forEach(clearTimeout);
    timers.clear();
    if (listener) frames.delete(listener);
    stopTones();
  };
  const end = (problem?: string) => {
    if (over) return;
    stop();
    done(trials, problem);
  };
  function cancel() { end(); }

  const trial = (k: number) => {
    label.textContent = `Trial ${k} of ${ROUND}`;
    sound.hidden = true;
    instruction.textContent = 'Keep playing. Wait for the rising tones.';
    const plan = planTrial(Math.random);
    const rec = recorder();
    const start = performance.now();
    // Every tone is scheduled now, by the audio clock; each comes back with when it will be heard.
    const length = (i: number) => (i === 2 ? TONE_LONG_MS : TONE_MS);
    const ups = TONES.map((f, i) => tone(f, plan.ups[i], length(i)));
    const downs = [...TONES].reverse().map((f, i) => tone(f, plan.downs[i], length(i)));
    if (listener) frames.delete(listener);
    listener = (f, x, now) => {
      if (f && x && now >= start) rec.push(now - start, x, f.yaw, f.pitch);
    };
    frames.add(listener);
    at(ups[0], () => { instruction.textContent = 'Ready: on the third tone'; });
    at(ups[2], () => { instruction.textContent = 'Hold it'; });
    at(downs[0], () => { instruction.textContent = 'Let go on the third tone'; });
    at(downs[2], () => { instruction.textContent = 'Let go. Keep playing.'; });
    at(start + plan.end, () => {
      const t = rec.finish(ups[2] - start, downs[2] - start);
      if (!t) return end(NO_FACE);
      trials.push(t);
      if (trials.length >= ROUND) end();
      else trial(trials.length + 1);
    });
  };

  // Before the first trial: three seconds to start playing.
  instruction.textContent = 'Start playing. The first trial starts in 3… 2… 1…';
  at(performance.now() + 3000, () => trial(1));
  return { cancel };
}
