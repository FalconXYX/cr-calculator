/* "Vibe check the CR" — read a stat block and fill the calculator from it.
   Everything flows this way: the block is authored, the calculator scores it. */

import { TRAITS } from './traits.ts';
import { ENTRY_SECTIONS, abilityMod, kindOf } from './statblock.ts';
import type { Entry, EntrySection, StatBlock } from './statblock.ts';
import type { CalcState, Trait } from './types.ts';
import {
  isLimitedUse, parseDamage, parseMultiattack, parseSaveDC, parseToHit, readDamage,
} from './damageText.ts';
import type { Routine } from './damageText.ts';

/* Names are matched loosely: "Breath Weapon (Recharge 5-6)" is Breath Weapon. */
const norm = (s: string): string =>
  s.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const TRAIT_BY_NAME = new Map<string, Trait>(TRAITS.map((t) => [norm(t.name), t]));

/**
 * How many damage types it takes before a defence counts.
 *
 * The calculator multiplies effective hit points for resistances and
 * immunities, and doubles them outright at low challenge ratings. Applying
 * that to one type is what made a skeleton immune to poison, or a black
 * dragon immune to its own acid, score as though it had twice the hit points
 * it has — a party does not even notice a single immunity, because everything
 * else they own still works.
 *
 * Three is also where "bludgeoning, piercing and slashing from nonmagical
 * attacks" falls, which is the case the rule was written for. It is stored as
 * its three separate types, so no special case is needed for it.
 */
const DEFENCE_FLOOR = 3;

/**
 * And how many saving throw proficiencies.
 *
 * The engine already awards nothing below three. The fault was in the
 * ticking: the box went on for a single proficiency and the report announced
 * it as something read off the block, so the checklist and the summary both
 * claimed a bonus the arithmetic had never given.
 */
const SAVE_FLOOR = 3;

/**
 * Mark a name so the report can pick it out.
 *
 * The columns are prose, and prose is where a name goes to hide. Every trait
 * and every action named below is wrapped, and the panel renders the wrapper
 * as bold — which turns a paragraph you have to read into one you can scan.
 * Nothing else is marked: a report where half the words are bold is a report
 * with no emphasis at all.
 */
const b = (name: string): string => `**${name}**`;

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

/* ---------------- Picking the routine out of an action list ---------------- */

/** One entry and what it deals. `times` is set where it is used repeatedly. */
interface Option { entry: Entry; damage: number; times?: number; }

/** What one use of an entry is worth, however the entry states it. */
type DamageOf = (entry: Entry) => number;

/**
 * The heaviest thing in a list, because a list of actions is a menu.
 *
 * A bandit has a scimitar and a light crossbow and uses one of them on its
 * turn. Adding both scores it as though it did both at once, which is the
 * same mistake as adding up the four effects of a Cataclysmic Event.
 */
function heaviest(list: readonly Entry[], damageOf: DamageOf): Option | null {
  let found: Option | null = null;
  for (const entry of list) {
    const damage = damageOf(entry);
    if (damage > 0 && (!found || damage > found.damage)) found = { entry, damage };
  }
  return found;
}

/** "3 × Rend 18", or just "Rend 18" where it is used once. */
function describe(option: Option): string {
  const name = option.entry.name || 'Unnamed';
  const times = option.times ?? 1;
  return times > 1
    ? `${times} \u00d7 ${b(name)} ${Math.round(option.damage / times)}`
    : `${b(name)} ${option.damage}`;
}

/**
 * Why an entry with several outcomes is worth what it is worth.
 *
 * Nothing at all when the entry states one number. Otherwise it says which
 * reading was taken and what the alternative would have come to, because the
 * alternative is what the calculator used to do.
 */
function explainChoice(entry: Entry, damage: number): string | null {
  const { choices, random } = readDamage(entry.text);
  if (choices < 2) return null;
  const name = entry.name || 'An action';
  return random
    ? `${b(name)} rolls for one of ${choices} outcomes, so its ${damage} is the average across them rather than all ${choices} added together.`
    : `${b(name)} offers ${choices} outcomes and the creature picks, so its ${damage} is the heaviest of them rather than all ${choices} added together.`;
}

