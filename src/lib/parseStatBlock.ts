/* Reading a stat block out of whatever text someone pasted.

   The text comes from anywhere: Homebrewery, GM Binder, D&D Beyond, a
   screenshot run through OCR. So the first thing that happens is that the
   dressing comes off — blockquote markers, markdown bold, table pipes — and
   what is left is read with patterns loose enough to cope with the rest.

   Nothing here guesses quietly. A number that cannot be found is reported
   missing and a number that fails a cross-check is reported doubtful, because
   the block lands in the editor for correcting and a wrong number that says
   nothing is worse than a gap that does. */

import {
  ABILITIES, ABILITY_LABEL, ABILITY_SHORT, ALIGNMENTS, CONDITIONS, CREATURE_TYPES,
  SIZES, SKILLS,
  abilityMod, defaultStatBlock,
} from './statblock.ts';
import type {
  Ability, ActionKind, Entry, EntrySection, SizeId, StatBlock,
} from './statblock.ts';

export interface ParseReport {
  /** Read straight off the text. */
  took: string[];
  /** Read, but something about it does not add up. */
  unsure: string[];
  /** Not found at all, and left at its default. */
  missing: string[];
}

export interface ParseResult {
  block: StatBlock;
  report: ParseReport;
}

/* ---------------- Taking the dressing off ---------------- */

/**
 * Whatever was pasted, reduced to plain lines.
 *
 * Homebrewery wraps everything in blockquotes and markdown; D&D Beyond and
 * most OCR give the words with odd spacing. Both end up here as the same
 * thing, which is what lets one set of patterns read either.
 */
export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    /* Every space that is not a space. A non-breaking space is what you get
       from a PDF, from Google Docs, from Word and from most HTML, and the
       patterns below are written with a literal ' ' between a label and its
       number — so "Armor Class\u00a015" matched nothing at all and the
       armour class and hit points of practically every pasted block were
       lost. Zero-width characters are deliberately not in this list: folding
       one to a space would insert a word break that was never there. */
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    /* An HTML tag becomes a line break rather than nothing, so that
       "</h4><p>" leaves the label and its value on separate lines where they
       can still be paired. The required letter after "<" is what keeps this
       off a stray bracket and off "< 5 ft.". */
    .replace(/<\/?(?:[a-z][a-z0-9]*)(?:\s[^<>]*)?\/?>/gi, '\n')
    /* Homebrewery's blockquote gutter, and markdown headings. */
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '')
    /* Homebrewery v3's own dressing: column breaks, and the brace tokens that
       open and close a styled block. The TOKENS go, not the lines they sit
       on — wrapping one action in a note is ordinary practice, and dropping
       the line would take the action with it. */
    .replace(/^[ \t]*:{3,}[ \t]*$/gm, '')
    .replace(/^[ \t]*\\column[ \t]*$/gm, '')
    .replace(/\{\{[a-zA-Z0-9,:#_-]*[ \t]?/g, '')
    .replace(/\}\}/g, '')
    .replace(/[ \t]*::[ \t]*/g, ' ')
    /* A markdown table's separator row carries no words. */
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}.*$/gm, '')
    .replace(/^[ \t]*_{3,}[ \t]*$/gm, '')
    .replace(/\|/g, '  ')
    /* Bold and italic markers, longest first so *** does not leave a *. */
    .replace(/\*{1,3}/g, '')
    .replace(/(^|\s)_(\S)/g, '$1$2')
    .replace(/(\S)_(\s|$)/g, '$1$2')
    /* A letter standing in for a digit. Recognition reads 0 as o or O, 1 as
       l or I and 5 as S, so "Speed 4o ft." loses its speed silently — the
       parser reports that it read everything and the number is simply wrong,
       which is worse than reporting nothing at all. Only inside a short
       token holding nothing but these letters and digits, and only where a
       digit is already there, so an ordinary word is never touched. */
    .replace(/\b[0-9oOlIS]{1,4}\b/g, (tok) => (/[0-9]/.test(tok) && /[oOlIS]/.test(tok)
      ? tok.replace(/[oO]/g, '0').replace(/[lI]/g, '1').replace(/S/g, '5')
      : tok))
    .replace(/[–—]/g, '–')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Does this look like a stat block at all, or did somebody paste a recipe? */
