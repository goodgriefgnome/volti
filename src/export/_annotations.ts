// Markings in an exported PDF, as annotations: each placed as the reader places it, carrying its own
// appearance drawn in vector operators (as it shows on screen, pen pressure and all), so other PDF
// apps show it as drawn and can hide or delete it.

import type { PDFContext, PDFDocument, PDFOperator, PDFPage } from 'pdf-lib';
import { annotationOf, drawMarkings, type DrawTarget, type Marking } from '../markings/model';
import { type Drawing, type Look, type Paint, type PathCmd } from '../markings/draw';

type PdfLib = typeof import('pdf-lib');

/** '#rrggbb' as PDF colour components, 0 to 1. */
export const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 1000) / 1000) as [number, number, number];

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Drawing as PDF operators, on a page `height` points tall: y is turned upwards. It notes how far
 * the drawing reaches, and the graphics states its see-through and darken-only lines need.
 */
export class PdfDrawing implements Drawing {
  readonly ops: PDFOperator[] = [];
  /** Graphics states used, by name. */
  readonly states = new Map<string, Look>();
  private box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  constructor(private lib: PdfLib, private height: number) {}

  path(points: readonly (readonly [number, number])[], width: number, look: Look) {
    const { lib } = this;
    const pts = points.map(([x, y]) => [round(x), round(this.height - y)] as const);
    const r = width / 2;
    for (const [x, y] of pts) {
      this.box = { x0: Math.min(this.box.x0, x - r), y0: Math.min(this.box.y0, y - r), x1: Math.max(this.box.x1, x + r), y1: Math.max(this.box.y1, y + r) };
    }
    this.ops.push(lib.pushGraphicsState());
    if (look.opacity < 1 || look.multiply) this.ops.push(lib.setGraphicsState(this.state(look)));
    this.ops.push(
      lib.setStrokingRgbColor(...rgb(look.color)),
      lib.setLineWidth(round(width)),
      lib.setLineCap(lib.LineCapStyle.Round),
      lib.setLineJoin(lib.LineJoinStyle.Round),
      lib.moveTo(...pts[0]),
      // One point is a dot: a line of no length, with round ends.
      ...(pts.length > 1 ? pts.slice(1) : pts).map(([x, y]) => lib.lineTo(x, y)),
      lib.stroke(),
      lib.popGraphicsState(),
    );
  }

  shape(cmds: readonly PathCmd[], paint: Paint) {
    const { lib } = this;
    const look = 'fill' in paint ? paint.fill : paint.stroke;
    const r = 'fill' in paint ? 0 : paint.width / 2;
    const ops: PDFOperator[] = [];
    // Each coordinate pair of a command, turned to the page's y.
    const pt = (x: number, y: number) => {
      const p = [round(x), round(this.height - y)] as const;
      this.box = { x0: Math.min(this.box.x0, p[0] - r), y0: Math.min(this.box.y0, p[1] - r), x1: Math.max(this.box.x1, p[0] + r), y1: Math.max(this.box.y1, p[1] + r) };
      return p;
    };
    for (const c of cmds) {
      if (c[0] === 'M') ops.push(lib.moveTo(...pt(c[1], c[2])));
      else if (c[0] === 'L') ops.push(lib.lineTo(...pt(c[1], c[2])));
      else if (c[0] === 'C') ops.push(lib.appendBezierCurve(...pt(c[1], c[2]), ...pt(c[3], c[4]), ...pt(c[5], c[6])));
      else ops.push(lib.closePath());
    }
    this.ops.push(lib.pushGraphicsState());
    if (look.opacity < 1 || look.multiply) this.ops.push(lib.setGraphicsState(this.state(look)));
    if ('fill' in paint) this.ops.push(lib.setFillingRgbColor(...rgb(look.color)), ...ops, lib.fill());
    else {
      this.ops.push(
        lib.setStrokingRgbColor(...rgb(look.color)),
        lib.setLineWidth(round(paint.width)),
        lib.setLineCap(lib.LineCapStyle.Round),
        lib.setLineJoin(lib.LineJoinStyle.Round),
        ...ops,
        lib.stroke(),
      );
    }
    this.ops.push(lib.popGraphicsState());
  }

  private state(look: Look): string {
    for (const [name, l] of this.states) if (l.opacity === look.opacity && l.multiply === look.multiply) return name;
    const name = `G${this.states.size}`;
    this.states.set(name, look);
    return name;
  }

  /** Where the drawing reaches, [x0, y0, x1, y1] in points: never less than a point across. */
  rect(): [number, number, number, number] {
    const { x0, y0, x1, y1 } = this.box;
    return [Math.floor(x0), Math.floor(y0), Math.max(Math.ceil(x1), Math.floor(x0) + 1), Math.max(Math.ceil(y1), Math.floor(y0) + 1)];
  }

  /** The resources the operators use. */
  resources(context: PDFContext) {
    const states = Object.fromEntries([...this.states].map(([name, l]) => [name, context.obj({
      Type: 'ExtGState', CA: l.opacity, ca: l.opacity, ...(l.multiply ? { BM: 'Multiply' } : {}),
    })]));
    return context.obj(this.states.size ? { ExtGState: states } : {});
  }
}

/**
 * Add a marking to the page as an annotation. `place` gives where it goes on the page, in points
 * from the top left, drawing with the given drawing; `name` is unique among the page's annotations.
 */
export function annotate(lib: PdfLib, doc: PDFDocument, page: PDFPage, m: Marking, place: (draw: Drawing) => DrawTarget, name: string) {
  const H = page.getHeight();
  const drawing = new PdfDrawing(lib, H);
  const t = place(drawing);
  drawMarkings(t, [m]);
  if (!drawing.ops.length) return;
  const { context } = doc;
  const rect = drawing.rect();
  const appearance = context.formXObject(drawing.ops, { BBox: rect, Resources: drawing.resources(context) });
  const a = annotationOf(t, m);
  const annotation = context.obj({
    Type: 'Annot',
    Subtype: a.subtype,
    Rect: rect,
    InkList: a.paths.map((path) => path.flatMap(([x, y]) => [round(x), round(H - y)])),
    C: rgb(a.color),
    BS: { W: round(a.width) },
    F: 4, // print
    NM: lib.PDFString.of(name),
    AP: { N: context.register(appearance) },
  });
  page.node.addAnnot(context.register(annotation));
}
