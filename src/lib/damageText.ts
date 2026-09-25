/* Reading numbers out of stat block prose.

   Finding the dice is the easy half. The hard half is telling damage that
   adds apart from damage that does not, because a stat block writes both the
   same way: "plus 5 (2d4) Fire damage" and "or 18 (4d6 + 4) Piercing damage
   if it had Advantage" differ by one word, and only the first is extra.

   Getting that wrong is not a rounding error. The Elemental Cataclysm rolls
   a d4 for one of four effects; adding all four gave 161 when the worst of
   them deals 45, which is most of a challenge rating. */

/** Average damage stated as "10 (2d6 + 3)", or worked out when only dice are given. */
const DICE = /(?:(\d+)\s*)?\(\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*\)/g;

/** What one expression averages to. A stated average wins over the dice. */
function averageOf(m: RegExpMatchArray): number {
  if (m[1] !== undefined) return parseInt(m[1], 10);
  const count = parseInt(m[2]!, 10);
  const size = parseInt(m[3]!, 10);
  const mod = m[5] ? parseInt(m[5], 10) * (m[4] === '-' ? -1 : 1) : 0;
  return Math.max(0, Math.floor((count * (size + 1)) / 2) + mod);
}

/* ---------------- Cues that damage replaces rather than adds ---------------- */

/** "…, or 18 (4d6 + 4) Piercing damage if the chimera had Advantage." */
const OR_TAIL = /\bor\s*$/i;

/** "2: Freezing Waves." — one item off a numbered menu. */
const NUMBERED_OPTION = /\n\s*\d+[:.]\s/;

/** The preamble that marks a menu, for lists whose items are named not numbered. */
const MENU = /\b(?:one of the following|at random|roll 1d\d)/i;
const PARAGRAPH = /\n\s*\n/;

/**
 * A miss deals its own damage instead of the hit's, never as well as it.
 * "Hit or Miss:" is a different thing — something that happens either way,
 * like a thrown weapon returning — so it must not be read as a choice.
 */
const MISS = /(?<!Hit or )\bMiss:/i;

/** Failing the same save twice replaces the first outcome with the second. */
const LATER_FAILURE = /\b(?:First|Second|Third|Fourth|Subsequent)\s+Failures?:/i;

/**
 * Which sentence each character sits in.
 *
 * A choice belongs to the clause it was written in. Without that, a swarm's
 * "14 … or 8 … if Bloodied" would swallow the separate 7 its grapple deals
 * in the sentence after, and the swarm would score as if the grapple were
 * free.
 */
function sentenceIndexer(text: string): (index: number) => number {
  const ends: number[] = [];
  for (const m of text.matchAll(/[.!?]\s+|\n+/g)) ends.push((m.index ?? 0) + m[0].length);
  return (index) => {
    let n = 0;
    while (n < ends.length && (ends[n] ?? 0) <= index) n++;
    return n;
  };
}

interface Term {
  value: number;
  /** True when this replaces what came before instead of adding to it. */
  alternative: boolean;
  sentence: number;
}

function terms(text: string): Term[] {
  const menu = MENU.test(text);
  const sentenceAt = sentenceIndexer(text);
  const out: Term[] = [];
  let cursor = 0;

  for (const m of text.matchAll(DICE)) {
    const at = m.index ?? 0;
    /* What was written between the last expression and this one is the whole
       of the evidence for how the two relate. */
    const joiner = text.slice(cursor, at);
    cursor = at + m[0].length;
    out.push({
      value: averageOf(m),
      alternative: out.length > 0 && (
        OR_TAIL.test(joiner)
        || NUMBERED_OPTION.test(joiner)
        || MISS.test(joiner)
        || LATER_FAILURE.test(joiner)
        || (menu && PARAGRAPH.test(joiner))
      ),
      sentence: sentenceAt(at),
    });
  }
  return out;
}

/** A menu the creature rolls on rather than picks from. */
const RANDOM = /\bat random\b|\broll 1d(\d+)/i;

