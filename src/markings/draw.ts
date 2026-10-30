// What markings are drawn with: a small drawing interface that the screen's canvas and an exported
// PDF annotation's appearance each implement, so each kind of marking is written once and exports
// as it shows.

/** How a line looks: its colour, how see-through it is, and whether it only darkens what is under it. */
export interface Look { color: string; opacity: number; multiply: boolean }

export const _SOLID = (color: string): Look => ({ color, opacity: 1, multiply: false });

/** A path of lines and cubic curves, in the drawing's units. */
export type PathCmd =
  | readonly ['M', number, number] | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number] | readonly ['Z'];

/** Filled (nonzero), or stroked `width` wide with round joins and ends. */
export type Paint = { fill: Look } | { stroke: Look; width: number };

/** Something markings can be drawn on, in its own units (pixels, or points), y downwards. */
export interface Drawing {
  /**
   * Lines through the points as one path, `width` wide, with round ends and joins; one point is a
   * dot. Being one path, parts of it that cross don't darken each other.
   */
  path(points: readonly (readonly [number, number])[], width: number, look: Look): void;
  /** A path of lines and curves, as one shape, filled or stroked. */
  shape(cmds: readonly PathCmd[], paint: Paint): void;
}

/** Drawing on a canvas. */
export function canvasDrawing(ctx: CanvasRenderingContext2D): Drawing {
  return {
    path(points, width, look) {
      ctx.save();
      ctx.strokeStyle = look.color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = look.opacity;
      if (look.multiply) ctx.globalCompositeOperation = 'multiply';
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.length > 1 ? points.slice(1) : points) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    },
    shape(cmds, paint) {
      const look = 'fill' in paint ? paint.fill : paint.stroke;
      const p = new Path2D();
      for (const c of cmds) {
        if (c[0] === 'M') p.moveTo(c[1], c[2]);
        else if (c[0] === 'L') p.lineTo(c[1], c[2]);
        else if (c[0] === 'C') p.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else p.closePath();
      }
      ctx.save();
      ctx.globalAlpha = look.opacity;
      if (look.multiply) ctx.globalCompositeOperation = 'multiply';
      if ('fill' in paint) {
        ctx.fillStyle = look.color;
        ctx.fill(p, 'nonzero');
      } else {
        ctx.strokeStyle = look.color;
        ctx.lineWidth = paint.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(p);
      }
      ctx.restore();
    },
  };
}
