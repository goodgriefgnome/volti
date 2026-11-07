// The face gestures and their settings: which gestures there are, what each measures, the settings
// stored for each and the defaults. Pure: no DOM, no camera, no storage (face/store.ts stores them).

export type FaceGesture = 'winkLeft' | 'winkRight' | 'longBlink' | 'mouthLeft' | 'mouthRight' | 'headLeft' | 'headRight' | 'nodDown';
export type TurnDir = 'next' | 'prev';

/** Each gesture, in the order the settings show them, with its name and what it measures. */
export const GESTURES: readonly { id: FaceGesture; name: string; kind: 'score' | 'angle' }[] = [
  { id: 'winkLeft', name: 'Wink left', kind: 'score' },
  { id: 'winkRight', name: 'Wink right', kind: 'score' },
  { id: 'longBlink', name: 'Long blink', kind: 'score' },
  { id: 'mouthLeft', name: 'Mouth to the left', kind: 'score' },
  { id: 'mouthRight', name: 'Mouth to the right', kind: 'score' },
  { id: 'headLeft', name: 'Head to the left', kind: 'angle' },
  { id: 'headRight', name: 'Head to the right', kind: 'angle' },
  { id: 'nodDown', name: 'Nod down', kind: 'angle' },
];

export interface GestureTune {
  direction: TurnDir | 'none';
  /** The on level (shown as **On**): a score (0.05–0.95) or, for the head and nod, an angle in degrees (5–45). */
  threshold: number;
  /** The level the signal must fall under to let go once on: in the threshold's range, never over it. */
  release: number;
  /** ms, 100–1500. */
  hold: number;
}
export type FaceSettings = Record<FaceGesture, GestureTune>;

export const HOLD_RANGE = { min: 100, max: 1500 } as const;
/** The range of a gesture's threshold: scores, or degrees for the head and nod. */
export function thresholdRange(g: FaceGesture): { min: number; max: number } {
  return kindOf(g) === 'angle' ? { min: 5, max: 45 } : { min: 0.05, max: 0.95 };
}

const kindOf = (g: FaceGesture) => GESTURES.find((x) => x.id === g)!.kind;

const tune = (threshold: number, hold = 250): GestureTune => ({ direction: 'none', threshold, release: threshold / 2, hold });

export const DEFAULT_FACE_SETTINGS: FaceSettings = {
  winkLeft: tune(0.5),
  winkRight: tune(0.5),
  longBlink: tune(0.5, 700),
  mouthLeft: tune(0.5),
  mouthRight: tune(0.5),
  headLeft: tune(20),
  headRight: tune(20),
  nodDown: tune(15),
};

/** Whether any gesture turns a page. */
export function hasGestures(s: FaceSettings): boolean {
  return GESTURES.some((g) => s[g.id].direction !== 'none');
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;

/** Stored settings with every gesture present and every value in its range; missing ones are the defaults. */
export function faceSettingsFrom(stored: unknown): FaceSettings {
  const from = (stored && typeof stored === 'object' ? stored : {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as FaceSettings;
  for (const { id } of GESTURES) {
    const d = DEFAULT_FACE_SETTINGS[id];
    const s = from[id] && typeof from[id] === 'object' ? from[id]! : {};
    const r = thresholdRange(id);
    const threshold = num(s.threshold, d.threshold, r.min, r.max);
    out[id] = {
      direction: s.direction === 'next' || s.direction === 'prev' ? s.direction : 'none',
      threshold,
      // A missing release is half the on level; one over the on level stops at it.
      release: Math.min(threshold, num(s.release, threshold / 2, r.min, r.max)),
      hold: num(s.hold, d.hold, HOLD_RANGE.min, HOLD_RANGE.max),
    };
  }
  return out;
}

/** A tune with new levels, kept in range and with release never over threshold: a threshold
 *  moved under release takes release down with it; a release moved over threshold stops there. */
export function withLevels(g: FaceGesture, t: GestureTune, to: { threshold?: number; release?: number }): GestureTune {
  const r = thresholdRange(g);
  const threshold = clamp(to.threshold ?? t.threshold, r.min, r.max);
  const release = Math.min(threshold, clamp(to.release ?? t.release, r.min, r.max));
  return { ...t, threshold, release };
}

/** One frame: the blendshape scores by name, and the head's angles in degrees. */
export interface FaceFrame { scores: Record<string, number>; yaw: number; pitch: number }

/** A gesture's signal in a frame: what its meter shows and its levels compare against. */
export function measure(g: FaceGesture, f: FaceFrame): number {
  const s = f.scores;
  switch (g) {
    case 'winkLeft': return Math.max(0, (s.eyeBlinkLeft ?? 0) - (s.eyeBlinkRight ?? 0));
    case 'winkRight': return Math.max(0, (s.eyeBlinkRight ?? 0) - (s.eyeBlinkLeft ?? 0));
    case 'longBlink': return Math.min(s.eyeBlinkLeft ?? 0, s.eyeBlinkRight ?? 0);
    case 'mouthLeft': return s.mouthLeft ?? 0;
    case 'mouthRight': return s.mouthRight ?? 0;
    // Yaw is positive when the head is turned to the person's left (the test page's "Head to your left").
    case 'headLeft': return f.yaw;
    case 'headRight': return -f.yaw;
    case 'nodDown': return f.pitch;
  }
}
