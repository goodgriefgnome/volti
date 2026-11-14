// The face gestures the person defines and their settings: a gesture's name, direction, hold and
// levels, the fit its trials gave, and what can turn a page. Pure: no DOM, no camera, no storage
// (face/store.ts stores them).

import { FIT_VERSION, type Fit, type Flag } from './_fit';
import type { Limit, Row, Template } from './_template';

export type TurnDir = 'next' | 'prev';

export interface Gesture {
  id: string;
  name: string;
  direction: TurnDir | 'none';
  /** ms, 100–1500. */
  hold: number;
  /** The levels moved by hand; none is the fit's. */
  on?: number;
  release?: number;
  /** Why it was set to none, in words. */
  note?: string;
  fit: Fit;
}
export interface FaceSettings { gestures: Gesture[] }

export const NO_GESTURES: FaceSettings = { gestures: [] };
export const HOLD_RANGE = { min: 100, max: 1500 } as const;
export const HOLD_DEFAULT = 250;
export const LEVEL_RANGE = { min: 0.05, max: 0.95 } as const;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A new gesture, set to next, with no trials. */
export function newGesture(name: string): Gesture {
  return { id: crypto.randomUUID(), name, direction: 'next', hold: HOLD_DEFAULT, fit: { version: FIT_VERSION, trials: 0, flags: [{ kind: 'tooFew' }] } };
}

/** A gesture given the fit its trials now give: the levels moved by hand and why it was set to none are dropped. */
export function withFit(g: Gesture, fit: Fit): Gesture {
  const { on: _on, release: _release, note: _note, ...rest } = g;
  return { ...rest, fit };
}

/** A gesture's levels: by hand, else the fit's; undefined when it isn't fitted. Release is never over on. */
export function levelsOf(g: Gesture): { on: number; release: number; hold: number } | undefined {
  const { template, on, release } = g.fit;
  if (!template || on === undefined || release === undefined) return undefined;
  const o = g.on ?? on;
  return { on: o, release: Math.min(o, g.release ?? release), hold: g.hold };
}

/** A gesture with new levels by hand, kept in range and with release never over on: moving on under release takes release down too. */
export function withLevels(g: Gesture, to: { on?: number; release?: number }): Gesture {
  const now = levelsOf(g);
  if (!now) return g;
  const on = clamp(to.on ?? now.on, LEVEL_RANGE.min, LEVEL_RANGE.max);
  const release = Math.min(on, clamp(to.release ?? now.release, LEVEL_RANGE.min, LEVEL_RANGE.max));
  return { ...g, on, release };
}

/** A gesture that can turn a page, as the detector takes it. */
export interface Active { id: string; direction: TurnDir; on: number; release: number; hold: number; template: Template }

/** The gestures that can turn a page: fitted, with a direction. */
export function activeOf(s: FaceSettings): Active[] {
  const out: Active[] = [];
  for (const g of s.gestures) {
    const l = levelsOf(g);
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

/** A stored fit, or undefined when it isn't one. One of an earlier version is read as its version and trials only: loading fits it again from the trials. */
function fitFrom(v: unknown): Fit | undefined {
  if (!isObject(v) || !isNum(v.version) || !isNum(v.trials) || !Array.isArray(v.flags)) return undefined;
  if (v.version !== FIT_VERSION) return { version: v.version, trials: v.trials, flags: [] };
  const flags = v.flags.filter((f): f is Flag => isObject(f) && FLAGS.includes(f.kind as string));
  const fit: Fit = { version: v.version, trials: v.trials, flags };
  if (Array.isArray(v.missed)) fit.missed = v.missed.filter(rowOk);
  if (v.template !== undefined) {
    const t = v.template;
    if (!isObject(t) || !Array.isArray(t.rows) || !Array.isArray(t.limits) || !Array.isArray(t.missed)) return undefined;
    if (!isNum(v.on) || !isNum(v.release) || !isNum(v.rest) || !Array.isArray(v.peaks)) return undefined;
    fit.template = { rows: t.rows.filter(rowOk), limits: t.limits.filter(limitOk), missed: t.missed.filter(rowOk) };
    fit.on = v.on;
    fit.release = v.release;
    fit.rest = v.rest;
    fit.peaks = v.peaks.filter(isNum);
  }
  return fit;
}

/**
 * Stored settings made safe: not an object, or without a gestures list, is NO_GESTURES (so is the
 * eight built-in gestures' shape); a gesture without an id, a name or a fit is dropped; values out
 * of range are clamped.
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
      hold: num(s.hold, HOLD_DEFAULT, HOLD_RANGE.min, HOLD_RANGE.max),
      fit,
    };
    const on = optional(s.on, LEVEL_RANGE.min, LEVEL_RANGE.max);
    const release = optional(s.release, LEVEL_RANGE.min, LEVEL_RANGE.max);
    if (on !== undefined) g.on = on;
    if (release !== undefined) g.release = release;
    if (typeof s.note === 'string') g.note = s.note;
    gestures.push(g);
  }
  return { gestures };
}

/** One frame: the blendshape scores by name, and the head's angles in degrees. */
export interface FaceFrame { scores: Record<string, number>; yaw: number; pitch: number }
