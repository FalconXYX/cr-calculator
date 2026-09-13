/* The Monster Maker's model: a 5e stat block, and the numbers derived from it.
   Nothing here touches React or the DOM, so it can be tested on its own. */

import type { CrRow } from './types.ts';

/* ---------------- Vocabulary ---------------- */

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_LABEL: Record<Ability, string> =
  { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
export const ABILITY_SHORT: Record<Ability, string> =
  { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

export type SizeId = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
export const SIZES: readonly SizeId[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

/** Hit die by size — a monster's hit points are built out of these. */
export const HIT_DIE: Record<SizeId, number> =
  { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };

export const CREATURE_TYPES: readonly string[] = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey',
  'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead',
];

export const ALIGNMENTS: readonly string[] = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
  'Unaligned',
];

export const DAMAGE_TYPES: readonly string[] = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic',
  'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder',
];

export const CONDITIONS: readonly string[] = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
];

export const LANGUAGES: readonly string[] = [
  'Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
  'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial',
  'Sylvan', 'Undercommon',
];

export interface SkillDef { id: string; name: string; ability: Ability; }

export const SKILLS: readonly SkillDef[] = [
  { id: 'acrobatics',     name: 'Acrobatics',      ability: 'dex' },
  { id: 'animalHandling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana',         name: 'Arcana',          ability: 'int' },
  { id: 'athletics',      name: 'Athletics',       ability: 'str' },
  { id: 'deception',      name: 'Deception',       ability: 'cha' },
  { id: 'history',        name: 'History',         ability: 'int' },
  { id: 'insight',        name: 'Insight',         ability: 'wis' },
  { id: 'intimidation',   name: 'Intimidation',    ability: 'cha' },
  { id: 'investigation',  name: 'Investigation',   ability: 'int' },
  { id: 'medicine',       name: 'Medicine',        ability: 'wis' },
  { id: 'nature',         name: 'Nature',          ability: 'int' },
  { id: 'perception',     name: 'Perception',      ability: 'wis' },
  { id: 'performance',    name: 'Performance',     ability: 'cha' },
  { id: 'persuasion',     name: 'Persuasion',      ability: 'cha' },
  { id: 'religion',       name: 'Religion',        ability: 'int' },
  { id: 'sleightOfHand',  name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth',        name: 'Stealth',         ability: 'dex' },
  { id: 'survival',       name: 'Survival',        ability: 'wis' },
];

/* ---------------- Choices worth a second look ---------------- */

/**
 * Legal, but rare enough in published monsters to be worth flagging.
 *
 * These are not errors and nothing stops you picking them. They are the
 * handful of choices that quietly switch off whole categories of play, which
 * is easy to do by accident and hard to notice at the table.
 */
export interface UnusualChoice { value: string; why: string; }

export const UNUSUAL_CONDITION_IMMUNITIES: readonly UnusualChoice[] = [
  {
    value: 'Incapacitated',
    why: 'Incapacitated is the condition most control effects route through — paralysed, stunned and unconscious all impose it, and so do Hold Person, Banishment and Stunning Strike. Immunity to it turns off a large slice of what many characters do.',
  },
  {
    value: 'Stunned',
    why: 'Stunned is the payoff for a monk\u2019s Stunning Strike and several high-level spells. A monster immune to it reads as unfair rather than tough, unless the fiction explains it plainly.',
  },
];

export const UNUSUAL_RESISTANCES: readonly UnusualChoice[] = [
  {
    value: 'Force',
    why: 'Force is the game\u2019s reliable damage type — the thing players reach for precisely because almost nothing resists it. Published monsters essentially never do.',
  },
];

export const UNUSUAL_DAMAGE_IMMUNITIES: readonly UnusualChoice[] = [
  {
    value: 'Force',
    why: 'Force is the game\u2019s reliable damage type, and immunity is stronger still than the resistance that is already almost unheard of. Eldritch Blast, Magic Missile and Spiritual Weapon all stop working.',
  },
];

/** Which of the picks made are on the list, in the order they were listed. */
export function unusualPicks(
  selected: readonly string[],
  table: readonly UnusualChoice[],
): UnusualChoice[] {
  const chosen = new Set(selected.map((v) => v.trim().toLowerCase()));
  return table.filter((u) => chosen.has(u.value.toLowerCase()));
}

/* ---------------- Shape ---------------- */

/**
 * How well a creature rolls one kind of d20 check.
 *
 * Skills and initiative use the same three tiers: nothing, the proficiency
 * bonus once, or — expertise — the proficiency bonus twice.
 */
export type ProficiencyTier = 'none' | 'proficient' | 'expertise';

export const PROFICIENCY_TIERS: readonly ProficiencyTier[] =
  ['none', 'proficient', 'expertise'];

export const PROFICIENCY_LABEL: Record<ProficiencyTier, string> = {
  none: 'None', proficient: 'Proficient', expertise: 'Expertise',
};

/** Multiples of the proficiency bonus each tier adds. */
export const PROFICIENCY_MULTIPLIER: Record<ProficiencyTier, number> = {
  none: 0, proficient: 1, expertise: 2,
};

/** Clicking a chip walks these in order. */
export const NEXT_TIER: Record<ProficiencyTier, ProficiencyTier> = {
  none: 'proficient', proficient: 'expertise', expertise: 'none',
};

/**
 * Where an entry lives in the block.
 *
 * Actions, bonus actions and reactions share one list and are told apart by
 * each entry's `kind`: they are the same sort of thing written the same way,
 * and three near-identical sections only made them easy to lose.
 */
export type EntrySection = 'trait' | 'action' | 'legendary' | 'lair';

export const ENTRY_SECTIONS: readonly EntrySection[] =
  ['trait', 'action', 'legendary', 'lair'];

/** Heading above the group. Traits get none; actions head each kind instead. */
export const ENTRY_HEADING: Record<EntrySection, string> = {
  trait: '', action: '', legendary: 'Legendary Actions', lair: 'Lair Actions',
};

/** What a creature spends to use it. */
export type ActionKind = 'action' | 'bonus' | 'reaction';

export const ACTION_KINDS: readonly ActionKind[] = ['action', 'bonus', 'reaction'];

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction',
};