export function looksLikeStatBlock(text: string): boolean {
  const t = normalize(text);
  const signals = [
    /\b(?:Armor Class|AC)\b\s*:?\s*\d/i,
    /\b(?:Hit Points|HP)\b\s*:?\s*\d/i,
    /\bSTR\b/i,
    /\b(?:Challenge|CR)\b\s*:?\s*[\d/]/i,
    /\bSpeed\b\s*:?\s*\d/i,
  ];
  return signals.filter((re) => re.test(t)).length >= 2;
}

/* ---------------- Small readers ---------------- */

const first = (text: string, re: RegExp): string | null => re.exec(text)?.[1] ?? null;

/**
 * A field that says the creature has none of whatever this is.
 *
 * Blocks write it as a dash, and which dash varies by who printed it — so a
 * comparison against one literal character let the other two through, and
 * seven hundred creatures came back from their own round trip speaking a
 * language called "\u2013".
 */
const isNothing = (x: string): boolean => !x || /^(?:[-\u2013\u2014]+|none|n\/a)$/i.test(x);

/**
 * A header line, and whatever wrapped off the end of it.
 *
 * "Skills Animal Handling +5, Arcana +8, Deception +7," with "Perception +5"
 * underneath is one line in the book and two on a screen, and a pattern that
 * stops at the newline silently drops the last skill. Printed blocks wrap
 * Skills, Languages and the damage lists constantly, so this keeps reading
 * until something announces itself: another header, a section heading, or a
 * named entry. A blank line ends it too.
 */
