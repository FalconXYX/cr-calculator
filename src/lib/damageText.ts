/* Reading numbers out of stat block prose.

   Finding the dice is the easy half. The hard half is telling damage that
   adds apart from damage that does not, because a stat block writes both the
   same way: "plus 5 (2d4) Fire damage" and "or 18 (4d6 + 4) Piercing damage
   if it had Advantage" differ by one word, and only the first is extra.

   Getting that wrong is not a rounding error. The Elemental Cataclysm rolls
   a d4 for one of four effects; adding all four gave 161 when the worst of
   them deals 45, which is most of a challenge rating. */

/**
 * Damage, in the two shapes a stat block writes it.
 *
 * First the usual "10 (2d6 + 3)". The close tolerates words before the
 * bracket shuts — "13 (3d6 + 3 necrotic damage)" is printed that way and used
 * to read as nothing — but refuses to run past a second dice term, so a menu
 * written inside one bracket pair stays a menu rather than becoming a sum.
 *
 * Then a flat number with no dice behind it: "Hit: 4 Bludgeoning damage",
 * which is how the smallest creatures in the game state their only attack,
 * and which read as zero. It is anchored on a lead-in that means damage is
 * being dealt — unanchored, it reads thresholds, damage to objects and the
 * extra dice on a critical hit as though the creature dealt them every round.
 */
const DAMAGE_TYPE = '(?:Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder)';
const DICE = new RegExp(
  '(?:(\\d+)\\s*)?\\(\\s*(\\d+)\\s*d\\s*(\\d+)\\s*(?:([+-])\\s*(\\d+))?(?:(?!\\d+\\s*d\\s*\\d)[^)])*\\)'
  + `|(?<=\\b(?:Hit|Failure):\\s|\\bplus\\s)(\\d+)(?=\\s+(?:${DAMAGE_TYPE}\\s+)?damage\\b)`,
  'g');

/** What one expression averages to. A stated average wins over the dice. */
function averageOf(m: RegExpMatchArray): number {
  /* The flat branch first: it is the only group set when it matched, and the
     dice branch's groups are all undefined behind it. */
  if (m[6] !== undefined) return parseInt(m[6], 10);
  if (m[1] !== undefined) return parseInt(m[1], 10);
  const count = parseInt(m[2]!, 10);
  const size = parseInt(m[3]!, 10);
  const mod = m[5] ? parseInt(m[5], 10) * (m[4] === '-' ? -1 : 1) : 0;
  return Math.max(0, Math.floor((count * (size + 1)) / 2) + mod);
}

/* ---------------- Cues that damage replaces rather than adds ---------------- */

/** "…, or 18 (4d6 + 4) Piercing damage if the chimera had Advantage." */
const OR_TAIL = /\bor\s*$/i;

/**
 * "2: Freezing Waves." — one item off a numbered menu.
 *
 * Usually on a line of its own, but not always: text that has been through a
 * plain-text export or an OCR pass loses its paragraph breaks and the menu
 * arrives as one long sentence. The number, colon and capital together are
 * specific enough to find it either way.
 */
const NUMBERED_OPTION = /\n\s*\d+[:.]\s|(?:^|[.\s])\d+:\s+[A-Z]/;

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
  once: 1, twice: 2, thrice: 3,
};

/** Every way a Multiattack writes how many, in one alternation. */
const COUNT_WORD = '(?:once|twice|thrice|one|two|three|four|five|six|seven|eight)';
/** The same, where it trails the verb: "attacks three times with its claws". */
const ADVERB_COUNT = `(?:once|twice|thrice|(?:one|two|three|four|five|six|seven|eight)\\s+times)`;
/** What stands between "with" and the name of the thing swung. */
const WHOSE = '(?:its|his|her|their|the|a|an|one\\s+of\\s+its|one\\s+of\\s+his|one\\s+of\\s+her)?';
/** A blow, by either of the words the books use for one. */
const BLOW = '(?:attacks?|strikes?)';

/** One clause of a Multiattack: "two Claw attacks". */
export interface RoutinePart {
  times: number;
  /** More than one name means a choice between them for each attack. */
  names: string[];
}

/** The attack routine a Multiattack line describes. */
export interface Routine {
  /**
   * An attack the creature may swap in for one of the others.
   *
   * "…makes three Engulfing Grasp or Mind Melting Ray attacks and can replace
   * one with Beckoning Wave." The replacement is not an extra attack: it buys
   * a seat the other attacks would have had. Adding it would overrate the
   * creature by a whole attack; ignoring it, which is what used to happen,
   * underrates every creature whose swap is the heavier option.
   */
  sub?: RoutinePart;
  /**
   * Alternative routines, of which the creature runs one.
   *
   * A barbed devil "makes one Claws attack and one Tail attack, or it makes
   * two Hurl Flame attacks" — three clauses, but two routines, and adding all
   * three together would give it an extra turn.
   */
  branches: RoutinePart[][];
}