export interface DamageReading {
  /** What one use of the entry is worth. */
  total: number;
  /** How many outcomes it chooses between. 1 means there is no choice. */
  choices: number;
  /** True when the outcome is rolled for rather than picked. */
  random: boolean;
}

/**
 * What one entry deals in a single use of it.
 *
 * Alternatives sit side by side as branches, and what adds goes into whichever
 * branch it follows. What the branches are then worth depends on who chooses:
 *
 * - **Picked** — the creature takes the best one, so the heaviest branch.
 * - **Rolled for** — a beholder's ten eye rays are a d10, and what that is
 *   worth is the average over all ten, four of which deal no damage at all.
 *   The die is what says there are ten; counting only the branches that
 *   carry damage would rate the beholder as though it never rolled a dud.
 */
export function readDamage(text: string): DamageReading {
  const list = terms(text);
  if (!list.length) return { total: 0, choices: 1, random: false };

  let settled = 0;
  let branches: number[] = [0];
  let openedIn = -1;

  for (const t of list) {
    if (t.alternative) {
      branches.push(t.value);
      openedIn = t.sentence;
    } else if (branches.length > 1 && t.sentence !== openedIn) {
      /* Past the sentence that opened the choice, so the choice is settled
         and this is extra on top of whichever branch won. */
      settled += Math.max(...branches);
      branches = [t.value];
      openedIn = -1;
    } else {
      branches[branches.length - 1] = (branches[branches.length - 1] ?? 0) + t.value;
    }
  }

  const rolled = RANDOM.exec(text);
  const sides = Number(rolled?.[1] ?? 0);
  if (rolled && branches.length > 1) {
    const options = Math.max(branches.length, sides);
    const sum = branches.reduce((a, b) => a + b, 0);
    return { total: settled + Math.round(sum / options), choices: options, random: true };
  }
  return {
    total: settled + Math.max(...branches),
    choices: branches.length,
    random: false,
  };
}

export const parseDamage = (text: string): number => readDamage(text).total;

/* ---------------- Attack bonus and save DC ---------------- */

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

const ABILITY = '(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';

/**
 * Only the DCs something actually rolls a saving throw against.
 *
 * A stat block is full of other DCs — escaping a grapple, an Athletics check
 * to dig out of rubble — and none of them is what the calculator means. An
 * ankheg's escape DC 13 beats its real save DC of 12, so reading any "DC 13"
 * at all would quietly score it as the harder monster.
 */
const SAVE_DC_PATTERNS: readonly RegExp[] = [
  /* "Dexterity Saving Throw: DC 21" — how the 2024 books write it. */
  new RegExp(`${ABILITY}\\s+Saving Throw:\\s*DC\\s*(\\d+)`, 'gi'),
  /* "spell save DC 20", in a spellcasting preamble. */
  /\bsave\s+DC\s*(\d+)/gi,
  /* "DC 15 Dexterity saving throw" and the looser "DC 15 save", but not the
     escape DC of a grapple, and not a skill check's DC. Requiring the word
     within the same sentence is what tells them apart. */
  /(?<!escape\s)\bDC\s*(\d+)(?=[^.]{0,40}\bsav(?:e|es|ing)\b)/gi,
];

export function parseSaveDC(text: string): number | null {
  let best: number | null = null;
  for (const re of SAVE_DC_PATTERNS) {
    const n = highest(text, re);
    if (n !== null && (best === null || n > best)) best = n;
  }
  return best;
}

/* ---------------- Multiattack ---------------- */

const COUNTS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  once: 1, twice: 2,
};

/** One clause of a Multiattack: "two Claw attacks". */
export interface RoutinePart {
  times: number;
  /** More than one name means a choice between them for each attack. */
  names: string[];
}

/** The attack routine a Multiattack line describes. */
export interface Routine {
  /**
   * Alternative routines, of which the creature runs one.
   *
   * A barbed devil "makes one Claws attack and one Tail attack, or it makes
   * two Hurl Flame attacks" — three clauses, but two routines, and adding all
   * three together would give it an extra turn.
   */
  branches: RoutinePart[][];
}