export const ACTION_KIND_HEADING: Record<ActionKind, string> = {
  action: 'Actions', bonus: 'Bonus Actions', reaction: 'Reactions',
};

export interface Entry {
  id: string;
  name: string;
  text: string;
  /** Only meaningful in the action list; anything else is a plain action. */
  kind?: ActionKind;
}

export const kindOf = (e: Entry): ActionKind => e.kind ?? 'action';

/** The action list split into its headed groups, empty groups left out. */
export function actionsByKind(list: readonly Entry[]): { kind: ActionKind; entries: Entry[] }[] {
  return ACTION_KINDS
    .map((kind) => ({ kind, entries: list.filter((e) => kindOf(e) === kind) }))
    .filter((g) => g.entries.length > 0);
}

export interface Speeds {
  walk: number; burrow: number; climb: number; fly: number; swim: number; hover: boolean;
}

export interface Senses {
  darkvision: number; blindsight: number; tremorsense: number; truesight: number;
  /** "blind beyond this radius" — the usual rider on blindsight. */
  blindBeyond: boolean;
}

export interface StatBlock {
  name: string;
  size: SizeId;
  type: string;
  alignment: string;

  /* The block owns these outright. The calculator reads them on a vibe
     check; nothing flows the other way. */
  acValue: number;
  acNote: string;
  hpValue: number;
  showHitDice: boolean;
  initiative: ProficiencyTier;
  /* The block's own, not the calculator's. Saves and skills must not shift
     around while you are editing numbers in the calculator above. */
  proficiencyBonus: number;

  speeds: Speeds;
  abilities: Record<Ability, number>;
  saves: Ability[];
  /** Skill id to tier. A skill that is absent is simply not proficient. */
  skills: Record<string, ProficiencyTier>;
  vulnerabilities: string[];
  resistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  senses: Senses;
  languages: string[];
  telepathy: number;
  entries: Record<EntrySection, Entry[]>;
  legendaryCount: number;
}

export function defaultStatBlock(): StatBlock {
  return {
    name: 'Monster',
    size: 'Medium',
    type: 'Humanoid',
    alignment: 'True Neutral',
    acValue: 13,
    acNote: '',
    hpValue: 75,
    showHitDice: true,
    initiative: 'none',
    proficiencyBonus: 2,
    speeds: { walk: 30, burrow: 0, climb: 0, fly: 0, swim: 0, hover: false },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: [],
    skills: {},
    vulnerabilities: [],
    resistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    senses: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false },
    languages: [],
    telepathy: 0,
    entries: { trait: [], action: [], legendary: [], lair: [] },
    legendaryCount: 3,
  };
}

/** Older spellings that should fold onto a current entry. */
const ALIASES: Record<string, string> = { neutral: 'True Neutral' };

/**
 * Match a saved value to the canonical entry, ignoring case.
 *
 * Blocks saved before the vocabularies were capitalised hold "humanoid" and
 * "unaligned", which would otherwise sit outside the list forever.
 */
