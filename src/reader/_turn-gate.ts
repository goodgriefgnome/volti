// The gate every page turn goes through, whether it came from a tap, a key, a pedal or a face
// gesture. Pure: reader.ts keeps the gate and says when a turn is asked for.

/** How long after a turn that went through another is dropped, either way. */
export const TURN_GAP_MS = 100;

export interface TurnGate {
  /** When the last turn that went through was asked for (ms). */
  lastAt?: number;
}

/** Whether a turn asked for at `at` (ms) goes through, and the gate after it. */
export function gateTurn(g: TurnGate, at: number): { gate: TurnGate; pass: boolean } {
  if (g.lastAt !== undefined && at - g.lastAt < TURN_GAP_MS) return { gate: g, pass: false };
  return { gate: { lastAt: at }, pass: true };
}