const single = (times: number, names: string[]): Routine => ({ branches: [[{ times, names }]] });

function countOf(word: string): number | undefined {
  return COUNTS[word.trim().toLowerCase().replace(/\s+times$/, '')];
}

/** "Scimitar or Pistol" -> both, because each attack picks one of them. */
const splitNames = (names: string): string[] =>
  names.split(/\s*,\s*|\s+(?:or|and)\s+/i).map((n) => n.trim()).filter(Boolean);

/**
 * One clause of a routine, in either shape the book uses:
 * "one Flame Whip attack", and "three other attacks, using Claw or Tail in
 * any combination". A tarrasque's Multiattack is one of each.
 */
const clausePattern = (first: string): RegExp => new RegExp(
  '\\b(one|two|three|four|five|six|seven|eight)\\s+'
  + `(?:([${first}][^,.]*?)\\s+attacks?`
  + '|(?:other\\s+)?attacks?,?\\s+using\\s+(.+?)\\s+in any combination)\\b',
  'g');

/* Capitalised first, because that is how the books name an attack and it
   keeps "three other attacks" and "one attack with a use of" out. Only if
   nothing matches at all is the lower case tried, for a block someone wrote
   themselves as "makes two claw attacks". */
const CLAUSE = clausePattern('A-Z');
const CLAUSE_ANY_CASE = clausePattern('A-Za-z');

/** "and it uses Dreadful Glare" — one more action, on top of the attacks. */
const ALSO_USES = /(?:\band|\.)\s+(?:it\s+)?uses\s+([A-Z][^,.]*?)(?=[.,]|$)/gi;

function clauses(text: string, pattern: RegExp): RoutinePart[][] {
  const branches: RoutinePart[][] = [];
  let cursor = 0;
  for (const m of text.matchAll(pattern)) {
    const times = countOf(m[1]!);
    const names = splitNames(m[2] ?? m[3] ?? '');
    if (!times || !names.length) continue;
    const at = m.index ?? 0;
    const joiner = text.slice(cursor, at);
    cursor = at + m[0].length;
    const part: RoutinePart = { times, names };
    if (!branches.length || /\bor\b/i.test(joiner)) branches.push([part]);
    else branches[branches.length - 1]!.push(part);
  }
  return branches;
}

/**
 * What a Multiattack line adds up to, where it says so plainly.
 *
 * Three wordings cover all but one creature in the Monster Manual — the
 * hydra, which makes as many bites as it has heads. Anything this cannot
 * read comes back null, to be reported rather than guessed at.
 */
export function parseMultiattack(text: string): Routine | null {
  /* "uses Eye Rays three times" — the whole routine is one action, repeated. */
  const repeated = /uses\s+(.+?)\s+(once|twice|\w+\s+times)\b/i.exec(text);
  if (repeated) {
    const times = countOf(repeated[2]!);
    if (times) return single(times, [repeated[1]!.trim()]);
  }

  /* "makes one Ram attack, one Bite attack, and one Claw attack" — and the
     same again after an "or", which starts a routine of its own. */
  const branches = clauses(text, CLAUSE);
  if (!branches.length) branches.push(...clauses(text, CLAUSE_ANY_CASE));
  if (!branches.length) return null;

  /* Something used alongside the attacks belongs to every routine on offer. */
  for (const m of text.matchAll(ALSO_USES)) {
    const part: RoutinePart = { times: 1, names: [m[1]!.trim()] };
    for (const branch of branches) branch.push(part);
  }
  return { branches };
}

/** "(Recharge 5-6)", "(1/Day)" — something the creature cannot do every round. */
export const isLimitedUse = (name: string): boolean =>
  /\((?:[^)]*recharge[^)]*|\s*\d+\s*\/\s*day[^)]*)\)/i.test(name);
