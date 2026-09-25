/* Writing a stat block out as a 5etools homebrew file.

   The opposite of what tools/build-bestiary.mjs does on the way in, and the
   same care applies in reverse: 5etools stores its prose with markup — `{@hit
   14}` for an attack bonus, `{@damage 2d6 + 3}` for dice — and text handed
   over without it renders as flat prose with no links and no styling. So the
   tags go back on before the file is written, and a test puts the result
   through the reader to check that what comes back is what went in. */

import {
  ABILITIES, CONDITIONS, PROFICIENCY_MULTIPLIER, SKILLS, hitDice, kindOf, sign,
} from './statblock.ts';
import type { Derived, Entry, SizeId, StatBlock } from './statblock.ts';

/* ---------------- Putting the markup back ---------------- */

const ATTACK: Record<string, string> = {
  'Melee Attack Roll': 'm',
  'Ranged Attack Roll': 'r',
  'Melee or Ranged Attack Roll': 'm,r',
};

const SAVE_ABILITY: Record<string, string> = {
  Strength: 'str', Dexterity: 'dex', Constitution: 'con',
  Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha',
};

const conditionPattern = new RegExp(`\\bthe (${CONDITIONS.join('|')}) condition\\b`, 'g');

/**
 * Turn 2024 stat block prose back into 5etools markup.
 *
 * Every rule runs once, in order, and each one consumes the shape the next
 * would otherwise have matched — the attack line becomes `{@atkr m} {@hit 14}`
 * before anything goes looking for a loose number, and a damage expression is
 * wrapped before the bare "DC" rule runs. That ordering is what keeps a tag
 * from being wrapped in another tag.
 *
 * "DC" is matched case-sensitively for the same reason: `{@dc 21}` is lower
 * case, so a second pass cannot catch what the first pass wrote.
 */
export function retag(text: string): string {
  let out = text;

  /* "Melee Attack Roll: +14" -> the attack and its bonus, in one go. */
  out = out.replace(
    /\b(Melee or Ranged Attack Roll|Melee Attack Roll|Ranged Attack Roll):\s*([+-]?\d+)/g,
    (_m, kind: string, bonus: string) => `{@atkr ${ATTACK[kind]}} {@hit ${bonus.replace('+', '')}}`,
  );

  out = out.replace(
    new RegExp(`\\b(${Object.keys(SAVE_ABILITY).join('|')}) Saving Throw:`, 'g'),
    (_m, ability: string) => `{@actSave ${SAVE_ABILITY[ability]}}`,
  );

  out = out.replace(/\bFailure or Success:/g, '{@actSaveSuccessOrFail}');
  out = out.replace(/\bFailure by (\d+) or More:/g, '{@actSaveFailBy $1}');
  out = out.replace(/\b(First|Second|Third|Fourth) Failure:/g,
    (_m, which: string) => `{@actSaveFail ${['', 'First', 'Second', 'Third', 'Fourth'].indexOf(which)}}`);
  out = out.replace(/\bFailure:/g, '{@actSaveFail}');
  out = out.replace(/\bSuccess:/g, '{@actSaveSuccess}');
  out = out.replace(/\bTrigger:/g, '{@actTrigger}');
  out = out.replace(/\bResponse—/g, '{@actResponse d}');
  out = out.replace(/\bResponse:/g, '{@actResponse}');
  out = out.replace(/\bHit or Miss:\s/g, '{@hom}');
  out = out.replace(/\bHit:\s/g, '{@h}');

  /* "13 (1d10 + 8)" -> the average, then the dice tagged. */
  out = out.replace(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/g, '({@damage $1})');
  out = out.replace(/\bDC\s+(\d+)/g, '{@dc $1}');
  out = out.replace(conditionPattern, 'the {@condition $1|XPHB} condition');
  return out;
}

/** "Fire Breath (Recharge 5-6)" -> the name and the recharge, told apart. */
export function retagName(name: string): string {
  return name
    .replace(/\s*\(Recharge (\d)[–-]6\)/i, ' {@recharge $1}')
    .replace(/\s*\(Recharge 6\)/i, ' {@recharge}')
    .trim();
}

