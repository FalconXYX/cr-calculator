/* Shared shapes for the challenge-rating maths. */

export type TierId = '0-4' | '5-10' | '11-16' | '17+';

/** One rung on the CR ladder, from the Monster Statistics by CR table. */
export interface CrRow {
  /** Index of this rung. Adjustments move by rung, never by arithmetic. */
  i: number;
  cr: string;
  /** Numeric value of the rating, so 1/8 is 0.125. */
  v: number;
  xp: number;
  xpLabel: string;
  prof: number;
  ac: number;
  hpMin: number;
  hpMax: number;
  atk: number;
  dmgMin: number;
  dmgMax: number;
  dc: number;
  /** CR 0 lists ceilings rather than targets, so being under them is free. */
  cap?: boolean;
}

export interface Tier {
  id: TierId;
  label: string;
  min: number;
  max: number;
  resist: number;
  immune: number;
  fortHP: number;
  /** True for the bands the DMG treats as "level 10 or lower". */
  lowLevel: boolean;
}

export interface TraitValueSpec {
  label: string;
  def: number;
  min: number;
  max: number;
}

/**
 * A monster feature. `desc` is what it does at the table, `effect` is what it
 * does to the challenge rating — the tooltip shows both.
 *
 * The optional hooks are how a trait reaches the maths. Typing them here is
 * the main reason this is TypeScript: a misspelled `dprOnce` silently did
 * nothing before, and now fails the build.
 */
export interface Trait {
  id: string;
  name: string;
  example?: string;
  group?: string;
  desc: string;
  effect: string;
  /** Renders a number input beside the checkbox. */
  value?: TraitValueSpec;
  /** Only applies when the target tier is CR 10 or lower. */
  lowLevel?: boolean;
  /** Flat bonus to effective AC. */
  ac?: number;
  /** Flat bonus to effective attack bonus. */
  atk?: number;
  /** Bonus applied to the monster's ACTUAL AC, not just the effective one. */
  acActual?: (v: number) => number;
  hpFlat?: (v: number, tier: Tier) => number;
  /** Added to the HP multiplier. Additive, so double plus double is triple. */
  hpMultAdd?: (v: number, tier: Tier) => number;
  /** Damage added to every round. */
  dprAll?: (v: number) => number;
  /** Damage added to a single round, then averaged across the fight. */
  dprOnce?: (v: number) => number;
  /** Fraction of actual HP added to every round. */
  dprFromHp?: number;
}

/** A feature the DMG marks as having no bearing on CR. */
export interface PlainTrait {
  name: string;
  example?: string;
  desc: string;
}

export interface CalcState {
  tierId: TierId;
  ac: number;
  hp: number;
  attackBonus: number;
  saveDC: number;
  extraDamage: number;
  roundCount: number;
  primary: number[];
  secondary: number[];
  traits: Record<string, boolean>;
  traitValues: Record<string, number>;
}

export interface Breakdown {
  label: string;
  amount: string | number;
}

export interface Result {
  tier: Tier;
  effective: {
    ac: number;
    actualAC: number;
    acParts: Breakdown[];
    hp: number;
    hpBase: number;
    hpMultiplier: number;
    hpParts: Breakdown[];
    attack: number;
    attackParts: Breakdown[];
    damage: number;
    damageRounds: number;
    damageParts: Breakdown[];
    saveDC: number;
  };
  defensive: {
    hpIndex: number;
    hpRow: CrRow;
    expectedAC: number;
    acShift: number;
    index: number;
    row: CrRow;
  };
  offensive: {
    dmgIndex: number;
    dmgRow: CrRow;
    expectedAtk: number;
    atkShift: number;
    byAttackIndex: number;
    byAttackRow: CrRow;
    expectedDC: number;
    dcShift: number;
    bySaveIndex: number;
    bySaveRow: CrRow;
    index: number;
    row: CrRow;
    offenseBy: 'attack' | 'save';
  };
  final: {
    index: number;
    row: CrRow;
    average: number;
    inTarget: boolean;
  };
}