function canonical(value: string, list: readonly string[]): string {
  const key = value.trim().toLowerCase();
  const alias = ALIASES[key];
  if (alias) return alias;
  return list.find((o) => o.toLowerCase() === key) ?? value;
}

/** Saved blocks may predate a field, so merge onto the defaults. */
export function reviveStatBlock(raw: unknown): StatBlock {
  const d = defaultStatBlock();
  const s = (raw ?? {}) as Partial<StatBlock>;
  const entries = (s.entries ?? {}) as Partial<Record<string, Entry[]>>;
  return {
    ...d,
    ...s,
    initiative: PROFICIENCY_TIERS.includes(s.initiative as ProficiencyTier)
      ? (s.initiative as ProficiencyTier)
      : d.initiative,
    type: canonical(s.type ?? d.type, CREATURE_TYPES),
    alignment: canonical(s.alignment ?? d.alignment, ALIGNMENTS),
    speeds: { ...d.speeds, ...(s.speeds ?? {}) },
    senses: { ...d.senses, ...(s.senses ?? {}) },
    abilities: { ...d.abilities, ...(s.abilities ?? {}) },
    saves: [...(s.saves ?? [])],
    skills: reviveSkills(s.skills),
    vulnerabilities: [...(s.vulnerabilities ?? [])],
    resistances: [...(s.resistances ?? [])],
    damageImmunities: [...(s.damageImmunities ?? [])],
    conditionImmunities: [...(s.conditionImmunities ?? [])],
    languages: [...(s.languages ?? [])],
    entries: {
      trait: [...(entries.trait ?? [])],
      /* Bonus actions and reactions used to be lists of their own. Fold them
         into the action list, tagged with what they were. */
      action: [
        ...(entries.action ?? []).map((e) => ({ ...e, kind: kindOf(e) })),
        ...(entries.bonus ?? []).map((e) => ({ ...e, kind: 'bonus' as ActionKind })),
        ...(entries.reaction ?? []).map((e) => ({ ...e, kind: 'reaction' as ActionKind })),
      ],
      legendary: [...(entries.legendary ?? [])],
      lair: [...(entries.lair ?? [])],
    },
  };
}

/**
 * Skills were once a flat list of proficient ids, before expertise existed.
 * Anything in that list was proficient, so that is what it becomes.
 */
function reviveSkills(raw: unknown): Record<string, ProficiencyTier> {
  const out: Record<string, ProficiencyTier> = {};
  if (Array.isArray(raw)) {
    for (const id of raw) if (typeof id === 'string') out[id] = 'proficient';
    return out;
  }
  if (raw && typeof raw === 'object') {
    for (const [id, tier] of Object.entries(raw as Record<string, unknown>)) {
      if (tier === 'proficient' || tier === 'expertise') out[id] = tier;
    }
  }
  return out;
}

let seq = 0;
export const newEntryId = (): string => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

/* ---------------- Derived numbers ---------------- */

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);
export const sign = (n: number): string => (n < 0 ? String(n) : `+${n}`);

export interface HitDice {
  count: number;
  die: number;
  /** Constitution's total contribution across every die. */
  conTotal: number;
  /** Hit points the expression actually averages to. */
  average: number;
  /** "7d8 + 14" */
  text: string;
}

/**
 * Pick the hit dice expression closest to a target hit point total.
 *
 * A large enough Constitution penalty drives the per-die contribution to zero
 * or below, where no number of dice would ever reach the target. That falls
 * back to sizing on the dice alone so the field still shows something usable
 * rather than a negative or absurd count.
 */
export function hitDice(hp: number, size: SizeId, conMod: number): HitDice {
  const die = HIT_DIE[size];
  const dieAvg = (die + 1) / 2;
  const perDie = dieAvg + conMod;
  const count = Math.max(1, Math.round(Math.max(1, hp) / (perDie >= 0.5 ? perDie : dieAvg)));
  const conTotal = count * conMod;
  const average = Math.max(1, Math.floor(count * dieAvg) + conTotal);
  const text = conTotal === 0
    ? `${count}d${die}`
    : `${count}d${die} ${conTotal < 0 ? '-' : '+'} ${Math.abs(conTotal)}`;
  return { count, die, conTotal, average, text };
}

export interface Derived {
  mods: Record<Ability, number>;
  saveBonus: Record<Ability, number>;
  skillBonus: Record<string, number>;
  passivePerception: number;
  /** The modifier added to an initiative roll. */
  initiativeBonus: number;
  /** The passive score the 2024 stat blocks print beside it. */
  initiativeScore: number;
  ac: number;
  hp: number;
  hitDice: HitDice;
  /** The block's own proficiency bonus. */
  pb: number;
  /** What the calculator's current CR would imply, for comparison. */
  crPb: number;
  cr: string;
  xp: string;
}

