import { describe, expect, it } from 'vitest';
import { gateTurn, type TurnGate } from './_turn-gate';

/** Ask for turns at each time in turn; which of them passed. */
function passes(times: number[]): boolean[] {
  let g: TurnGate = {};
  return times.map((t) => {
    const r = gateTurn(g, t);
    g = r.gate;
    return r.pass;
  });
}

describe('the turn gate', () => {
  it('lets the first turn through', () => {
    expect(passes([0])).toEqual([true]);
  });
  it('drops a turn 50 ms after one that went through', () => {
    expect(passes([0, 50])).toEqual([true, false]);
  });
  it('lets one through 100 ms after the last', () => {
    expect(passes([0, 100])).toEqual([true, true]);
  });
  it('counts from the last turn that went through, not from a dropped one', () => {
    expect(passes([0, 60, 110])).toEqual([true, false, true]);
  });
});