/* ---------------- The shape of the file ---------------- */

const SIZE_CODE: Record<SizeId, string> = {
  Tiny: 'T', Small: 'S', Medium: 'M', Large: 'L', Huge: 'H', Gargantuan: 'G',
};

/** "Chaotic Evil" -> ["C", "E"], the way 5etools stores the two axes. */
function alignmentCode(alignment: string): string[] {
  if (alignment === 'Unaligned') return ['U'];
  if (alignment === 'True Neutral') return ['N'];
  const words = alignment.split(/\s+/);
  const law = { Lawful: 'L', Neutral: 'N', Chaotic: 'C' }[words[0] ?? ''] ?? 'N';
  const good = { Good: 'G', Neutral: 'N', Evil: 'E' }[words[1] ?? ''] ?? 'N';
  return [law, good];
}

const lower = (list: readonly string[]): string[] => list.map((x) => x.toLowerCase());

function speedOf(sb: StatBlock): Record<string, unknown> {
  const out: Record<string, unknown> = { walk: sb.speeds.walk };
  for (const kind of ['burrow', 'climb', 'fly', 'swim'] as const) {
    if (sb.speeds[kind]) out[kind] = sb.speeds[kind];
  }
  if (sb.speeds.hover) out['canHover'] = true;
  return out;
}

function sensesOf(sb: StatBlock): string[] {
  const out: string[] = [];
  if (sb.senses.blindsight) {
    out.push(`Blindsight ${sb.senses.blindsight} ft.${sb.senses.blindBeyond ? ' (blind beyond this radius)' : ''}`);
  }
  if (sb.senses.darkvision) out.push(`Darkvision ${sb.senses.darkvision} ft.`);
  if (sb.senses.tremorsense) out.push(`Tremorsense ${sb.senses.tremorsense} ft.`);
  if (sb.senses.truesight) out.push(`Truesight ${sb.senses.truesight} ft.`);
  return out;
}

function languagesOf(sb: StatBlock): string[] {
  if (!sb.telepathy) return [...sb.languages];
  /* Telepathy hangs off the end of the last language behind a semicolon,
     which is how the books print it and how 5etools stores it. */
  if (!sb.languages.length) return [`telepathy ${sb.telepathy} ft.`];
  const list = [...sb.languages];
  list[list.length - 1] = `${list[list.length - 1]}; telepathy ${sb.telepathy} ft.`;
  return list;
}

const entriesOf = (list: readonly Entry[]): Record<string, unknown>[] =>
  list.map((e) => ({
    name: retagName(e.name || 'Unnamed'),
    entries: e.text.split(/\n{2,}/).map((p) => retag(p.replace(/\n/g, ' '))).filter(Boolean),
  }));

/** The source a homebrew file declares and every creature in it points at. */
export const SOURCE_ID = 'CRCalc';

export interface FiveToolsOptions {
  /** What the block is rated at, which the calculator decides rather than the block. */
  cr: string;
  /** Seconds since the epoch, so a test can pin it. */
  now?: number;
}

/**
 * One creature, in the shape 5etools reads.
 *
 * Saves and skills are written as the totals the block prints rather than as
 * the tiers behind them, because that is what 5etools stores — and it means a
 * creature with expertise survives the trip, which it would not if only the
 * proficiency were recorded.
 */