function countOf(word: string): number | undefined {
  return COUNTS[word.trim().toLowerCase().replace(/\s+times$/, '')];
}

/** "Scimitar or Pistol" -> both, because each attack picks one of them. */
const splitNames = (names: string): string[] => names
  .split(/\s*,\s*|\s+(?:or|and)\s+/i)
  /* The comma is split on first, so the last item of "Bite, Claw, or Magic
     Longsword" arrives still wearing its "or". */
  .map((n) => n.trim().replace(/^(?:or|and)\s+/i, '').trim())
  .filter(Boolean);

/**
 * One clause of a routine, in either shape the book uses:
 * "one Flame Whip attack", and "three other attacks, using Claw or Tail in
 * any combination". A tarrasque's Multiattack is one of each.
 */
const clausePattern = (first: string): RegExp => new RegExp(
  '\\b(one|two|three|four|five|six|seven|eight)\\s+'
  + `(?:([${first}][^,.]*?)\\s+${BLOW}`
  + `|(?:other\\s+)?${BLOW},?\\s+using\\s+(.+?)\\s+in any combination)\\b`,
  'g');

/* Capitalised first, because that is how the books name an attack and it
   keeps "three other attacks" and "one attack with a use of" out. Only if
   nothing matches at all is the lower case tried, for a block someone wrote
   themselves as "makes two claw attacks". */
const CLAUSE = clausePattern('A-Z');
const CLAUSE_ANY_CASE = clausePattern('A-Za-z');

/**
 * The older wording, which names the weapon after the count rather than
 * before it: "makes three attacks: one with its bite and two with its claws",
 * "makes two attacks with its Talons and one attack with its Beak", "makes
 * three attacks with his greataxe".
 *
 * This is most of what Multiattack says outside the 2025 book, and none of it
 * was read. The name stops at the next "and" or "or" that introduces a count,
 * which is what keeps "two attacks with its Talons and one attack with its
 * Beak" from reading as a single attack called "Talons and one attack with
 * its Beak".
 */
const WITH_CLAUSE = new RegExp(
  '\\b(one|two|three|four|five|six|seven|eight)\\s+'
  + '(?:(?:melee|ranged|weapon|spell|magic)\\s+)*(?:attacks?\\s+)?'
  + 'with\\s+(?:its|his|her|their|the)\\s+'
  + '([A-Za-z][^,.;:]*?)'
  + '(?=\\s+(?:and|or)\\s+(?:one|two|three|four|five|six|seven|eight)\\b|[,.;:]|$)',
  'gi');

/**
 * A count and nothing else: "The library makes two attacks."
 *
 * Tried last, because it says the least. The kind, where there is one, is
 * what the reader uses to decide which of the creature's attacks it means;
 * with no kind at all, any of them will do and the heaviest wins.
 */
const BARE_CLAUSE = new RegExp(
  '\\bmakes\\s+(one|two|three|four|five|six|seven|eight)\\s+'
  + `((?:melee|ranged|weapon|spell|magic)?)\\s*${BLOW}\\b`,
  'gi');

/**
 * The count after the verb rather than before it: "Auril attacks twice with
 * her talons", "Bel attacks twice with his Greatsword and once with his
 * Tail", "the berserker attacks three times with a melee weapon".
 *
 * The largest group of Multiattacks left unread once the others were in. It
 * is the same sentence as "makes two Talon attacks" with the pieces in a
 * different order, and nothing about it is ambiguous.
 */
const ADVERB_CLAUSE = new RegExp(
  `\\b(${ADVERB_COUNT})\\s+with\\s+${WHOSE}\\s*`
  + '([A-Za-z][^,.;:]*?)'
  + `(?=\\s+(?:and|or)\\s+${ADVERB_COUNT}\\b|[,.;:]|$)`,
  'gi');

/** "makes any combination of two Bite, Claw, or Magic Longsword attacks". */
const ANY_COMBINATION = new RegExp(
  `\\bany combination of\\s+(${COUNT_WORD.slice(3, -1)})\\s+(.+?)\\s+${BLOW}\\b`,
  'gi');

