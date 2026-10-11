/* The calculator's own state: its defaults, and how to read one back.

   Split out of App so that storage and sync can revive a profile without
   importing the component that happens to render it. */

import type { CalcState } from './types.ts';

export const DEFAULTS: CalcState = {
  tierId: '0-4',
  ac: 13,
  hp: 75,
  attackBonus: 4,
  saveDC: 12,
  extraDamage: 0,
  roundCount: 1,
  primary: [5, 0, 0, 0, 0, 0],
  secondary: [5, 0, 0, 0, 0, 0],
  traits: {},
  traitValues: {},
};

/**
 * Saved state may predate a field, so merge rather than trust it wholesale.
 *
 * This now also has to survive a round trip through somebody else's browser:
 * a profile written by an older build on a laptop arrives here as whatever
 * that build thought a profile was.
 */
export function reviveState(raw: unknown): CalcState {
  const saved = (raw ?? {}) as Partial<CalcState>;
  return {
    ...DEFAULTS,
    ...saved,
    traits: { ...(saved.traits ?? {}) },
    traitValues: { ...(saved.traitValues ?? {}) },
    primary: Array.isArray(saved.primary) ? saved.primary.slice(0, 6) : [...DEFAULTS.primary],
    secondary: Array.isArray(saved.secondary) ? saved.secondary.slice(0, 6) : [...DEFAULTS.secondary],
  };
}