export function toFiveToolsMonster(
  sb: StatBlock, d: Derived, options: FiveToolsOptions,
): Record<string, unknown> {
  const dice = hitDice(sb.hpValue, sb.size, d.mods.con);
  const saves: Record<string, string> = {};
  for (const a of ABILITIES) if (sb.saves.includes(a)) saves[a] = sign(d.saveBonus[a]);

  const skills: Record<string, string> = {};
  for (const skill of SKILLS) {
    const tier = sb.skills[skill.id];
    if (tier && tier !== 'none') skills[skill.name.toLowerCase()] = sign(d.skillBonus[skill.id] ?? 0);
  }

  const bonus = sb.entries.action.filter((e) => kindOf(e) === 'bonus');
  const reaction = sb.entries.action.filter((e) => kindOf(e) === 'reaction');
  const action = sb.entries.action.filter((e) => kindOf(e) === 'action');

  const out: Record<string, unknown> = {
    name: sb.name || 'Unnamed',
    source: SOURCE_ID,
    size: [SIZE_CODE[sb.size]],
    type: sb.type.toLowerCase(),
    alignment: alignmentCode(sb.alignment),
    ac: sb.acNote ? [{ ac: sb.acValue, from: [sb.acNote] }] : [sb.acValue],
    hp: sb.showHitDice
      ? { average: sb.hpValue, formula: dice.text }
      : { special: String(sb.hpValue) },
    speed: speedOf(sb),
    ...Object.fromEntries(ABILITIES.map((a) => [a, sb.abilities[a]])),
    passive: d.passivePerception,
    cr: options.cr,
  };

  if (sb.initiative !== 'none') {
    out['initiative'] = { proficiency: PROFICIENCY_MULTIPLIER[sb.initiative] };
  }
  if (Object.keys(saves).length) out['save'] = saves;
  if (Object.keys(skills).length) out['skill'] = skills;
  if (sb.vulnerabilities.length) out['vulnerable'] = lower(sb.vulnerabilities);
  if (sb.resistances.length) out['resist'] = lower(sb.resistances);
  if (sb.damageImmunities.length) out['immune'] = lower(sb.damageImmunities);
  if (sb.conditionImmunities.length) out['conditionImmune'] = lower(sb.conditionImmunities);
  const senses = sensesOf(sb);
  if (senses.length) out['senses'] = senses;
  const languages = languagesOf(sb);
  if (languages.length) out['languages'] = languages;

  if (sb.entries.trait.length) out['trait'] = entriesOf(sb.entries.trait);
  if (action.length) out['action'] = entriesOf(action);
  if (bonus.length) out['bonus'] = entriesOf(bonus);
  if (reaction.length) out['reaction'] = entriesOf(reaction);
  if (sb.entries.legendary.length) {
    out['legendary'] = entriesOf(sb.entries.legendary);
    if (sb.legendaryCount !== 3) out['legendaryActions'] = sb.legendaryCount;
  }
  /* 2024 blocks have no separate lair action list, so they ride along as
     actions with the heading in their name rather than being dropped. */
  if (sb.entries.lair.length) {
    out['action'] = [
      ...(out['action'] as Record<string, unknown>[] | undefined ?? []),
      ...entriesOf(sb.entries.lair).map((e) => ({ ...e, name: `${String(e['name'])} (Lair Action)` })),
    ];
  }
  return out;
}

/** The whole file, `_meta` and all, which is what 5etools loads as a brew. */
export function toFiveTools(
  sb: StatBlock, d: Derived, options: FiveToolsOptions,
): Record<string, unknown> {
  const stamp = options.now ?? Math.floor(Date.now() / 1000);
  return {
    _meta: {
      sources: [{
        json: SOURCE_ID,
        abbreviation: 'CRC',
        full: 'CR Calculator',
        version: '1.0.0',
        authors: ['CR Calculator'],
        convertedBy: ['CR Calculator'],
      }],
      /* "one" is 5etools for the 2024 rules, which is what the maker writes. */
      edition: 'one',
      dateAdded: stamp,
      dateLastModified: stamp,
    },
    monster: [toFiveToolsMonster(sb, d, options)],
  };
}

export const toFiveToolsJson = (sb: StatBlock, d: Derived, options: FiveToolsOptions): string =>
  `${JSON.stringify(toFiveTools(sb, d, options), null, 2)}\n`;

export const fiveToolsFilename = (sb: StatBlock): string =>
  `${(sb.name || 'monster').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'monster'}-5etools.json`;
