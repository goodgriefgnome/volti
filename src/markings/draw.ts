// What markings are drawn with: a small drawing interface that the screen's canvas and an exported
// PDF annotation's appearance each implement, so each kind of marking is written once and exports
// as it shows.

/** How a line looks: its colour, how see-through it is, and whether it only darkens what is under it. */
export interface Look { color: string; opacity: number; multiply: boolean }

export const SOLID = (color: string): Look => ({ color, opacity: 1, multiply: false });

/** Something markings can be drawn on, in its own units (pixels, or points), y downwards. */
export interface Drawing {
  /**
   * Lines through the points as one path, `width` wide, with round ends and joins; one point is a
   * dot. Being one path, parts of it that cross don't darken each other.
   */
  path(points: readonly (readonly [number, number])[], width: number, look: Look): void;
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
  };
}