/**
 * What a round of legendary actions comes to.
 *
 * The list is a menu and the creature picks from it as many times as it is
 * allowed. An option that says it cannot be taken again this turn is worth
 * one use; anything unrestricted can simply be taken again.
 */
function legendaryRound(
  sb: StatBlock, claimed: Set<Entry>, damageOf: DamageOf,
): { total: number; label: string } | null {
  const options = sb.entries.legendary
    .filter((e) => !claimed.has(e))
    .map((e) => {
      const costs = /\(\s*costs\s+(\d+)\s+actions?\s*\)/i.exec(`${e.name} ${e.text}`);
      return {
        entry: e,
        damage: damageOf(e),
        cost: costs ? Math.max(1, parseInt(costs[1]!, 10)) : 1,
        oncePerRound: /can['\u2019]t take this action again/i.test(e.text),
      };
    })
    .filter((o) => o.damage > 0)
    /* Best value for what it costs, since that is what gets spammed. */
    .sort((a, b) => b.damage / b.cost - a.damage / a.cost);
  if (!options.length) return null;

  let left = Math.max(1, sb.legendaryCount);
  let total = 0;
  const taken: string[] = [];
  for (const option of options) {
    if (left < option.cost) continue;
    const uses = option.oncePerRound ? 1 : Math.floor(left / option.cost);
    total += option.damage * uses;
    taken.push(uses > 1 ? `${uses} \u00d7 ${b(option.entry.name)}` : b(option.entry.name));
    left -= uses * option.cost;
  }
  return { total, label: taken.join(', ') };
}

export interface VibeReport {
  /** Read straight off the block, with nothing decided along the way. */
  took: string[];
  /**
   * Where the block said one thing and the calculator wanted another.
   *
   * This is the half worth reading. A stat block describes what a creature
   * can do; the calculator wants a number for what it does in a round, and
   * getting from one to the other means choosing — which of four random
   * effects, how many attacks a Multiattack is, whether a breath weapon
   * happens every round. Each of those choices is written out here.
   */
  judged: string[];
  /** What is left for a person to decide. */
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
  const judged: string[] = [];
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
  if (matched.length) took.push(`${matched.length} trait${matched.length === 1 ? '' : 's'}: ${matched.map(b).join(', ')}`);

  /* ---- Defences ---- */

  const defence = (
    id: 'damageResistance' | 'damageImmunity',
    types: readonly string[],
    word: string,
  ): void => {
    if (!types.length) return;
    const list = types.join(', ');
    if (types.length >= DEFENCE_FLOOR) {
      traits[id] = true;
      took.push(`${types.length} damage ${word} (${list})`);
    } else {
      judged.push(`${types.length === 1 ? 'One' : 'Two'} damage ${word} (${list}), which is under the three it takes to count. A party routes around one or two types without noticing, so this does not raise the effective hit points.`);
    }
  };
  defence('damageResistance', sb.resistances, sb.resistances.length === 1 ? 'resistance' : 'resistances');
  defence('damageImmunity', sb.damageImmunities, sb.damageImmunities.length === 1 ? 'immunity' : 'immunities');

  if (sb.saves.length >= SAVE_FLOOR) {
    traits['saveProficiencies'] = true;
    traitValues['saveProficiencies'] = sb.saves.length;
    took.push(`${sb.saves.length} save proficiencies`);
  } else if (sb.saves.length) {
    judged.push(`${sb.saves.length === 1 ? 'One save proficiency' : 'Two save proficiencies'} (${sb.saves.join(', ')}), under the three that start to count, so no effective armour class from them.`);
  }
  /* A dragon that breathes fire in a cone can fight from the air as surely as
     one with a bow, so the bonus is not about weapons — it is about whether
     the creature has to land to hurt anybody. */
  const hasRanged = /ranged\s+(?:weapon|spell)?\s*attack/i.test(allText)
    || /\brange\s+\d+/i.test(allText)
    || /\d+-foot\s+(?:Cone|Line)\b/i.test(allText);
  if (sb.speeds.fly > 0 && hasRanged) {
    traits['flyAndRanged'] = true;
    took.push('Fly speed with a ranged attack');
  } else if (sb.speeds.fly > 0) {
    judged.push('It flies, but nothing it does reaches past its own arms, so it has to land to fight and the flying bonus does not apply.');
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

  /* ---- The attack routine ----

     A creature takes one action on its turn. Reading every action it has and
     adding them together scores a bandit as though it swung its scimitar and
     fired its crossbow at once, so what goes in is the routine it actually
     runs: whatever Multiattack says, or failing that the heaviest single
     thing it can do. */

  /* An entry with no dice of its own can still deal damage by naming an
     attack — "Pounce. The dragon moves up to half its Speed, and it makes one
     Rend attack." Look the attack up rather than scoring the pounce at zero,
     which is how a dragon's legendary actions used to come to nothing. */
  /* All of them, not the last one. A creature often has an action and a
     legendary action of the same name — the action swings, the legendary one
     says "Bodhi makes one Unarmed Strike attack" and deals nothing on its
     own. Keeping a single entry per name let the empty one win, and the whole
     routine then scored zero. */
  const byName = new Map<string, Entry[]>();
  for (const { entry } of all) {
    const key = norm(entry.name);
    const held = byName.get(key);
    if (held) held.push(entry);
    else byName.set(key, [entry]);
  }

  /* A Multiattack does not always name what it is repeating. "makes two melee
     attacks" names a kind, and "makes two attacks with its claws" names the
     limb rather than the action, which is called Claw. Both were coming back
     with nothing found, so the whole routine scored zero. */
  /* Several of these run together — "a melee weapon", "one of its weapons" —
     and the whole phrase still names a kind rather than an action. */
  const KIND_WORD = '(?:melee|ranged|weapon|spell|magic|attacks?|strikes?|weapons)';
  const KIND = new RegExp(`^${KIND_WORD}(?:\\s+${KIND_WORD})*$`, 'i');
  /* "Melee Attack Roll" in the 2025 wording, and "mw" in the older data,
     where the tag {@atk mw} leaves the abbreviation behind rather than the
     words. Four attacks in five across the catalogue are the second kind, so
     a test for the word alone finds almost none of them. */
  const MELEE = /\bmelee\b|\b(?:mw|ms)\b/i;
  const RANGED = /\branged\b|\b(?:rw|rs)\b/i;
  const attacks = (kind: string): Entry[] => {
    const melee = /\bmelee\b/i.test(kind);
    const ranged = /\branged\b/i.test(kind);
    return sb.entries.action.filter((e) => {
      if (kindOf(e) !== 'action') return false;
      /* An attack roll is what makes it an attack. It also keeps a breath
         weapon out of the pool, since a saving throw is not an attack. */
      if (parseToHit(`${e.name} ${e.text}`) === null) return false;
      const text = `${e.name} ${e.text}`;
      if (melee) return MELEE.test(text);
      if (ranged) return RANGED.test(text);
      return true;
    });
  };

  /** Every entry a name in a routine could mean. */
  const lookUp = (name: string): Entry[] => {
    const key = norm(name);
    /* Books write the limb and name the action after it: "two attacks with
       its claws" against an action called Claw. */
    const exact = byName.get(key) ?? byName.get(key.replace(/s$/, '')) ?? byName.get(`${key}s`);
    if (exact) return exact;

    /* An action's name often carries more than the Multiattack repeats of it:
       "two shortsword attacks" against an action called Shortsword +2, and
       "three unarmed strikes" against Unarmed Strike. Only the start counts,
       and only the closest match — the shortest name that begins with what
       was asked for — so "Claw" does not also drag in Claw Flurry.

       Matching anywhere in the name rather than at the start was tried and
       is worse: it rescues a "longsword" that wants Flaming Longsword, and
       loses thirty-two other creatures to names that merely share a word. */
    if (key.length >= 4) {
      let best: Entry[] = [];
      let shortest = Infinity;
      for (const [other, held] of byName) {
        if (!other.startsWith(key)) continue;
        if (other.length < shortest) { shortest = other.length; best = [...held]; }
        else if (other.length === shortest) best.push(...held);
      }
      if (best.length) return best;
    }
    return KIND.test(name.trim()) ? attacks(name) : [];
  };

  /**
   * Work a routine out against the actions it names.
   *
   * Each branch is a whole round's worth, so its clauses add; the branches
   * are alternatives, so the heaviest of them is what the creature does.
   * Returns nothing when no branch names an action that can be found, which
   * is the signal to say so rather than to guess.
   */
  const runRoutine = (plan: Routine, open: Set<Entry>): Option[] | null => {
    let best: Option[] | null = null;
    let bestDamage = 0;
    for (const branch of plan.branches) {
      const picks: Option[] = [];
      let damage = 0;
      for (const part of branch) {
        const named = part.names
          .flatMap(lookUp)
          .filter((e) => !open.has(e));
        const pick = heaviest(named, (e) => damageAt(e, open));
        if (!pick) continue;
        damage += part.times * pick.damage;
        picks.push({ entry: pick.entry, damage: part.times * pick.damage, times: part.times });
      }
      if (damage > 0 && damage > bestDamage) { bestDamage = damage; best = picks; }
    }
    return best;
  };

  /* `open` is what is already being worked out, so two actions that name each
     other stop instead of chasing one another for ever. */
  const damageAt = (entry: Entry, open: Set<Entry>): number => {
    const own = parseDamage(entry.text);
    if (own > 0) return own;
    const plan = parseMultiattack(entry.text);
    if (!plan || open.has(entry)) return 0;
    const picks = runRoutine(plan, new Set([...open, entry]));
    return picks ? picks.reduce((a, b) => a + b.damage, 0) : 0;
  };

  const damageOf: DamageOf = (entry) => damageAt(entry, new Set());

  const actions = sb.entries.action.filter((e) => !claimed.has(e));
  const multiattack = actions.find((e) => /^multiattack\b/i.test(e.name.trim()));
  const onTurn = actions.filter((e) => e !== multiattack && kindOf(e) === 'action');
  const bursts = onTurn.filter((e) => isLimitedUse(e.name));
  const routineActions = onTurn.filter((e) => !isLimitedUse(e.name));

  /* Everything with more than one outcome, said once and said plainly. */
  const noteChoice = (option: Option | null): void => {
    if (!option) return;
    const each = Math.round(option.damage / (option.times ?? 1));
    const why = explainChoice(option.entry, each);
    if (why) judged.push(why);
  };

  let routine = 0;
  if (multiattack) {
    const plan = parseMultiattack(multiattack.text);
    const picks = plan && runRoutine(plan, new Set([multiattack]));
    if (picks && picks.length) {
      routine = picks.reduce((a, b) => a + b.damage, 0);
      judged.push(`${b('Multiattack')} reads as ${picks.map(describe).join(' + ')}, so a round of attacking is ${routine}.`);
      picks.forEach(noteChoice);
    } else {
      skipped.push(`${b('Multiattack')} says \u201c${multiattack.text.trim().slice(0, 80)}\u201d, which is not a number this can read. Set the damage per round yourself.`);
    }
  }
  if (!routine) {
    const pick = heaviest(routineActions, damageOf);
    if (pick) {
      routine = pick.damage;
      judged.push(routineActions.length > 1
        ? `No Multiattack, so it takes one action a turn. The round is its heaviest, ${describe(pick)} \u2014 the other ${routineActions.length - 1} ${routineActions.length === 2 ? 'is what it does' : 'are what it does'} instead, not as well.`
        : `One action and one action a turn, so the round is ${describe(pick)}.`);
      noteChoice(pick);
    }
  }

  /* A bonus action is on top of the action, not instead of it. */
  const bonus = heaviest(actions.filter((e) => kindOf(e) === 'bonus'), damageOf);
  if (bonus) {
    routine += bonus.damage;
    judged.push(`${describe(bonus)} is a bonus action, which costs nothing the action would have used, so it adds to the round.`);
    noteChoice(bonus);
  }

  /* ---- Off-turn: reactions, legendary and lair actions ---- */

  let offTurn = 0;
  const reactions = actions.filter((e) => kindOf(e) === 'reaction');
  const reaction = heaviest(reactions, damageOf);
  if (reaction) {
    offTurn += reaction.damage;
    judged.push(reactions.length > 1
      ? `It has ${reactions.length} reactions but one reaction a round, so only the heaviest counts: ${describe(reaction)}, off its own turn.`
      : `${describe(reaction)} is a reaction, so it lands on somebody else's turn rather than in the routine.`);
    noteChoice(reaction);
  }
  const legendary = legendaryRound(sb, claimed, damageOf);
  if (legendary) {
    offTurn += legendary.total;
    judged.push(`${sb.legendaryCount} legendary action${sb.legendaryCount === 1 ? '' : 's'} a round, spent on ${legendary.label} \u2014 ${legendary.total} between other creatures' turns.`);
  }
  const lair = heaviest(sb.entries.lair.filter((e) => !claimed.has(e)), damageOf);
  if (lair) {
    offTurn += lair.damage;
    judged.push(`Lair actions are a menu taken once a round, so the heaviest counts: ${describe(lair)}.`);
    noteChoice(lair);
  }

  /* An aura or other trait that deals damage only does so if the fight
     obliges, so it is reported rather than counted. */
  for (const entry of sb.entries.trait) {
    if (claimed.has(entry)) continue;
    const damage = parseDamage(entry.text);
    if (damage > 0) {
      skipped.push(`${b(entry.name || 'A trait')} deals ${damage}, but only if the fight obliges \u2014 an aura needs somebody standing in it, a death burst needs the creature dead. Add it to the round yourself if it will land.`);
    }
  }

  /* ---- Rounds ----

     A recharge or once-a-day action is not every round. It goes in the first
     round and the routine in the rest, which is what the round table is for
     and what the DMG does with a breath weapon. */

  const burst = heaviest(bursts, damageOf);
  /* A burst worth less than the routine would never be used over it, so it
     changes nothing and the round stays one round long. */
  const opener = burst && burst.damage > routine ? burst : null;
  /* How the burst was read is worth saying either way — whether or not it
     ends up being the thing that shapes the round. */
  noteChoice(burst);
  const primary = [routine, 0, 0, 0, 0, 0];
  if (opener) {
    /* On the round it breathes it is not also attacking, so the first round
       is the burst rather than the two of them together. */
    primary[0] = opener.damage;
    primary[1] = routine;
    primary[2] = routine;
    judged.push(`${b(opener.entry.name)} cannot be used every round, so it takes round 1 at ${opener.damage} and the routine takes rounds 2 and 3 at ${routine}. Averaged across the three that is ${Math.round((opener.damage + routine * 2) / 3)} a round, rather than the ${opener.damage + routine} the two come to added together.`);
  } else if (burst) {
    judged.push(`${b(burst.entry.name)} is limited, and at ${burst.damage} it is worth less than the routine's ${routine} anyway, so it would never be used in place of one and the round is unchanged.`);
  }

  if (!routine && burst && !opener) primary[0] = burst.damage;

  if (!routine && !burst && !offTurn) {
    skipped.push('No damage found in any action. Set the damage per round yourself.');
  }

  return {
    next: {
      ...current,
      ac: sb.acValue,
      hp: sb.hpValue,
      attackBonus,
      saveDC,
      extraDamage: offTurn,
      roundCount: opener ? 3 : 1,
      primary,
      secondary: [0, 0, 0, 0, 0, 0],
      traits,
      traitValues,
    },
    report: {
      took: [`Armor Class ${sb.acValue}`, `Hit Points ${sb.hpValue}`, ...took],
      judged,
      skipped,
    },
  };
}