/** "using its Warhammer, Throwing Hammer, or a combination of the two". */
const COMBINATION = new RegExp(
  '\\b(one|two|three|four|five|six|seven|eight)\\s+'
  + '(?:(?:other|melee|ranged|weapon)\\s+)*attacks?,?\\s+using\\s+'
  + '(?:its|his|her|their|the)?\\s*(.+?)'
  + ',?\\s+(?:in any combination|or a combination|or any combination)',
  'gi');

/**
 * "and it uses Dreadful Glare", "and then uses Stomp", "; she can also use
 * Hurl Flame" — one more action, on top of the attacks.
 *
 * The old pattern wanted the bare word "uses" preceded by "and" or a full
 * stop, which missed every variation the books actually print.
 */
const ALSO_USES = /(?:\band|\.|;)\s+(?:it|he|she|they|the\s+\w+)?\s*(?:also\s+|then\s+)?(?:can\s+(?:also\s+)?)?use[sd]?\s+(?:its\s+|his\s+|her\s+|the\s+ability\s+)?([A-Z][^,.]*?)(?=[.,]|$)/g;

/** "…if available", "…to cast Fireball" — a condition on the use, not its name. */
const QUALIFIER = /\s+(?:if\s+(?:it'?s\s+|it\s+is\s+)?(?:available|able)|to\s+cast\b.*)$/i;

/**
 * "uses its Eye Rays three times" — one action, done more than once.
 *
 * This used to be an early return at the top of parseMultiattack, which threw
 * away every attack in the same sentence: a creature that makes two longsword
 * attacks AND uses Strength Drain once scored the Strength Drain alone. It is
 * now read per sentence and joined to the branches that sentence built.
 *
 * The shape test on the name is what keeps "Spellcasting. The lich also uses
 * Psychic Whisper" out while letting "its Eye Ray" through.
 */
const REPEATED = /\buses?\s+(?:(?:its|his|her|their|the)\s+)?(.+?)\s+(once|twice|thrice|(?:one|two|three|four|five|six)\s+times)\b/gi;
const PLAIN_NAME = /^[A-Za-z][A-Za-z'\u2019\- ]*$/;

function clauses(text: string, pattern: RegExp): RoutinePart[][] {
  const branches: RoutinePart[][] = [];
  let cursor = 0;
  for (const m of text.matchAll(pattern)) {
    const times = countOf(m[1]!);
    /* The bare pattern leaves the kind empty when the text gives none, and
       "attack" is then the name — which the reader takes to mean any of them. */
    const names = splitNames(m[2]?.trim() || m[3]?.trim() || 'attack');
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
/**
 * Words that are grammar rather than the name of anything.
 *
 * "The amphisbaena makes two attacks, only one of which can be a constrict
 * attack" used to come back as one attack called "of which can be a
 * constrict", because a pattern that matched was taken as a pattern that
 * worked. The cascade below now looks at what came back, not merely that
 * something did, and falls through to a blunter reading instead.
 *
 * A closed list on purpose. The tempting version — "drop any name the stat
 * block has no action for" — would tie this reader to the creature it is
 * reading, and it has no business knowing that.
 */
const NOT_A_NAME = /^(?:of (?:which|these|those|the|them)\b|attack with\b|can\b|the ability\b|either\b)/i;

/**
 * "…and can replace one of them with a Spellcasting attack."
 *
 * Cut out of the sentence before any clause pattern sees it, because left in
 * it reads as one more attack and the creature is scored for an attack it
 * never makes.
 */
const SUBSTITUTION = /,?\s*(?:and\s+)?(?:it\s+|he\s+|she\s+|they\s+)?can\s+replace\s+([^.]*?)(?=\.|$)/i;
const SUB_COUNT = /\b(one|two|three|any one|a single)\b/i;
/* The name after "with". The first form stops at an " or " so that the 2025
   metallic dragons — "replace one attack with a use of Sleep Breath or
   Weakening Breath" — give a name rather than "Sleep Breath or". */
const SUB_NAME = [
  /\bwith\s+(?:a\s+use\s+of\s+|an?\s+|its\s+|the\s+)?([A-Z][^,.]*?)\s+or\s+/,
  /\bwith\s+(?:a\s+use\s+of\s+|an?\s+|its\s+|the\s+)?([A-Z][^,.]*?)(?=\s+attack\b|[,.]|$)/,
];

/** A sentence that starts a second routine rather than continuing the first. */
const ALTERNATIVE = /(?:\.\s*)?\bAlternatively\b\s*,?\s*|\.\s+Or\s+/g;

/**
 * The wordings, tried from the most specific to the bluntest.
 *
 * The first pattern that comes back holding something nameable wins. Before
 * this the first pattern that came back at all won, so a precise pattern that
 * matched the wrong words blocked a blunt one that would have matched the
 * right ones.
 */
/**
 * "makes two Hooves attacks, two Moon Bolt attacks, or one of each."
 *
 * Three routines, not one of four attacks. Read as a plain list the comma
 * makes the first two add up and the creature is scored for twice the attacks
 * it has seats for. The mixed branch has to be built rather than dropped: it
 * is the heaviest of the three whenever the two attacks differ.
 */
function oneOfEach(segment: string, built: RoutinePart[][]): RoutinePart[][] {
  if (!/\bor one of each\b/i.test(segment)) return built;
  const parts = built.flat();
  if (parts.length !== 2) return built;
  const [a, b] = parts as [RoutinePart, RoutinePart];
  return [[a], [b], [{ times: 1, names: a.names }, { times: 1, names: b.names }]];
}

function cascade(segment: string): RoutinePart[][] {
  for (const pattern of [
    CLAUSE, COMBINATION, WITH_CLAUSE, CLAUSE_ANY_CASE,
    ANY_COMBINATION, ADVERB_CLAUSE, BARE_CLAUSE,
  ]) {
    const found = clauses(segment, pattern)
      .map((branch) => branch.filter((part) => !NOT_A_NAME.test(part.names[0] ?? '')))
      .filter((branch) => branch.length);
    if (found.length) return oneOfEach(segment, found);
  }
  return [];
}

export function parseMultiattack(raw: string): Routine | null {
  /* An em or en dash where a comma belongs. The 2014 medusa writes its two
     alternative routines either side of a dash pair — "either three melee
     attacks—one with its snake hair and two with its shortsword—or two ranged
     attacks" — and every clause pattern stops at a comma, not a dash, so the
     "or" between the halves was invisible and the two were added together.
     Action names use the hyphen-minus, which is a different character. */
  const dashed = raw.replace(/\s*[\u2014\u2013]\s*/g, ', ');

  const swap = SUBSTITUTION.exec(dashed);
  let sub: RoutinePart | undefined;
  if (swap) {
    const clause = swap[1] ?? '';
    const named = SUB_NAME.map((re) => re.exec(clause)?.[1]?.trim()).find(Boolean);
    if (named) {
      sub = { times: countOf(SUB_COUNT.exec(clause)?.[1]?.replace(/^(?:any |a )/, '') ?? 'one') ?? 1, names: [named] };
    }
  }
  const text = swap
    ? `${dashed.slice(0, swap.index)} ${dashed.slice(swap.index + swap[0].length)}`
    : dashed;

  /* Each sentence of alternatives read on its own, so that a creature whose
     halves are worded differently gets the right pattern for each. */
  const branches: RoutinePart[][] = [];
  for (const segment of text.split(ALTERNATIVE)) {
    if (!segment || segment.trim().length < 5) continue;
    const built = cascade(segment);
    /* Scoped to this sentence: a repeat written in the second alternative
       must not be added to a routine built from the first. */
    REPEATED.lastIndex = 0;
    for (const m of segment.matchAll(REPEATED)) {
      const times = countOf(m[2]!);
      const name = m[1]!.trim();
      if (!times || !PLAIN_NAME.test(name)) continue;
      const part: RoutinePart = { times, names: [name] };
      if (!built.length) built.push([part]);
      else if (OR_TAIL.test(segment.slice(0, m.index ?? 0).trim())) built.push([part]);
      else for (const branch of built) branch.push(part);
    }
    branches.push(...built);
  }
  if (!branches.length) return null;

  /* Something used alongside the attacks belongs to every routine on offer. */
  for (const m of text.matchAll(ALSO_USES)) {
    const names = splitNames(
      m[1]!.replace(QUALIFIER, '').replace(/^either\s+/i, '').trim(),
    );
    if (!names.length) continue;
    const part: RoutinePart = { times: 1, names };
    /* The same use, counted twice. ALSO_USES sees "uses its Eye Ray twice"
       as well, and the repeat loop above has already spent it. */
    const bare = names[0]!.replace(/\s+(?:once|twice|thrice|\w+\s+times)$/i, '').toLowerCase();
    for (const branch of branches) {
      if (branch.some((held) => held.names.some((n) => n.toLowerCase() === bare))) continue;
      branch.push(part);
    }
  }
  return sub ? { branches, sub } : { branches };
}

/** "(Recharge 5-6)", "(1/Day)" — something the creature cannot do every round. */
export const isLimitedUse = (name: string): boolean =>
  /\((?:[^)]*recharge[^)]*|\s*\d+\s*\/\s*day[^)]*)\)/i.test(name);
