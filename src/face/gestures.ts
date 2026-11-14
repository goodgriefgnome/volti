// The face gestures the person defines and their settings: a gesture's name, direction, hold and
// levels, the fit its trials gave, and what can turn a page. Pure: no DOM, no camera, no storage
// (face/store.ts stores them).

import { FIT_VERSION, type Fit, type Flag } from './_fit';
import { CHANNELS, type Limit, type Row, type Template } from './_template';

export type TurnDir = 'next' | 'prev';

/** A gesture's channels as changed by hand, by channel name. */
export interface GestureChannels { forcedOff: string[]; forcedOn: string[] }

export interface Gesture {
  id: string;
  name: string;
  direction: TurnDir | 'none';
  /** On, moved by hand; none is the fit's. */
  on?: number;
  /** Why it was set to none, in words. */
  note?: string;
  /** Kept across recordings and changes to trials; none when none was changed. */
  channels?: GestureChannels;
  fit: Fit;
}
/** `hold` is one for every gesture (ms, 100–1500). */
export interface FaceSettings { hold: number; gestures: Gesture[] }

export const HOLD_RANGE = { min: 100, max: 1500 } as const;
export const HOLD_DEFAULT = 500;
export const NO_GESTURES: FaceSettings = { hold: HOLD_DEFAULT, gestures: [] };
export const LEVEL_RANGE = { min: 0.05, max: 0.95 } as const;
/** The zero point is never more than this share of the way from the rest level to On. */
export const ZERO_LIMIT_FRAC = 0.5;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A new gesture, set to next, with no trials. */
export function newGesture(name: string): Gesture {
  return { id: crypto.randomUUID(), name, direction: 'next', fit: { version: FIT_VERSION, trials: 0, flags: [{ kind: 'tooFew' }] } };
}

/** A gesture given the fit its trials now give: On moved by hand and why it was set to none are dropped. */
export function withFit(g: Gesture, fit: Fit): Gesture {
  const { on: _on, note: _note, ...rest } = g;
  return { ...rest, fit };
}

/** A gesture with On back at the fitted one. */
export function withoutOn(g: Gesture): Gesture {
  const { on: _on, ...rest } = g;
  return rest;
}

/**
 * A gesture's levels: On by hand, else the fit's; the zero point, where the ring's faint arc starts: the most strength a rest frame reached, but never
 * more than `ZERO_LIMIT_FRAC` of the way from the rest level to On (a fit without `restMax` has the
 * rest level); the hold as given. Undefined when it isn't fitted.
 */
export function levelsOf(g: Gesture, hold: number): { on: number; zero: number; hold: number } | undefined {
  const { template, on, rest, restMax } = g.fit;
  if (!template || on === undefined || rest === undefined) return undefined;
  const o = g.on ?? on;
  return { on: o, zero: Math.min(restMax ?? rest, rest + ZERO_LIMIT_FRAC * (o - rest)), hold };
}

/** A gesture with its channel changes edited by `to`; none are kept when nothing is left changed. */
export function withChannels(g: Gesture, to: (c: GestureChannels) => GestureChannels): Gesture {
  const c = to({ forcedOff: [...(g.channels?.forcedOff ?? [])], forcedOn: [...(g.channels?.forcedOn ?? [])] });
  const { channels: _old, ...rest } = g;
  return c.forcedOff.length || c.forcedOn.length ? { ...rest, channels: c } : rest;
}

/** A gesture with On moved by hand, kept in range. */
export function withLevels(g: Gesture, on: number): Gesture {
  return { ...g, on: clamp(on, LEVEL_RANGE.min, LEVEL_RANGE.max) };
}

/** A gesture that can turn a page, as the detector takes it. */
export interface Active { id: string; direction: TurnDir; on: number; zero: number; hold: number; template: Template }

/** The gestures that can turn a page: fitted, with a direction. */
export function activeOf(s: FaceSettings): Active[] {
  const out: Active[] = [];
  for (const g of s.gestures) {
    const l = levelsOf(g, s.hold);
    if (l && g.direction !== 'none') out.push({ id: g.id, direction: g.direction, template: g.fit.template!, ...l });
  }
  return out;
}

