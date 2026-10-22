/** For each pixel row, the fraction of sampled pixels (every 3rd) that are dark. `data` is RGBA. */
export function rowInk(data: ArrayLike<number>, width: number, height: number): Float32Array {
  const rows = new Float32Array(height), samples = Math.ceil(width / 3);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x += 3) {
      const o = (y * width + x) * 4;
      if (data[o] + data[o + 1] + data[o + 2] < 450) n++;
    }
    rows[y] = n / samples;
  }
  return rows;
}

/**
 * Where to split a page at or above `y` (but below `lo`), as fractions of the page height: the
 * middle of the nearest blank band at least 6 rows tall, or `y` itself when there is none.
 */
export function snapSplit(rows: ArrayLike<number>, y: number, lo: number): number {
  const H = rows.length;
  const blank = (r: number) => rows[r] < 0.002;
  const stop = Math.ceil(lo * H);
  let r = Math.min(H - 1, Math.floor(y * H));
  for (;;) {
    while (r > stop && !blank(r)) r--; // up out of any music
    if (r <= stop) return y;
    let top = r;
    while (top > stop && blank(top - 1)) top--; // the blank band runs from `top` to `r`
    if (r - top >= 6) return (top + r) / 2 / H;
    r = top - 1; // too thin, as under a line of small print: look further up
  }
}
