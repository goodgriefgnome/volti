// What the Face gestures dialog works out from its data, before any of it is drawn: the order of the
// list, a gesture's status line, the numbers and trace of one trial in the trials panel, and the line
// that says which trials to blame for a gesture firing while resting. Pure: no DOM.

import { MIN_TRIALS } from './_fit';
import { STRIDE, framesOf, type Trial } from './_recording';
import { CHANNELS, median, quantile, strength, type Template } from './_template';
import { HOLD_DEFAULT, levelsOf, type Gesture } from './gestures';

/** Whether a gesture has the enabled trials it is fitted from. */
export const isFitted = (g: Gesture): boolean => g.fit.trials >= MIN_TRIALS;

/** The gestures as the list shows them: fitted first, then the others, each in the order added. */
export function listOrder(gestures: Gesture[]): Gesture[] {
  return [...gestures.filter(isFitted), ...gestures.filter((g) => !isFitted(g))];
}

const trialsText = (n: number) => `${n} ${n === 1 ? 'trial' : 'trials'}`;

/** A gesture's status line, or the words for one not fitted ("Record 2 more trials"). */
export function statusOf(g: Gesture): { text: string; warn: boolean } {
  const n = g.fit.trials;
  if (!isFitted(g)) {
    const more = MIN_TRIALS - n;
    return { text: `Record ${more} more ${more === 1 ? 'trial' : 'trials'}`, warn: false };
  }
  const flags = g.fit.flags;
  if (flags.some((f) => f.kind === 'noChannels')) return { text: "Can't be told from playing", warn: false };
  // The note says "Set to None: “X” also fires on it: its strength is…": the status is its first sentence.
  if (g.note) return { text: `Off: ${g.note.replace(/^Set to None: /, '').split(': ')[0]}`, warn: false };
  if (flags.some((f) => f.kind === 'firesAtRest')) return { text: `⚠ Fires while resting · ${trialsText(n)}`, warn: true };
  if (flags.some((f) => f.kind === 'unreliable')) return { text: `⚠ Unreliable · ${trialsText(n)}`, warn: true };
  return { text: trialsText(n), warn: false };
}

/** One trial's numbers and trace for the trials panel. `shown` is 'strength' or a channel index. */
export interface TrialView {
  /** Every frame, t in ms from the trial's start. */
  trace: { t: number; v: number }[];
  /** tUp, tDown. */
  held: [number, number];
  /** The two dashed levels. */
  levels: [number, number];
  /** Held, At rest (and Past, 0 to 1, for a channel). */
  numbers: number[];
  /** Which numbers are in the warning colour. */
  bad: boolean[];
  /** With strength shown: the t of each misfire (a rest frame whose strength reaches On). */
  misfires: number[];
}

/** Every frame of a trial: its time and its channels. */
function allFrames(t: Trial): { t: number; x: Float32Array }[] {
  const out: { t: number; x: Float32Array }[] = [];
  for (let i = 0; i < t.n; i++) out.push({ t: t.data[i * STRIDE], x: t.data.slice(i * STRIDE + 1, i * STRIDE + 1 + CHANNELS.length) });
  return out;
}

const NOTHING = (t: Trial): TrialView => ({ trace: [], held: [t.tUp, t.tDown], levels: [0, 0], numbers: [], bad: [], misfires: [] });

/** The share of `values` for which `past` holds. */
const share = (values: number[], past: (v: number) => boolean) => (values.length ? values.filter(past).length / values.length : 0);

export function trialView(trial: Trial, index: number, all: Trial[], g: Gesture, shown: 'strength' | number): TrialView {
  const template = g.fit.template;
  const levels = levelsOf(g, HOLD_DEFAULT);
  if (!template || !levels) return NOTHING(trial);
  const frames = allFrames(trial);
  const split = framesOf(trial);
  const view = { held: [trial.tUp, trial.tDown] as [number, number], misfires: [] as number[] };
  if (shown === 'strength') {
    // A trial's held strength is its peak against a fit without it; one left out of the fit has no such, so it is against the fit itself.
    const enabledIndex = all.slice(0, index).filter((t) => !t.disabled).length;
    const peak = trial.disabled ? median(split.held.map((x) => strength(template, x))) : g.fit.peaks?.[enabledIndex] ?? NaN;
    const atRest = quantile(split.rest.map((x) => strength(template, x)), 0.95);
    const misfires = split.rest.flatMap((x, i) => (strength(template, x) >= levels.on ? [split.restT[i]] : []));
    return { ...view, trace: frames.map((f) => ({ t: f.t, v: strength(template, f.x) })), levels: [levels.on, levels.release], numbers: [peak, atRest], bad: [peak < levels.on, atRest >= levels.release], misfires };
  }
  const c = shown;
  const row = template.rows.find((r) => r.c === c);
  const limit = template.limits.find((k) => k.c === c);
  const heldValues = split.held.map((x) => x[c]);
  const restValues = split.rest.map((x) => x[c]);
  const trace = frames.map((f) => ({ t: f.t, v: f.x[c] }));
  if (row) {
    const heldMedian = median(heldValues);
    const reach = quantile(restValues, row.side > 0 ? 0.9 : 0.1);
    const past = (v: number) => row.side * (v - row.edge) >= 0;
    return { ...view, trace, levels: [row.edge, row.rest], numbers: [heldMedian, reach, share(heldValues, past)], bad: [!past(heldMedian), past(reach), false] };
  }
  if (limit) {
    const heldMedian = median(heldValues);
    const reach = quantile(restValues, limit.side > 0 ? 0.9 : 0.1);
    const pastIt = (v: number) => limit.side * (v - limit.limit) > 0;
    return { ...view, trace, levels: [limit.limit, limit.full], numbers: [heldMedian, reach, share(heldValues, pastIt)], bad: [pastIt(heldMedian), false, false] };
  }
  return NOTHING(trial);
}

const list = (ns: number[]) => (ns.length < 2 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);

/** The rest frames of each enabled trial (by number, from 1) whose strength reaches the fitted On. */
function misfiresOf(template: Template, on: number, trials: Trial[]): Map<number, number> {
  const out = new Map<number, number>();
  trials.forEach((t, i) => {
    if (t.disabled) return;
    const n = framesOf(t).rest.filter((x) => strength(template, x) >= on).length;
    if (n) out.set(i + 1, n);
  });
  return out;
}

/** Which trials the fires-while-resting flag is to blame on, as the details' line says it. */
export function blameLine(g: Gesture, trials: Trial[]): string | undefined {
  const { template, on } = g.fit;
  if (!template || on === undefined || !g.fit.flags.some((f) => f.kind === 'firesAtRest')) return undefined;
  const hits = misfiresOf(template, on, trials);
  if (!hits.size) return undefined;
  const numbers = [...hits.keys()];
  const frames = [...hits.values()].reduce((a, b) => a + b, 0);
  const where = numbers.length === 1
    ? (frames === 1 ? `It is in trial ${numbers[0]}.` : `All ${frames} are in trial ${numbers[0]}.`)
    : `In trials ${list(numbers)}.`;
  const [what, they] = numbers.length === 1 ? ['it', 'it'] : ['them', 'they'];
  return `${where} Disable ${what} if ${they} went wrong; otherwise force off a channel that rest reaches, or move its threshold away from the hatching.`;
}

