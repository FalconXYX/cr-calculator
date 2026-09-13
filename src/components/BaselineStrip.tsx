import { CR_TABLE } from '../lib/crTable.ts';
import type { Tier } from '../lib/types.ts';

/** The statistics the DMG expects across the whole target band. */
export function BaselineStrip({ tier }: { tier: Tier }) {
  const band = CR_TABLE.filter((r) => r.v >= tier.min && r.v <= tier.max);
  const first = band[0];
  const last = band[band.length - 1];
  if (!first || !last) return <div className="baseline" />;

  const span = (a: number, b: number, prefix = '') =>
    a === b ? `${prefix}${a}` : `${prefix}${a}–${prefix}${b}`;

  return (
    <div className="baseline">
      {`Baseline for ${tier.label}  ·  AC ${span(first.ac, last.ac)}`}
      {`  ·  HP ${first.hpMin}–${last.hpMax}`}
      {`  ·  Attack ${span(first.atk, last.atk, '+')}`}
      {`  ·  Damage ${first.dmgMin}–${last.dmgMax}`}
      {`  ·  DC ${span(first.dc, last.dc)}`}
    </div>
  );
}
