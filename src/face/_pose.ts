// The head's angles from the face's transformation matrix. Pure.

/** Yaw (positive: turned to the person's left) and pitch (positive: tipped down), in degrees, from the face's 4×4 transform (column-major). */
export function poseOf(m: { data: ArrayLike<number> }): { yaw: number; pitch: number } {
  const d = m.data;
  const deg = 180 / Math.PI;
  return {
    yaw: Math.asin(Math.max(-1, Math.min(1, -d[2]))) * deg,
    pitch: Math.atan2(d[6], d[10]) * deg,
  };
}
