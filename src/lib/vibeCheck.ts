/* "Vibe check the CR" — read a stat block and fill the calculator from it.
   Everything flows this way: the block is authored, the calculator scores it. */

import { TRAITS } from './traits.ts';
import { ENTRY_SECTIONS, abilityMod, kindOf } from './statblock.ts';
import type { Entry, EntrySection, StatBlock } from './statblock.ts';
import type { CalcState, Trait } from './types.ts';

/** Average damage stated as "10 (2d6 + 3)", or worked out when only dice are given. */
const DICE = /(?:(\d+)\s*)?\(\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*\)/g;

export function parseDamage(text: string): number {
  let total = 0;
  for (const m of text.matchAll(DICE)) {
    if (m[1] !== undefined) { total += parseInt(m[1], 10); continue; }
    const count = parseInt(m[2]!, 10);
    const size = parseInt(m[3]!, 10);
    const mod = m[5] ? parseInt(m[5], 10) * (m[4] === '-' ? -1 : 1) : 0;
    total += Math.max(0, Math.floor((count * (size + 1)) / 2) + mod);
  }
  return total;
}

const highest = (text: string, re: RegExp): number | null => {
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = parseInt(m[1]!, 10);
    if (Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  return best;
};

/* Both wordings are in circulation: "+7 to hit" in the 2014 books, and
   "Melee Attack Roll: +10" in the 2024 ones. Read either. */
const TO_HIT_PATTERNS: readonly RegExp[] = [
  /([+-]?\d+)\s*to hit/gi,
  /attack roll:\s*([+-]?\d+)/gi,
];

export function parseToHit(text: string): number | null {
  let best: number | null = null;
  for (const re of TO_HIT_PATTERNS) {
    const n = highest(text, re);
    if (n !== null && (best === null || n > best)) best = n;
  }
  return best;
}
export const parseSaveDC = (t: string): number | null => highest(t, /\bDC\s*(\d+)/gi);

/* Names are matched loosely: "Breath Weapon (Recharge 5-6)" is Breath Weapon. */
const norm = (s: string): string =>
  s.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const TRAIT_BY_NAME = new Map<string, Trait>(TRAITS.map((t) => [norm(t.name), t]));

/** A trait that scores its own damage must not also be counted in the round. */
const scoresDamage = (t: Trait): boolean =>
  Boolean(t.dprAll || t.dprOnce || t.dprFromHp);

/** Pull a trait's number out of the text it was written in, where that is possible. */
function valueFor(trait: Trait, entry: Entry, sb: StatBlock): number | null {
  if (!trait.value) return null;
  if (trait.id === 'regeneration') {
    const m = /regains\s+(\d+)\s*hit point/i.exec(entry.text);
    return m ? parseInt(m[1]!, 10) : null;
  }
  if (trait.id === 'fiendishBlessing') return abilityMod(sb.abilities.cha);
  if (trait.id === 'psychicDefense') return abilityMod(sb.abilities.wis);
  if (scoresDamage(trait)) {
    const dmg = parseDamage(entry.text);
    return dmg > 0 ? dmg : null;
  }
  return null;
}

export interface VibeReport {
  took: string[];
  skipped: string[];
}

export interface VibeResult {
  next: CalcState;
  report: VibeReport;
}

/**
 * Read everything the stat block states plainly, and say what it could not.
 *
 * The block's own proficiency bonus is only a fallback for an attack bonus or
 * save DC the text never names; anything written down wins over anything
 * inferred.
 */
export function vibeCheck(sb: StatBlock, current: CalcState): VibeResult {
  const pb = sb.proficiencyBonus;
  const took: string[] = [];
  const skipped: string[] = [];

  const all: { section: EntrySection; entry: Entry }[] = [];
  for (const section of ENTRY_SECTIONS) {
    for (const entry of sb.entries[section]) all.push({ section, entry });
  }
  const allText = all.map((x) => `${x.entry.name} ${x.entry.text}`).join('\n');

  /* ---- Traits first: a matched trait claims its own damage ---- */

  const traits: Record<string, boolean> = {};
  const traitValues: Record<string, number> = {};
  const claimed = new Set<Entry>();
  const matched: string[] = [];

  for (const { entry } of all) {
    const trait = TRAIT_BY_NAME.get(norm(entry.name));
    if (!trait) continue;
    traits[trait.id] = true;
    matched.push(trait.name);
    if (scoresDamage(trait)) claimed.add(entry);
    const v = valueFor(trait, entry, sb);
    if (v !== null) traitValues[trait.id] = v;
  }
  if (matched.length) took.push(`${matched.length} trait${matched.length === 1 ? '' : 's'}: ${matched.join(', ')}`);

  /* ---- Defences ---- */

  if (sb.resistances.length) {
    traits['damageResistance'] = true;
    took.push(`Damage resistance (${sb.resistances.join(', ')})`);
  }
  if (sb.damageImmunities.length) {
    traits['damageImmunity'] = true;
    took.push(`Damage immunity (${sb.damageImmunities.join(', ')})`);
  }
  if (sb.saves.length) {
    traits['saveProficiencies'] = true;
    traitValues['saveProficiencies'] = sb.saves.length;
    took.push(`${sb.saves.length} save proficienc${sb.saves.length === 1 ? 'y' : 'ies'}`);
  }
  const hasRanged = /ranged\s+(?:weapon|spell)?\s*attack/i.test(allText);
  if (sb.speeds.fly > 0 && hasRanged) {
    traits['flyAndRanged'] = true;
    took.push('Fly speed with a ranged attack');
  } else if (sb.speeds.fly > 0) {
    skipped.push('Has a fly speed but no ranged attack, so the flying bonus does not apply');
  }

  /* ---- Numbers ---- */

  const bestPhysical = Math.max(abilityMod(sb.abilities.str), abilityMod(sb.abilities.dex));
  const bestMental = Math.max(
    abilityMod(sb.abilities.int), abilityMod(sb.abilities.wis), abilityMod(sb.abilities.cha));

  const statedToHit = parseToHit(allText);
  const attackBonus = statedToHit ?? bestPhysical + pb;
  took.push(statedToHit !== null
    ? `Attack bonus +${statedToHit}, from the text`
    : `Attack bonus +${attackBonus}, worked out from the ability scores`);

  const statedDC = parseSaveDC(allText);
  const saveDC = statedDC ?? 8 + pb + bestMental;
  took.push(statedDC !== null
    ? `Save DC ${statedDC}, from the text`
    : `Save DC ${saveDC}, worked out from the ability scores`);

  /* Actions are the attack routine; everything off-turn goes to the off-turn
     field, which is what the calculator means by it. */
  let onTurn = 0;
  let offTurn = 0;
  const seen: string[] = [];
  for (const { section, entry } of all) {
    if (claimed.has(entry)) continue;
    const dmg = parseDamage(entry.text);
    if (!dmg) continue;
    seen.push(`${entry.name || 'Unnamed'} ${dmg}`);
    if (section === 'trait') continue;
    /* A reaction fires on somebody else's turn, so it belongs with the
       legendary and lair damage rather than in the attack routine. */
    const offTurnAction = section === 'action' && kindOf(entry) === 'reaction';
    if (section === 'action' && !offTurnAction) onTurn += dmg;
    else offTurn += dmg;
  }
  if (seen.length) took.push(`Damage: ${seen.join(', ')}`);
  else skipped.push('No damage found in any action — set damage per round yourself');

  if (all.some((x) => /^multiattack$/i.test(x.entry.name.trim()))) {
    skipped.push('Multiattack: its repeats are not counted, so raise the damage yourself');
  }

  return {
    next: {
      ...current,
      ac: sb.acValue,
      hp: sb.hpValue,
      attackBonus,
      saveDC,
      extraDamage: offTurn,
      roundCount: 1,
      primary: [onTurn, 0, 0, 0, 0, 0],
      secondary: [0, 0, 0, 0, 0, 0],
      traits,
      traitValues,
    },
    report: { took: [`Armor Class ${sb.acValue}`, `Hit Points ${sb.hpValue}`, ...took], skipped },
  };
}
