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
  /** A score (0.05–0.95) or, for the head and nod, an angle in degrees (5–45). */
  threshold: number;
  /** ms, 100–1500. */
  hold: number;
  /** Winks only: the other eye's score must be under this (0.05–0.9). */
  otherBelow?: number;
}
export type FaceSettings = Record<FaceGesture, GestureTune>;

export const HOLD_RANGE = { min: 100, max: 1500 } as const;
export const OTHER_RANGE = { min: 0.05, max: 0.9 } as const;
/** The range of a gesture's threshold: scores, or degrees for the head and nod. */
export function thresholdRange(g: FaceGesture): { min: number; max: number } {
  return kindOf(g) === 'angle' ? { min: 5, max: 45 } : { min: 0.05, max: 0.95 };
}

const kindOf = (g: FaceGesture) => GESTURES.find((x) => x.id === g)!.kind;
const isWink = (g: FaceGesture) => g === 'winkLeft' || g === 'winkRight';

const tune = (threshold: number, hold = 250, otherBelow?: number): GestureTune =>
  ({ direction: 'none', threshold, hold, ...(otherBelow === undefined ? {} : { otherBelow }) });

export const DEFAULT_FACE_SETTINGS: FaceSettings = {
  winkLeft: tune(0.5, 250, 0.3),
  winkRight: tune(0.5, 250, 0.3),
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
    out[id] = {
      direction: s.direction === 'next' || s.direction === 'prev' ? s.direction : 'none',
      threshold: num(s.threshold, d.threshold, r.min, r.max),
      hold: num(s.hold, d.hold, HOLD_RANGE.min, HOLD_RANGE.max),
      ...(d.otherBelow === undefined ? {} : { otherBelow: num(s.otherBelow, d.otherBelow, OTHER_RANGE.min, OTHER_RANGE.max) }),
    };
  }
  return out;
}

/** One frame: the blendshape scores by name, and the head's angles in degrees. */
export interface FaceFrame { scores: Record<string, number>; yaw: number; pitch: number }

/** How far a gesture is on in a frame, for its meter and calibration: its score, or its angle. */
export function measure(g: FaceGesture, f: FaceFrame): number {
  const s = f.scores;
  switch (g) {
    case 'winkLeft': return s.eyeBlinkLeft ?? 0;
    case 'winkRight': return s.eyeBlinkRight ?? 0;
    case 'longBlink': return Math.min(s.eyeBlinkLeft ?? 0, s.eyeBlinkRight ?? 0);
    case 'mouthLeft': return s.mouthLeft ?? 0;
    case 'mouthRight': return s.mouthRight ?? 0;
    // Yaw is positive when the head is turned to the person's left (the test page's "Head to your left").
    case 'headLeft': return f.yaw;
    case 'headRight': return -f.yaw;
    case 'nodDown': return f.pitch;
  }
}

/** A wink's other eye's score in a frame; undefined for the other gestures. */
export function otherEye(g: FaceGesture, f: FaceFrame): number | undefined {
  if (!isWink(g)) return undefined;
  return f.scores[g === 'winkLeft' ? 'eyeBlinkRight' : 'eyeBlinkLeft'] ?? 0;
}
