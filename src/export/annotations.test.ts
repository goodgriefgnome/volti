import * as lib from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Drawing } from '../markings/draw';
import { drawMarkings } from '../markings/model';
import type { Stroke } from '../markings/stroke';
import { annotate, PdfDrawing, rgb } from './annotations';

const W = 600, H = 800;
const pen: Stroke = { tool: 'pen', color: '#c2271d', size: 0.002, points: [[0.1, 0.1, 0], [0.2, 0.1, 1], [0.3, 0.2, 0.5]] };
const highlight: Stroke = { tool: 'highlighter', color: '#ffd400', size: 0.018, points: [[0.1, 0.5, 1], [0.6, 0.5, 1], [0.1, 0.52, 1]] };
const whole = (draw: Drawing) => ({ draw, w: W, h: H, ox: 0, oy: 0 });

async function exported(...strokes: Stroke[]) {
  const doc = await lib.PDFDocument.create();
  const page = doc.addPage([W, H]);
  strokes.forEach((s, i) => annotate(lib, doc, page, s, whole, `m${i}`));
  const back = await lib.PDFDocument.load(await doc.save());
  const annots = back.getPage(0).node.Annots()!;
  return Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, lib.PDFDict));
}

describe('PdfDrawing', () => {
  it('draws a pen stroke segment by segment, each as wide as its pressure, y turned upwards', () => {
    const d = new PdfDrawing(lib, H);
    drawMarkings(whole(d), [pen]);
    const ops = d.ops.map(String);
    expect(ops).toContain('60 720 m');
    // 0.2% of the page width, from 0.35x at no pressure to 1.65x at full: the segments' means.
    expect(ops.filter((o) => o.endsWith(' w'))).toEqual(['1.2 w', '1.59 w']);
    expect(ops.some((o) => o.endsWith('gs'))).toBe(false);
  });
  it('puts a see-through, darken-only line in a graphics state, shared by lines that look alike', () => {
    const d = new PdfDrawing(lib, H);
    const look = { color: '#ffd400', opacity: 0.35, multiply: true };
    d.path([[0, 0], [10, 10]], 5, look);
    d.path([[0, 0], [10, 20]], 5, look);
    expect([...d.states.keys()]).toEqual(['G0']);
    expect(d.ops.map(String).filter((o) => o.includes('gs'))).toEqual(['/G0 gs', '/G0 gs']);
  });
  it('reaches as far as its lines, ends and all', () => {
    const d = new PdfDrawing(lib, H);
    d.path([[100, 100]], 10, { color: '#000000', opacity: 1, multiply: false });
    expect(d.rect()).toEqual([95, 695, 105, 705]);
  });
});

describe('annotate', () => {
  it('adds an Ink annotation with its own appearance, flagged to print', async () => {
    const [a] = await exported(pen);
    expect(a.get(lib.PDFName.of('Subtype'))).toEqual(lib.PDFName.of('Ink'));
    expect(a.lookup(lib.PDFName.of('F'), lib.PDFNumber).asNumber()).toBe(4);
    expect(a.lookup(lib.PDFName.of('NM'), lib.PDFString).decodeText()).toBe('m0');
    expect(a.lookup(lib.PDFName.of('C'), lib.PDFArray).asArray().map((n) => (n as lib.PDFNumber).asNumber())).toEqual(rgb('#c2271d'));
    const ink = a.lookup(lib.PDFName.of('InkList'), lib.PDFArray).lookup(0, lib.PDFArray).asArray().map((n) => (n as lib.PDFNumber).asNumber());
    expect(ink).toEqual([60, 720, 120, 720, 180, 640]);
    const ap = a.lookup(lib.PDFName.of('AP'), lib.PDFDict).lookup(lib.PDFName.of('N'), lib.PDFStream);
    const rect = a.lookup(lib.PDFName.of('Rect'), lib.PDFArray).asArray().map(String);
    expect(ap.dict.lookup(lib.PDFName.of('BBox'), lib.PDFArray).asArray().map(String)).toEqual(rect);
    expect(ap.dict.get(lib.PDFName.of('Subtype'))).toEqual(lib.PDFName.of('Form'));
  });
  it('makes a highlighter see-through and darken-only', async () => {
    const [, h] = await exported(pen, highlight);
    const ap = h.lookup(lib.PDFName.of('AP'), lib.PDFDict).lookup(lib.PDFName.of('N'), lib.PDFStream);
    const gs = ap.dict.lookup(lib.PDFName.of('Resources'), lib.PDFDict).lookup(lib.PDFName.of('ExtGState'), lib.PDFDict).lookup(lib.PDFName.of('G0'), lib.PDFDict);
    expect(gs.get(lib.PDFName.of('BM'))).toEqual(lib.PDFName.of('Multiply'));
    expect(gs.lookup(lib.PDFName.of('ca'), lib.PDFNumber).asNumber()).toBe(0.35);
  });
});