/** Whether any gesture can turn a page. */
export const hasGestures = (s: FaceSettings): boolean => activeOf(s).length > 0;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, fallback: number, min: number, max: number) => (isNum(v) ? clamp(v, min, max) : fallback);
const optional = (v: unknown, min: number, max: number) => (isNum(v) ? clamp(v, min, max) : undefined);

const FLAGS = ['tooFew', 'noChannels', 'unreliable', 'firesAtRest'];
const rowOk = (r: unknown): r is Row => isObject(r) && ['c', 'side', 'edge', 'far', 'rest', 'span', 'separation'].every((k) => isNum(r[k]));
const limitOk = (k: unknown): k is Limit => isObject(k) && ['c', 'side', 'limit', 'full', 'rest'].every((n) => isNum(k[n]));

/** Stored channel changes: the names that are channels (thresholds moved by hand, which there were once, are dropped); none when nothing is left. */
function channelsFrom(v: unknown): GestureChannels | undefined {
  if (!isObject(v)) return undefined;
  const names = (l: unknown) => (Array.isArray(l) ? [...new Set(l.filter((n): n is string => typeof n === 'string' && CHANNELS.includes(n)))] : []);
  const out = { forcedOff: names(v.forcedOff), forcedOn: names(v.forcedOn) };
  return out.forcedOff.length || out.forcedOn.length ? out : undefined;
}

/** A stored fit, or undefined when it isn't one. One of an earlier version is read as its version and trials only: loading fits it again from the trials. */
function fitFrom(v: unknown): Fit | undefined {
  if (!isObject(v) || !isNum(v.version) || !isNum(v.trials) || !Array.isArray(v.flags)) return undefined;
  if (v.version !== FIT_VERSION) return { version: v.version, trials: v.trials, flags: [] };
  const flags = v.flags.filter((f): f is Flag => isObject(f) && FLAGS.includes(f.kind as string));
  const fit: Fit = { version: v.version, trials: v.trials, flags };
  if (v.template !== undefined) {
    const t = v.template;
    if (!isObject(t) || !Array.isArray(t.rows) || !Array.isArray(t.limits)) return undefined;
    if (!isNum(v.on) || !isNum(v.rest) || !Array.isArray(v.peaks)) return undefined;
    fit.template = { rows: t.rows.filter(rowOk), limits: t.limits.filter(limitOk) };
    fit.on = v.on;
    fit.rest = v.rest;
    if (isNum(v.restMax)) fit.restMax = v.restMax;
    fit.peaks = v.peaks.filter(isNum);
  }
  return fit;
}

/**
 * Stored settings made safe: not an object, or without a gestures list, is NO_GESTURES (so is the
 * eight built-in gestures' shape); a gesture without an id, a name or a fit is dropped; values out
 * of range are clamped. The hold is the settings', 500 when missing; a gesture's own hold and
 * release, from before there was one hold, are ignored.
 */
export function faceSettingsFrom(stored: unknown): FaceSettings {
  if (!isObject(stored) || !Array.isArray(stored.gestures)) return NO_GESTURES;
  const gestures: Gesture[] = [];
  for (const s of stored.gestures) {
    if (!isObject(s) || typeof s.id !== 'string' || typeof s.name !== 'string') continue;
    const fit = fitFrom(s.fit);
    if (!fit) continue;
    const g: Gesture = {
      id: s.id,
      name: s.name,
      direction: s.direction === 'next' || s.direction === 'prev' ? s.direction : 'none',
      fit,
    };
    const on = optional(s.on, LEVEL_RANGE.min, LEVEL_RANGE.max);
    if (on !== undefined) g.on = on;
    if (typeof s.note === 'string') g.note = s.note;
    const channels = channelsFrom(s.channels);
    if (channels) g.channels = channels;
    gestures.push(g);
  }
  return { hold: num(stored.hold, HOLD_DEFAULT, HOLD_RANGE.min, HOLD_RANGE.max), gestures };
}

/** One frame: the blendshape scores by name, and the head's angles in degrees. */
export interface FaceFrame { scores: Record<string, number>; yaw: number; pitch: number }
