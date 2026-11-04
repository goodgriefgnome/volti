import { describe, expect, it } from 'vitest';
import { _fromVersion1, _isVersion1, type V1Cut, type V1Score } from './_version1';
import { _line, _mark } from './testing';

const c = (id: string, page: number, extra: Partial<V1Cut> = {}): V1Cut => ({ id, page, y0: 0, y1: 1, ...extra });

describe('_fromVersion1', () => {
  it('puts each cut’s markings on its page, in played order', () => {
    const a = _mark(0.5, 0.2), b = _mark(0.5, 0.7), d = _line(0.1, 0.2);
    const score: V1Score = { cuts: [c('c1', 0, { y1: 0.5 }), c('c2', 1), c('c3', 0, { y0: 0.5 })], archived: [] };
    const { ink } = _fromVersion1(score, { c1: [a], c2: [d], c3: [b] });
    expect(ink).toEqual({ 0: [a, b], 1: [d] });
  });
  it('puts an archived cut’s markings after the played cuts’ on its page', () => {
    const a = _mark(0.5, 0.2), b = _mark(0.5, 0.7);
    const score: V1Score = { cuts: [c('c1', 0)], archived: [c('c0', 0, { ownInk: true })] };
    expect(_fromVersion1(score, { c0: [b], c1: [a] }).ink).toEqual({ 0: [a, b] });
  });
  it('keeps one of markings that are exactly the same, and both of two that differ', () => {
    const score: V1Score = { cuts: [c('c1', 0), c('c2', 0)], archived: [] };
    expect(_fromVersion1(score, { c1: [_mark(0.5, 0.2)], c2: [_mark(0.5, 0.2)] }).ink).toEqual({ 0: [_mark(0.5, 0.2)] });
    const other = _line(0.1, 0.3);
    expect(_fromVersion1(score, { c1: [_line(0.1, 0.2)], c2: [other] }).ink).toEqual({ 0: [_line(0.1, 0.2), other] });
  });
  it('drops ink under an id that no cut has', () => {
    const score: V1Score = { cuts: [c('c1', 0)], archived: [] };
    expect(_fromVersion1(score, { gone: [_mark(0.5, 0.2)] }).ink).toEqual({});
  });
  it('drops archived cuts, ownInk and stores no pass, and carries the other fields over', () => {
    const excerpts = [{ first: 'c1', name: 'A' }];
    const score: V1Score = { key: 'D', excerpts, symbolSize: 0.04, cuts: [c('c1', 0, { ownInk: true, pad: 0.1 })], archived: [c('c2', 1)] };
    const result = _fromVersion1(score, {}).score;
    expect(result).toEqual({ key: 'D', excerpts, symbolSize: 0.04, cuts: [{ id: 'c1', page: 0, y0: 0, y1: 1, pad: 0.1 }] });
    expect('archived' in result).toBe(false);
  });
  it('gives no ink for a score without any', () => {
    expect(_fromVersion1({ cuts: [c('c1', 0)], archived: [] }, undefined).ink).toEqual({});
  });
});

describe('_isVersion1', () => {
  it('is true with archived cuts, or ink kept by cut id', () => {
    expect(_isVersion1({ cuts: [], archived: [] }, undefined)).toBe(true);
    expect(_isVersion1({ cuts: [] }, { c1: [] })).toBe(true);
  });
  it('is false with no archived cuts and ink by page, or no ink', () => {
    expect(_isVersion1({ cuts: [] }, { 0: [], 12: [] })).toBe(false);
    expect(_isVersion1({ cuts: [] }, undefined)).toBe(false);
  });
});