function header(text: string, label: string): string | null {
  const lines = text.split('\n');
  const re = new RegExp(`^[ \t]*(?:${label})\\b[ \t]*:?[ \t]*(.*)$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const found = re.exec(lines[i]!);
    if (!found) continue;
    let value = (found[1] ?? '').trim();
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next.trim()) break;
      /* A label that stood alone on its line. D&D Beyond's copy-paste puts
         "Saving Throws" on one line and "Con +8, Wis +4" on the next, and the
         break below rejects that continuation because it opens with an
         ability abbreviation — which is also a header label. Only where
         nothing at all was read from the label's own line, and only for lines
         that could not be anything but a value. */
      if (!value && /^[ \t]*(?:Str|Dex|Con|Int|Wis|Cha|Darkvision|Blindsight|Tremorsense|Truesight)\b/i.test(next)) {
        value = next.trim();
        continue;
      }
      if (HEADER_LABEL.test(next) || headingFor(next) || ENTRY_START.test(next)) break;
      value += ` ${next.trim()}`;
    }
    return value || null;
  }
  return null;
}
const firstNumber = (text: string, re: RegExp): number | null => {
  const found = first(text, re);
  if (found === null) return null;
  const n = Number(found);
  return Number.isFinite(n) ? n : null;
};

/** The average of "19d12 + 133", as the books round it: down. */
export function diceAverage(formula: string): number | null {
  const m = /(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/i.exec(formula);
  if (!m) return null;
  const count = Number(m[1]);
  const size = Number(m[2]);
  const mod = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
  return Math.max(1, Math.floor((count * (size + 1)) / 2) + mod);
}

/**
 * The six ability scores, in either of the two ways they are laid out.
 *
 * Most blocks put the score beside its name, so the first number after STR is
 * the Strength. A table puts all six names on one row and all six scores on
 * the next, where the first number after STR is the Strength of nothing in
 * particular — so that case is spotted by the names running together with no
 * digits between them, and the scores are matched by position instead.
 */
/** The six labels in order, whatever punctuation recognition put between them. */
const ABILITY_HEADER = 'STRDEXCONINTWISCHA';

/** The long forms, for a block that spells them out. */
const ABILITY_WORD: Record<Ability, string> = {
  str: 'STR|Strength', dex: 'DEX|Dexterity', con: 'CON|Constitution',
  int: 'INT|Intelligence', wis: 'WIS|Wisdom', cha: 'CHA|Charisma',
};

function readAbilities(text: string): Record<Ability, number> | null {
  /* The header found by reduction rather than by pattern: one stray mark
     between two labels used to cost all six scores, which then silently
     became 10 apiece. */
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.replace(/[^A-Za-z]/g, '').toUpperCase() === ABILITY_HEADER);
  const headerAt = at >= 0
    ? { index: lines.slice(0, at).join('\n').length + (at ? 1 : 0), 0: lines[at]! }
    : null;
  if (headerAt) {
    /* Each cell states the score and then the modifier it implies — "18 (+4)"
       — and only the first of those is the score. The bracket goes, and a
       sign in front rules out whatever survived it. */
    const after = text
      .slice(headerAt.index + headerAt[0].length)
      .replace(/\([^)]*\)/g, ' ');
    /* Only the two lines under the header. Reaching further for a sixth
       number is how a block with a gap in its table ends up wearing numbers
       from the prose below it. */
    const near = after.split('\n').slice(0, 3).join(' ');
    const numbers = [...near.matchAll(/(?<![+-])\b(\d{1,2})\b/g)].slice(0, 6).map((m) => Number(m[1]));
    if (numbers.length === 6) {
      return Object.fromEntries(ABILITIES.map((a, i) => [a, numbers[i]!])) as Record<Ability, number>;
    }
    /* Six were not there. Fall through to reading each by its own label,
       which is slower to satisfy and impossible to get out of order. */
  }

  const out = {} as Record<Ability, number>;
  for (const a of ABILITIES) {
    /* The gap used to be `[^0-9a-z]`, and the `i` flag applies inside a
       negated class too — so it excluded capitals as well and the gap could
       hold no letters at all. "STR MOD 18" has MOD in the way and returned
       nothing, which silently became a score of 10. The class now excludes
       only digits, which the flag cannot touch, so the flag is free to do
       the one job it was there for: matching a label OCR gave back as
       "wis". */
    const n = firstNumber(text, new RegExp(`\\b(?:${ABILITY_WORD[a]})\\b[^0-9\\n]{0,12}(\\d{1,2})\\b`, 'i'));
    if (n === null) return null;
    out[a] = n;
  }
  return out;
}

/* ---------------- Entries ---------------- */

interface Heading {
  re: RegExp;
  /** The same words with everything but letters taken out, for a near match. */
  keys: string[];
  section: EntrySection;
  kind?: ActionKind;
}

const HEADINGS: Heading[] = [
  { re: /^legendary actions?$/i, keys: ['legendaryaction', 'legendaryactions'], section: 'legendary' },
  { re: /^lair actions?$/i, keys: ['lairaction', 'lairactions'], section: 'lair' },
  { re: /^bonus actions?$/i, keys: ['bonusaction', 'bonusactions'], section: 'action', kind: 'bonus' },
  { re: /^reactions?$/i, keys: ['reaction', 'reactions'], section: 'action', kind: 'reaction' },
  { re: /^actions?$/i, keys: ['action', 'actions'], section: 'action', kind: 'action' },
  { re: /^(?:traits?|special (?:traits|abilities))$/i, keys: ['trait', 'traits', 'specialtraits', 'specialabilities'], section: 'trait' },
];

/** Whether two words differ by at most one letter added, dropped or changed. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (++slips > 1) return false;
    if (short.length === long.length) i++;
    j++;
  }
  return slips + (long.length - j) + (short.length - i) <= 1;
}

/**
 * Which section a line announces, if it announces one.
 *
 * Headings are printed in small capitals, and small capitals are what optical
 * recognition is worst at: "BONUS ACTIONS" came back as "Bonus AcTioNns".
 * Miss it and every bonus action is filed as an action. One wrong letter is
 * still plainly the heading — two would be a guess, so one is all that is
 * allowed, and only on a line short enough to be a heading in the first place.
 */
function headingFor(line: string): Heading | null {
  const trimmed = line.trim();
  const exact = HEADINGS.find((h) => h.re.test(trimmed));
  if (exact) return exact;
  const key = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  if (!key || key.length > 20 || trimmed.length > 24) return null;
  return HEADINGS.find((h) => h.keys.some((k) => near(key, k))) ?? null;
}

/** The line that ends the header block and starts the prose. */
const LAST_HEADER = /^(?:Proficiency Bonus|Challenge|CR)(?![a-z])[^\n]*$/gim;

/* Everything that announces itself at the start of a line in the top half of
   a block. Used to tell a header apart from the tail of the one above it. */
const HEADER_LABEL = /^[ \t]*(?:Armor Class|AC|Initiative|Hit Points|HP|Speed|Saving Throws|Saves|Skills|Gear|Damage Vulnerabilities|Vulnerabilities|Damage Resistances|Resistances|Damage Immunities|Immunities|Condition Immunities|Senses|Languages|Challenge|CR|Proficiency Bonus|PB|STR|DEX|CON|INT|WIS|CHA)\b/i;

/**
 * "Pack Tactics. The wolf has Advantage…" split into its name and its body.
 *
 * The name is short, ends in a full stop or a colon, and does not run past a
 * clause — which is what keeps the first sentence of an unnamed paragraph
 * from being mistaken for one.
 */
const ENTRY = /^([A-Z][^.\n]{0,58}?)\s*[.:]\s+([\s\S]+)$/;

/**
 * A line that starts an entry of its own: a short name, then a full stop.
 *
 * Optical recognition gives one line per line of the picture and no blank
 * lines at all, so a whole action list arrives as a single paragraph. The
 * full stop is what makes this safe — a stat block names its entries
 * "Multiattack." but writes its clauses "Hit:" and "Failure:", so requiring
 * the stop keeps the halves of an attack line from each becoming an action.
 */
const ENTRY_START = /^([A-Z][^.\n]{0,58}?)\.\s+\S/;

/** A line that finished what it was saying. */
const SENTENCE_END = /[.!?:][)"'\u201d\u2019]?\s*$/;

/** Words that open a clause rather than name an entry. */
const CLAUSE = /^(?:Hit|Miss|Failure|Success|Trigger|Response|Melee|Ranged|At Will|The|If|On|While|When|Each|Whenever)\b/i;

/**
 * One paragraph split at whatever lines inside it begin a new entry.
 *
 * Lines that do not begin one are joined onto the entry above, which is what
 * puts a wrapped sentence back together.
 */
function splitEntries(block: string): string[] {
  const out: string[] = [];
  /* Whether the line before this one finished a sentence.
     A name only begins an entry where a sentence has just ended. Without
     that, a sentence that wrapped mid-phrase started one of its own: "…within
     10ft of the Death / Warden. Hit: 12 (2d8+3)…" put an action called Warden
     into the list, and "…from the Material / Plane or vice versa. If doing so…"
     added one called Plane or vice versa. Both read as a capitalised name
     followed by a full stop, because that is exactly what they are — the
     difference is entirely in what came before them. */
  let closed = true;
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = ENTRY_START.exec(line);
    const name = m?.[1] ?? '';
    const starts = Boolean(m) && name.split(/\s+/).length <= 6 && !CLAUSE.test(name) && closed;
    if (starts || !out.length) out.push(line);
    else out[out.length - 1] += ` ${line}`;
    closed = SENTENCE_END.test(line);
  }
  return out;
}

/** One pattern matching any heading, for finding them mid-paragraph. */
const HEADING_LINE = new RegExp(
  `^[ \t]*(${HEADINGS.map((h) => h.re.source.replace(/^\^|\$$/g, '')).join('|')})[ \t]*$`,
  'gim',
);

function readEntries(body: string, report: ParseReport): Record<EntrySection, Entry[]> {
  /* A heading does not always get a blank line to itself — Homebrewery puts
     "### Actions" hard against the trait above it — so one is given here.
     Without it the heading is swallowed into the trait's text and everything
     below stays filed as a trait. */
  const spaced = body.replace(HEADING_LINE, '\n\n$1\n\n');
  const entries: Record<EntrySection, Entry[]> = {
    trait: [], action: [], legendary: [], lair: [],
  };
  let section: EntrySection = 'trait';
  let kind: ActionKind = 'action';
  let id = 0;
  let unnamed = 0;

  for (const raw of spaced.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;

    const heading = headingFor(block);
    if (heading) {
      section = heading.section;
      kind = heading.kind ?? 'action';
      continue;
    }
    /* A heading can share a line with what follows it when the blank line
       between them was lost, which OCR does constantly. */
    const firstLine = block.split('\n')[0]?.trim() ?? '';
    const lead = headingFor(firstLine);
    if (lead) {
      section = lead.section;
      kind = lead.kind ?? 'action';
      const rest = block.slice(firstLine.length).trim();
      if (!rest) continue;
      for (const piece of splitEntries(rest)) pushEntry(piece);
      continue;
    }
    for (const piece of splitEntries(block)) pushEntry(piece);
  }

  function pushEntry(block: string): void {
    const flat = block.replace(/\n/g, ' ');
    const found = ENTRY.exec(flat);
    /* A colon is not a full stop. "At Will: Detect Magic, Disguise Self" is
       the second half of a Spellcasting entry, not an action called At Will;
       so is a spell list's level heading, and so is "Failure:". Where the
       section already holds something, a colon-named paragraph belongs to it.
       A full stop still names an entry, because that is how a stat block
       announces one. */
    const colonNamed = Boolean(found) && /^[A-Z][^.\n]{0,58}?:/.test(flat);
    const m = colonNamed && entries[section].length ? null : found;
    if (!m) {
      /* Prose with no name in front of it — a legendary action preamble, or a
         paragraph that belongs to whatever came before. */
      const list = entries[section];
      const previous = list[list.length - 1];
      if (previous) previous.text = `${previous.text}\n\n${block.trim()}`;
      /* The sentence that opens a legendary section — "The empty swarm can
         take 2 legendary actions, choosing from the options below" — is the
         one paragraph that is meant to have no name. It belongs to the block
         rather than to any entry, and the count has already been read out of
         it, so it is neither filed nor complained about. */
      else if (!(section === 'legendary' && /legendary action/i.test(block))) unnamed += 1;
      return;
    }
    entries[section].push({
      id: `p${id++}`,
      name: m[1]!.trim(),
      text: m[2]!.trim(),
      ...(section === 'action' ? { kind } : {}),
    });
  }

  if (unnamed) report.unsure.push(`${unnamed} paragraph${unnamed === 1 ? '' : 's'} had no name in front and could not be filed`);
  return entries;
}

/* ---------------- The whole thing ---------------- */

export function parseStatBlock(input: string): ParseResult {
  const text = normalize(input);
  const block = defaultStatBlock();
  const report: ParseReport = { took: [], unsure: [], missing: [] };

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  /* The creature's name, not whatever happens to be on the first line.
     Recognition puts a speck above the block and the first line comes back as
     "o"; a two-column crop welds the right column's heading onto it and it
     comes back as "Owl ACTIONS". Walk down until something looks like a name.

     The heading strip has to run before the capitals repair, because the
     welded heading is also where the lower case comes from that makes the
     name look like it was deliberately mixed. */
  const HEADING_TAIL = /\s+(?:ACTIONS?|BONUS ACTIONS?|REACTIONS?|LEGENDARY ACTIONS?|TRAITS?|LAIR ACTIONS?)\s*$/i;
  const titleish = (line: string): boolean =>
    line.replace(HEADING_TAIL, '').trim().length >= 3
    && !HEADER_LABEL.test(line)
    && !headingFor(line)
    && !SIZES.some((z) => new RegExp(`^${z}\\b`, 'i').test(line));
  const chosen = lines.slice(0, 4).find(titleish);
  if (chosen === undefined) report.missing.push('Name');
  const printed = (chosen ?? 'Monster').replace(HEADING_TAIL, '').trim();
  block.name = /[a-z]/.test(printed) ? printed : printed.toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|And|A|An|In|On|To|From)\b/g, (w, _m, at: number) => (at === 0 ? w : w.toLowerCase()));
  report.took.push(`Name: ${block.name}`);

  /* "Huge Dragon, Chaotic Evil" — each part optional, in any of the casings
     the different generators use. */
  const meta = lines.slice(1, 6).find((l) => SIZES.some((s) => new RegExp(`^${s}\\b`, 'i').test(l)));
  if (meta) {
    const size = SIZES.find((s) => new RegExp(`^${s}\\b`, 'i').test(meta));
    if (size) block.size = size as SizeId;
    const type = CREATURE_TYPES.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(meta));
    if (type) block.type = type;
    const alignment = [...ALIGNMENTS]
      .sort((a, b) => b.length - a.length)
      .find((a) => new RegExp(`\\b${a}\\b`, 'i').test(meta));
    if (alignment) block.alignment = alignment;
    report.took.push(`${block.size} ${block.type}, ${block.alignment}`);
  } else {
    report.missing.push('Size, type and alignment');
  }

  /* `\b` does not sit between a letter and a digit, so a label the recogniser
     ran together with its number — "AC15", "CR5" — matched nothing at all.
     Every label below allows the space to be missing. */
  const ac = firstNumber(text, /^\s*(?:Armor Class|AC)\s*:?\s*(\d+)/im);
  if (ac === null) report.missing.push('Armor Class');
  else {
    block.acValue = ac;
    /* "AC 15 (natural armor)". The bracket has to follow the number with
       nothing in between, or "AC 13 Initiative +0 (10)" would hand over the
       initiative roll as the armour it is wearing. */
    block.acNote = first(text, /^[ \t]*(?:Armor Class|AC)[ \t]*:?[ \t]*\d+[ \t]*\(([^)]+)\)/im) ?? '';
    report.took.push(`Armor Class ${ac}${block.acNote ? ` (${block.acNote})` : ''}`);
  }

  const hp = firstNumber(text, /^\s*(?:Hit Points|HP)\s*:?\s*(\d+)/im);
  if (hp === null) report.missing.push('Hit Points');
  else { block.hpValue = hp; report.took.push(`Hit Points ${hp}`); }

  /* The hit dice state the hit points a second time, so the two can be held
     against each other. A mismatch means one of them was misread. */
  const formula = first(text, /^\s*(?:Hit Points|HP)[^\n(]*\(([^)]*d[^)]*)\)/im);
  /* A block printed without hit dice should not come back with hit dice. The
     test is whether anything was in brackets after the hit points, not whether
     it could be read as dice: "HP 142 (19d8 + 57)" comes back off a picture as
     "(1948 + 57)" often enough, and the dice were plainly printed. */
  block.showHitDice = /^[ \t]*(?:Hit Points|HP)[^\n(]*\(/im.test(text);
  if (hp !== null && formula) {
    const average = diceAverage(formula);
    if (average !== null && Math.abs(average - hp) > 2) {
      report.unsure.push(`Hit Points say ${hp} but ${formula.trim()} averages ${average}`);
    }
  }

  /* "Initiative +5 (15)" is a proficiency, not a number the block stores: the
     editor holds whether the creature is proficient, and works the rest out.
     Which it is follows from how far the printed bonus sits above what the
     Dexterity alone would give. */
  /* Not anchored to the start of a line: this style prints "AC 15  Initiative
     +5 (15)" as one line, so the label turns up halfway along it. The sign is
     required, which is what keeps a lair action's "on initiative count 20"
     from being read as a creature with +20 to go first. */
  const initiative = firstNumber(text, /\bInitiative\b[ \t]*:?[ \t]*([+-]\d+)/i);

  const speed = first(text, /^\s*Speed\b\s*:?\s*(.+)$/im);
  if (speed) {
    block.speeds.walk = firstNumber(speed, /^\s*(\d+)/) ?? 0;
    for (const kind of ['burrow', 'climb', 'fly', 'swim'] as const) {
      block.speeds[kind] = firstNumber(speed, new RegExp(`${kind}\\s*:?\\s*(\\d+)`, 'i')) ?? 0;
    }
    block.speeds.hover = /hover/i.test(speed);
    /* Speeds come in fives and nothing in the game moves 400 feet. A number
       that is neither is a misread digit the repair in normalize did not
       catch, and saying so is the difference between a wrong answer and a
       flagged one. */
    for (const [kind, v] of ([['walk', block.speeds.walk], ['burrow', block.speeds.burrow],
      ['climb', block.speeds.climb], ['fly', block.speeds.fly],
      ['swim', block.speeds.swim]] as const)) {
      if (v > 0 && (v % 5 !== 0 || v > 120)) {
        report.unsure.push(`A ${kind} speed of ${v} ft. is not a speed the game uses`);
      }
    }
    report.took.push(`Speed ${speed.trim()}`);
  } else {
    report.missing.push('Speed');
  }

  const abilities = readAbilities(text);
  if (abilities) {
    block.abilities = abilities;
    report.took.push(`Ability scores ${ABILITIES.map((a) => abilities[a]).join(' ')}`);
  } else {
    report.missing.push('Ability scores');
  }
  const mods = Object.fromEntries(
    ABILITIES.map((a) => [a, abilityMod(block.abilities[a])]),
  ) as Record<Ability, number>;

  /* Proficiency is stated by most blocks and implied by the rest: the table
     fixes it from the challenge rating. */
  /* "PB +3" is written on its own line in one house style and tucked inside
     the challenge line's brackets — "CR 5 (XP 1,800; PB +3)" — in another. */
  const statedPb = firstNumber(text, /(?:Proficiency Bonus|PB)\s*:?\s*\+?(\d+)/i);
  const cr = first(text, /^\s*(?:Challenge|CR)\s*:?\s*([\d/]+)/im);
  if (statedPb !== null) block.proficiencyBonus = statedPb;
  else if (cr) {
    const value = cr.includes('/') ? 0 : Number(cr);
    block.proficiencyBonus = Math.max(2, Math.min(9, 2 + Math.floor(Math.max(0, value - 1) / 4)));
    report.unsure.push(`Proficiency bonus not stated; CR ${cr} implies +${block.proficiencyBonus}`);
  } else {
    report.missing.push('Proficiency bonus and challenge rating');
  }
  if (cr) report.took.push(`The block says CR ${cr}`);

  const saves = header(text, 'Saving Throws');
  if (saves) {
    for (const a of ABILITIES) {
      if (new RegExp(`\\b${ABILITY_SHORT[a]}\\w*\\s*[+-]`, 'i').test(saves)) block.saves.push(a);
    }
    if (block.saves.length) report.took.push(`Saving throws ${saves.trim()}`);
  }

  /* Some blocks have no Saving Throws line at all, because the saves are a
     column of the ability table:

         MOD SAVE              MOD SAVE
     STR 19  +4  +4        INT 12  +1  +1
     WIS 16  +3  +6        CHA 17  +3  +6

     A save that is not simply the modifier is a proficient one, so the two
     columns disagreeing is the whole signal. Only consulted when there was no
     Saving Throws line, so a block that has one is left alone. */
  if (!block.saves.length) {
    const row = /\b(STR|DEX|CON|INT|WIS|CHA)\b[^\S\n]*\d{1,2}[^\S\n]+([+-][^\S\n]?\d+)[^\S\n]+([+-][^\S\n]?\d+)/gi;
    const found: Ability[] = [];
    for (const m of text.matchAll(row)) {
      const which = ABILITIES.find((a) => ABILITY_LABEL[a].toLowerCase() === (m[1] ?? '').toLowerCase());
      const mod = Number((m[2] ?? '').replace(/\s+/g, ''));
      const save = Number((m[3] ?? '').replace(/\s+/g, ''));
      if (which && Number.isFinite(mod) && Number.isFinite(save) && save !== mod) found.push(which);
    }
    if (found.length) {
      block.saves = found;
      report.took.push(`Saving throws ${found.map((a) => ABILITY_LABEL[a]).join(', ')}, from the ability table`);
    }
  }

  const skills = header(text, 'Skills');
  if (skills) {
    for (const m of skills.matchAll(/([A-Za-z][A-Za-z ]*?)\s*([+-]\s*\d+)/g)) {
      const def = SKILLS.find((s) => s.name.toLowerCase() === (m[1] ?? '').trim().toLowerCase());
      if (!def) continue;
      const printed = Number((m[2] ?? '').replace(/\s+/g, ''));
      const once = mods[def.ability] + block.proficiencyBonus;
      const twice = mods[def.ability] + block.proficiencyBonus * 2;
      block.skills[def.id] = Math.abs(printed - twice) < Math.abs(printed - once)
        ? 'expertise' : 'proficient';
    }
    if (Object.keys(block.skills).length) report.took.push(`Skills ${skills.trim()}`);
  }

  const words = (label: string): string[] => {
    /* Grouped, or the alternation in a label like "Damage Resistances|
       Resistances" would swallow everything after it. */
    const found = header(text, label);
    return found ? found.split(/[,;]/).map((x) => x.trim()).filter((x) => !isNothing(x)) : [];
  };
  block.vulnerabilities = words('Damage Vulnerabilities|Vulnerabilities');
  block.resistances = words('Damage Resistances|Resistances');
  block.damageImmunities = words('Damage Immunities');
  block.conditionImmunities = words('Condition Immunities');
  /* One line for both, divided by a semicolon: "Immunities Necrotic, Poison;
     Charmed, Frightened, Poisoned". Only consulted when the block did not
     name the two lists separately, so a block that did is left alone. */
  if (!block.damageImmunities.length && !block.conditionImmunities.length) {
    const both = header(text, 'Immunities');
    if (both) {
      const [damage, conditions] = both.split(';');
      const split = (part: string | undefined): string[] => (part ?? '')
        .split(',').map((x) => x.trim()).filter((x) => !isNothing(x));
      /* Without a semicolon it is one list, and which list it is depends on
         what is in it: a condition is a condition wherever it is written. */
      if (conditions === undefined) {
        for (const name of split(damage)) {
          (CONDITIONS.some((c) => c.toLowerCase() === name.toLowerCase())
            ? block.conditionImmunities : block.damageImmunities).push(name);
        }
      } else {
        block.damageImmunities = split(damage);
        block.conditionImmunities = split(conditions);
      }
    }
  }

  const senses = header(text, 'Senses');
  if (senses) {
    for (const kind of ['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const) {
      block.senses[kind] = firstNumber(senses, new RegExp(`${kind}\\s*(\\d+)`, 'i')) ?? 0;
    }
    block.senses.blindBeyond = /blind beyond/i.test(senses);
  }

  const languages = header(text, 'Languages');
  if (languages) {
    block.telepathy = firstNumber(languages, /telepathy\s*(\d+)/i) ?? 0;
    block.languages = languages.split(/[;,]/).map((x) => x.trim())
      .filter((x) => !isNothing(x) && !/telepathy/i.test(x));
  }

  if (initiative !== null) {
    const over = initiative - mods.dex;
    const pb = block.proficiencyBonus;
    const tier = Math.abs(over - pb * 2) <= 1 ? 'expertise'
      : Math.abs(over - pb) <= 1 ? 'proficient'
        : 'none';
    block.initiative = tier;
    if (tier !== 'none') report.took.push(`Initiative +${initiative}, which is ${tier}`);
  }

  /* Everything after the last header line is prose — the LAST one, which is
     why the pattern is global and the loop runs to the end. Challenge and
     Proficiency Bonus are each other's neighbours and the order varies, so
     stopping at the first match left "Proficiency Bonus +5" sitting at the
     top of the body, where it was welded onto the opening trait and produced
     one called "Proficiency Bonus +5 Aura of Emptiness". */
  LAST_HEADER.lastIndex = 0;
  let end: RegExpExecArray | null = null;
  for (let m = LAST_HEADER.exec(text); m; m = LAST_HEADER.exec(text)) end = m;
  const body = end ? text.slice(end.index + end[0].length) : '';
  block.entries = readEntries(body, report);
  if (block.entries.legendary.length) {
    const uses = firstNumber(text, /can take (\d+) legendary action/i)
      ?? firstNumber(text, /Legendary Action Uses:?\s*(\d+)/i);
    if (uses !== null) block.legendaryCount = Math.max(1, Math.min(5, uses));
  }

  const total = Object.values(block.entries).reduce((a, l) => a + l.length, 0);
  if (total) report.took.push(`${total} traits and actions`);
  else report.missing.push('Traits and actions');

  /* An attack bonus far from what the abilities and proficiency allow is the
     surest sign a digit was misread. */
  const best = Math.max(mods.str, mods.dex);
  for (const m of text.matchAll(/(?:Attack Roll:|to hit)\D{0,6}([+-]?\d+)/gi)) {
    const bonus = Number(m[1]);
    if (Math.abs(bonus - (best + block.proficiencyBonus)) > 4) {
      report.unsure.push(`An attack bonus of ${bonus >= 0 ? '+' : ''}${bonus} does not follow from these ability scores and a proficiency of +${block.proficiencyBonus}`);
      break;
    }
  }

  return { block, report };
}
