// How much room the cache may use: in memory, on disk, and what a page is worth saving for.

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
/** What a page drawn to WebP takes per pixel, as estimated. */
export const WEBP_BYTES_PER_PIXEL = 0.3;

/** The memory pages held may take: min(16 screens, max(20 MiB, 5% of device memory, 4 screens)). */
export function memoryBudget(): number {
  const dpr = devicePixelRatio || 1;
  const screenBytes = screen.width * screen.height * dpr * dpr * 4;
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
  const floor = Math.max(20 * MiB, 4 * screenBytes, deviceMemory ? 0.05 * deviceMemory * GiB : 0);
  return Math.min(16 * screenBytes, floor);
}

/** The room saved pages may take: 30% of the origin's quota; none if the browser won't say. */
export async function diskBudget(): Promise<number> {
  try {
    return 0.3 * ((await navigator.storage.estimate()).quota ?? 0);
  } catch {
    return 0;
  }
}

/** Roughly how many bytes a page `pxWidth` wide takes saved as WebP. */
export function estimatedBytes(pxWidth: number, aspect: number): number {
  return pxWidth * Math.round(pxWidth * aspect) * WEBP_BYTES_PER_PIXEL;
}

/** Whether a page is worth saving when it leaves memory: drawing it again would parse a file at least 4 times its size. */
export function worthSaving(sourceSize: number, pxWidth: number, aspect: number): boolean {
  return sourceSize >= 4 * estimatedBytes(pxWidth, aspect);
}