export function derive(sb: StatBlock, row: CrRow): Derived {
  const pb = sb.proficiencyBonus;
  const mods: Record<Ability, number> = {
    str: abilityMod(sb.abilities.str), dex: abilityMod(sb.abilities.dex),
    con: abilityMod(sb.abilities.con), int: abilityMod(sb.abilities.int),
    wis: abilityMod(sb.abilities.wis), cha: abilityMod(sb.abilities.cha),
  };

  const saveBonus: Record<Ability, number> = {
    str: mods.str, dex: mods.dex, con: mods.con, int: mods.int, wis: mods.wis, cha: mods.cha,
  };
  for (const a of sb.saves) saveBonus[a] += pb;

  /* Each skill keys off its own ability — Arcana is Intelligence, Stealth is
     Dexterity — and expertise counts the proficiency bonus twice. */
  const skillBonus: Record<string, number> = {};
  for (const [id, tier] of Object.entries(sb.skills)) {
    const def = SKILLS.find((s) => s.id === id);
    if (def) skillBonus[id] = mods[def.ability] + pb * PROFICIENCY_MULTIPLIER[tier];
  }

  const perception = skillBonus['perception'] ?? mods.wis;
  const hp = sb.hpValue;
  const initiativeBonus = mods.dex + pb * PROFICIENCY_MULTIPLIER[sb.initiative];

  return {
    mods,
    saveBonus,
    skillBonus,
    passivePerception: 10 + perception,
    initiativeBonus,
    initiativeScore: 10 + initiativeBonus,
    ac: sb.acValue,
    hp,
    hitDice: hitDice(hp, sb.size, mods.con),
    pb,
    crPb: row.prof,
    cr: row.cr,
    xp: row.xp.toLocaleString('en-US'),
  };
}

/* ---------------- Line formatting ---------------- */

/** "30 ft., fly 60 ft. (hover), swim 30 ft." */
export function speedText(s: Speeds): string {
  const parts = [`${s.walk} ft.`];
  if (s.burrow) parts.push(`Burrow ${s.burrow} ft.`);
  if (s.climb) parts.push(`Climb ${s.climb} ft.`);
  if (s.fly) parts.push(`Fly ${s.fly} ft.${s.hover ? ' (hover)' : ''}`);
  if (s.swim) parts.push(`Swim ${s.swim} ft.`);
  return parts.join(', ');
}

/** "darkvision 60 ft., passive Perception 12" */
export function sensesText(s: Senses, passive: number): string {
  const parts: string[] = [];
  if (s.blindsight) {
    parts.push(`Blindsight ${s.blindsight} ft.${s.blindBeyond ? ' (blind beyond this radius)' : ''}`);
  }
  if (s.darkvision) parts.push(`Darkvision ${s.darkvision} ft.`);
  if (s.tremorsense) parts.push(`Tremorsense ${s.tremorsense} ft.`);
  if (s.truesight) parts.push(`Truesight ${s.truesight} ft.`);
  parts.push(`passive Perception ${passive}`);
  return parts.join(', ');
}

export function languagesText(langs: string[], telepathy: number): string {
  const parts = [...langs];
  if (telepathy) parts.push(`Telepathy ${telepathy} ft.`);
  return parts.length ? parts.join(', ') : '—';
}

/** "Medium humanoid, lawful evil" */
export function metaText(sb: StatBlock): string {
  const type = `${sb.size} ${sb.type}`.trim();
  return sb.alignment ? `${type}, ${sb.alignment}` : type;
}

export function savesText(sb: StatBlock, d: Derived): string {
  return sb.saves
    .slice()
    .sort((a, b) => ABILITIES.indexOf(a) - ABILITIES.indexOf(b))
    .map((a) => `${ABILITY_SHORT[a]} ${sign(d.saveBonus[a])}`)
    .join(', ');
}

export function skillsText(sb: StatBlock, d: Derived): string {
  return Object.keys(sb.skills)
    .map((id) => SKILLS.find((s) => s.id === id))
    .filter((s): s is SkillDef => Boolean(s))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `${s.name} ${sign(d.skillBonus[s.id] ?? 0)}`)
    .join(', ');
}

/** The standard preamble above a monster's legendary actions. */
export function legendaryIntro(sb: StatBlock): string {
  const n = sb.legendaryCount;
  const name = (sb.name || 'The creature').trim();
  const subject = /^(the|a|an)\s/i.test(name) ? name : `The ${name.toLowerCase()}`;
  return `${subject} can take ${n} legendary action${n === 1 ? '' : 's'}, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. ${subject} regains spent legendary actions at the start of its turn.`;
}
