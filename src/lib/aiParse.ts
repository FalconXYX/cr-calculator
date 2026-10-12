/* The AI reader, the page's half.

   The built-in reader is a set of rules about how stat blocks are laid out,
   and every homebrew template breaks a different one. This asks a model
   instead — through a free Cloudflare Worker — and falls back to the rules
   whenever the model is unavailable: not configured, out of today's free
   allowance, slow, down, or answering in a shape that does not hold up.

   The model does not write the stat block. It annotates the text (see
   aiSchema.ts): header values copied out, and each entry's name with the
   first and last words of its body. From that this file lays out a clean,
   conventional block — the bodies cut from the original text, so the dice
   are the dice that were printed — and hands it to the built-in reader,
   which reads that layout essentially perfectly. Everything the reader
   already does, the cross-checks and the report of what was found and what
   was not, is kept for free.

   Then the two readings are combined: anything the model left out that the
   rules did find is taken from the rules. Neither reader is trusted to be
   right everywhere, and each is good where the other is weak. */

import { normalize, parseStatBlock } from './parseStatBlock.ts';
import type { ParseResult } from './parseStatBlock.ts';
import { AI_SECTIONS } from './aiSchema.ts';
import type { AiEntry, AiExtraction, AiSection } from './aiSchema.ts';
import type { StatBlock } from './statblock.ts';
import { readStored, writeStored } from '../hooks/usePersistentState.ts';

/* ---------------- Where the Worker is ---------------- */

const URL_KEY = 'cr-calc-reader-url';

/**
 * The Worker's address, or '' when there is none and the AI reader is off.
 *
 * Baked in at build time, with a storage override so a freshly deployed
 * Worker can be tried before the site is rebuilt. Read inside a try because
 * outside a Vite build — the tests — there is no `import.meta.env` at all.
 */
export function readerUrl(): string {
  let baked: unknown;
  try {
    baked = import.meta.env.VITE_READER_URL;
  } catch {
    baked = undefined;
  }
  if (typeof baked === 'string' && baked.trim()) return baked.trim();
  try {
    const stored = localStorage.getItem(URL_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch { /* storage blocked: no override */ }
  return '';
}

/* ---------------- Today's allowance ---------------- */

const SPENT_KEY = 'cr-calc-reader-spent';

/** The free allowance resets at midnight UTC, so a day is a UTC date. */
const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/**
 * Whether this browser has already been told the allowance is gone today.
 *
 * Remembered so that every block after the first refusal skips straight to
 * the built-in reader instead of waiting on a request that will fail.
 */
export const spentToday = (now: number = Date.now()): boolean =>
  readStored<string>(SPENT_KEY, '') === utcDay(now);

const markSpent = (now: number): void => writeStored(SPENT_KEY, utcDay(now));

/* ---------------- Reading the model's answer ---------------- */

/** The model's answer, checked field by field. Null if it is not one. */
export function reviveExtraction(raw: unknown): AiExtraction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const s = (key: string): string => (typeof r[key] === 'string' ? (r[key] as string).trim() : '');
  const n = (key: string): number => {
    const v = Number(r[key]);
    return Number.isFinite(v) ? Math.round(v) : 0;
  };

  const entries: AiEntry[] = [];
  if (Array.isArray(r.entries)) {
    for (const item of r.entries) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      const section = AI_SECTIONS.find((x) => x === e.section);
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (!section || !name) continue;
      entries.push({
        section,
        name,
        opening: typeof e.opening === 'string' ? e.opening.trim() : '',
      });
    }
  }

  return {
    name: s('name'),
    sizeTypeAlignment: s('sizeTypeAlignment'),
    armorClass: s('armorClass'),
    hitPoints: s('hitPoints'),
    speed: s('speed'),
    initiative: s('initiative'),
    str: n('str'), dex: n('dex'), con: n('con'), int: n('int'), wis: n('wis'), cha: n('cha'),
    savingThrows: s('savingThrows'),
    skills: s('skills'),
    damageVulnerabilities: s('damageVulnerabilities'),
    damageResistances: s('damageResistances'),
    damageImmunities: s('damageImmunities'),
    conditionImmunities: s('conditionImmunities'),
    senses: s('senses'),
    languages: s('languages'),
    challenge: s('challenge'),
    proficiencyBonus: s('proficiencyBonus'),
    legendaryActionsPerRound: n('legendaryActionsPerRound'),
    entries,
  };
}

/* ---------------- Finding the quoted words in the text ---------------- */

/**
 * The text with every space taken out, and where each remaining character
 * came from.
 *
 * Quotes are searched for with the spaces gone because spacing is exactly
 * what recognition gets wrong — "9(2d8)" on the page, "9 (2d8)" in the
 * model's copy — and a search that cared about it would miss for no reason.
 * Lower case, and the curly quotes and long dashes a model may straighten,
 * for the same reason.
 */
interface Dense {
  text: string;
  /** Index in the source of each character of `text`. */
  at: number[];
}

function fold(c: string): string {
  if (c === '‘' || c === '’') return "'";
  if (c === '“' || c === '”') return '"';
  if (c === '–' || c === '—') return '-';
  const lower = c.toLowerCase();
  return lower.length === 1 ? lower : c;
}

function densify(source: string): Dense {
  let text = '';
  const at: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (/\s/.test(c)) continue;
    text += fold(c);
    at.push(i);
  }
  return { text, at };
}

const squeeze = (s: string): string => densify(normalize(s)).text;

/** The first few words of a quote, which is all that has to match. */
const head = (quote: string, words: number): string =>
  quote.split(/\s+/).filter(Boolean).slice(0, words).join(' ');

/** Where a quote starts in the source, searching from `from`; -1 if nowhere. */
function find(dense: Dense, quote: string, from: number): { start: number; end: number } | null {
  const needle = squeeze(quote);
  if (needle.length < 3) return null;
  /* `from` is a source index; find the first dense character at or after it. */
  let lo = 0;
  while (lo < dense.at.length && dense.at[lo]! < from) lo++;
  const hit = dense.text.indexOf(needle, lo);
  if (hit < 0) return null;
  return { start: dense.at[hit]!, end: dense.at[hit + needle.length - 1]! + 1 };
}

/**
 * Where an entry's name and body begin, searching from `from`.
 *
 * The name, then its opening words straight after it with nothing between
 * but punctuation — "Pack Tactics. The wolf…", "Claw MWA: +10…", "Deathly
 * Grip The Frostfallen…". Each mention of the name is tried in turn, which is
 * what passes over "one Bite attack" in the Multiattack to reach the Bite.
 * Failing that, the opening words alone, if there are enough of them to be
 * unlikely anywhere else.
 */
function locate(dense: Dense, source: string, e: AiEntry, from: number): Start | null {
  for (const words of [4, 3, 2]) {
    const opening = head(e.opening, words);
    if (!opening) break;
    let after = from;
    for (let tries = 0; tries < 40; tries++) {
      const named = find(dense, e.name, after);
      if (!named) break;
      const open = find(dense, opening, named.end);
      const gap = open ? GAP.exec(source.slice(named.end, open.start)) : null;
      if (open && gap) return { name: named.start, body: open.start, bracket: gap[1] ?? '' };
      after = named.start + 1;
    }
  }
  const opening = head(e.opening, 4);
  if (opening.split(' ').length >= 3) {
    const bare = find(dense, opening, from);
    if (bare) return { name: bare.start, body: bare.start, bracket: '' };
  }
  return null;
}

interface Start {
  /** Where the name begins in the source. */
  name: number;
  /** Where the body begins. */
  body: number;
  /** A bracket printed after the name that the model's copy of it left off. */
  bracket: string;
}

/**
 * What may sit between a name and the first words of its body: punctuation,
 * and a bracket. The bracket is part of the name — "(Recharge 5–6)",
 * "(3/Day)" — and the model drops it even when told not to, which loses the
 * one word that says a breath weapon is not used every round. So it is found
 * here, in the printed text, rather than trusted to the model.
 */
const GAP = /^[\s.:;,–—-]{0,6}(?:(\([^()\n]{1,60}\))[\s.:;,–—-]{0,6})?$/;

/* ---------------- Laying the block out ---------------- */

const HEADING: Record<AiSection, string> = {
  trait: 'TRAITS',
  action: 'ACTIONS',
  bonus: 'BONUS ACTIONS',
  reaction: 'REACTIONS',
  legendary: 'LEGENDARY ACTIONS',
  lair: 'LAIR ACTIONS',
};

/** A word of the body that a model has kept on the end of the name. */
const BODY_WORD = /\s+(MWA|RWA|MSA|RSA|Trigger)$/i;

/**
 * A line that is a heading and nothing else.
 *
 * A body stops at one. That is what keeps the last trait out of the Actions
 * heading, the last action out of Reactions — and the last entry of all out
 * of a Description section, a Mythic Actions template, or whatever else a
 * page prints underneath the block.
 */
const HEADING_LINE = /^(?:traits?|special traits|actions?|bonus actions?|reactions?|legendary actions?|lair actions?|mythic actions?|regional effects|description|lore)$/i;

/**
 * Whatever recognition left after the last sentence: the frame of the card
 * read as "Eee", a rule read as "—_". Only stripped when every word of it is
 * too short to be a word or no word at all — "…(included in attack)" ends
 * without a stop and is kept whole.
 */
function dropTrailingJunk(body: string): string {
  const end = /^([\s\S]*[.!?)])([^.!?)]*)$/.exec(body);
  if (!end) return body;
  const junk = end[2]!.split(/\s+/).filter(Boolean)
    .every((word) => /^(?:[^A-Za-z0-9]+|[A-Za-z]{1,3})$/.test(word));
  return junk ? end[1]! : body;
}

/** The label a model sometimes copies along with the value. */
const LEADING_LABEL = /^(?:Armor Class|AC|Hit Points|HP|Speed|Spd|Initiative|Saving Throws|Saves|Skills|Damage Vulnerabilities|Vulnerabilities|Damage Resistances|Resistances|Damage Immunities|Condition Immunities|Immunities|Senses|Languages|Challenge|CR|Proficiency Bonus|PB)\b\s*:?\s*/i;

const value = (v: string): string => v.replace(LEADING_LABEL, '').trim();

export interface Layout {
  /** The block, in the layout the built-in reader reads best. */
  text: string;
  /** Entries the model listed. */
  expected: number;
  /** Entries whose body could be found in the original text. */
  located: number;
}

/**
 * The model's annotation, laid out as a conventional stat block.
 *
 * `original` is what was pasted. Every entry's body is cut out of it, from
 * the quoted opening words to the next entry or heading; an entry that cannot
 * be found there is left out rather than given words the model made up.
 */
export function layOut(x: AiExtraction, original: string): Layout {
  /* Line breaks kept. Searching ignores them, and keeping them means a body
     holding an entry the model skipped still has that entry starting on a
     line of its own — where the built-in reader, which reads every body
     again, can split it back out. */
  const source = normalize(original);
  const dense = densify(source);

  const headings: number[] = [];
  let at = 0;
  for (const line of source.split('\n')) {
    if (HEADING_LINE.test(line.trim())) headings.push(at);
    at += line.length + 1;
  }

  /* Pass one: where each entry's body begins. In order, each search starting
     after the last, because a name is often mentioned before its entry —
     "makes two Claw attacks and one Bite attack" sits above the Bite. Anchoring
     the name to the opening words that follow it is what tells the real one
     from a mention. */
  const starts: (Start | null)[] = [];
  let cursor = 0;
  for (const e of x.entries) {
    const found = locate(dense, source, e, cursor);
    starts.push(found);
    if (found) cursor = found.body + 1;
  }

  /* Pass two: where each body ends — at the next entry, or the next heading
     line, whichever is first. */
  const bodies: (string | null)[] = x.entries.map((e, i) => {
    const start = starts[i];
    if (!start) return null;
    const next = starts.slice(i + 1).find((s) => s !== null)?.name ?? source.length;
    const heading = headings.find((h) => h > start.body) ?? source.length;
    /* "Bite MWA" with an opening of "+10, 5 ft." — the model has taken the
       attack's type for part of its name. It is the first word of the body,
       and the word that says the attack is a melee one, so the body starts
       there instead. */
    let from = start.body;
    const tail = BODY_WORD.exec(e.name)?.[1];
    if (tail) {
      const word = source.toLowerCase().lastIndexOf(tail.toLowerCase(), start.body);
      if (word >= start.name) from = word;
    }
    let body = source.slice(from, Math.min(next, heading))
      .replace(/^[\s.:–-]+/, '')
      .replace(/\n[ \t]*\n+/g, '\n')
      .trim();
    /* Where the next entry was found by its opening alone, its name is still
       sitting on the end of this body. */
    const following = x.entries[i + 1]?.name;
    if (following && body.toLowerCase().endsWith(following.toLowerCase())) {
      body = body.slice(0, -following.length).trim();
    }
    body = dropTrailingJunk(body).trim();
    return body || null;
  });

  const lines: string[] = [];
  const add = (label: string, v: string) => { if (value(v)) lines.push(`${label} ${value(v)}`); };

  if (x.name) lines.push(x.name);
  if (x.sizeTypeAlignment) lines.push(x.sizeTypeAlignment);
  add('Armor Class', x.armorClass);
  add('Hit Points', x.hitPoints);
  add('Speed', x.speed);
  add('Initiative', x.initiative);
  /* All six or none. A zero is a score the model did not find, and a line
     with a zero in it would be read as a creature with no Strength. */
  const scores = [x.str, x.dex, x.con, x.int, x.wis, x.cha];
  if (scores.every((v) => v >= 1 && v <= 30)) {
    lines.push(`STR ${x.str} DEX ${x.dex} CON ${x.con} INT ${x.int} WIS ${x.wis} CHA ${x.cha}`);
  }
  add('Saving Throws', x.savingThrows);
  add('Skills', x.skills);
  add('Damage Vulnerabilities', x.damageVulnerabilities);
  add('Damage Resistances', x.damageResistances);
  add('Damage Immunities', x.damageImmunities);
  add('Condition Immunities', x.conditionImmunities);
  add('Senses', x.senses);
  add('Languages', x.languages);
  add('Challenge', x.challenge);
  add('Proficiency Bonus', x.proficiencyBonus);

  let located = 0;
  for (const section of AI_SECTIONS) {
    const here = x.entries
      .map((e, i) => ({ e, body: bodies[i], bracket: starts[i]?.bracket ?? '' }))
      .filter(({ e, body }) => e.section === section && body);
    if (!here.length) continue;
    lines.push('', HEADING[section], '');
    if (section === 'legendary' && x.legendaryActionsPerRound > 0) {
      lines.push(`The creature can take ${x.legendaryActionsPerRound} legendary actions.`, '');
    }
    for (const { e, body, bracket } of here) {
      /* A stop or a colon inside the name would end it early. */
      const name = `${e.name.replace(BODY_WORD, '')} ${bracket}`
        .replace(/[.:]+/g, ' ').replace(/\s+/g, ' ').trim();
      lines.push(`${name.charAt(0).toUpperCase()}${name.slice(1)}. ${body}`, '');
      located += 1;
    }
  }

  return { text: lines.join('\n').trim(), expected: x.entries.length, located };
}

/* ---------------- Two readings into one ---------------- */

const total = (b: StatBlock): number =>
  b.entries.trait.length + b.entries.action.length + b.entries.legendary.length + b.entries.lair.length;

/** Each field the built-in reader reports missing, and how to copy it across. */
const FILL: Record<string, (to: StatBlock, from: StatBlock) => void> = {
  'Name': (to, from) => { to.name = from.name; },
  'Size, type and alignment': (to, from) => {
    to.size = from.size; to.type = from.type; to.alignment = from.alignment;
  },
  'Armor Class': (to, from) => { to.acValue = from.acValue; to.acNote = from.acNote; },
  'Hit Points': (to, from) => { to.hpValue = from.hpValue; to.showHitDice = from.showHitDice; },
  'Speed': (to, from) => { to.speeds = { ...from.speeds }; },
  'Ability scores': (to, from) => { to.abilities = { ...from.abilities }; },
  'Proficiency bonus and challenge rating': (to, from) => {
    to.proficiencyBonus = from.proficiencyBonus;
  },
};

/**
 * The AI's reading, with its gaps filled from the built-in one.
 *
 * Field by field rather than one or the other: the model is good at structure
 * and can still skip a line, and the rules are bad at structure and still
 * read most headers right. Taking whichever reading is "better" overall threw
 * away the half of each that was.
 */
export function combine(ai: ParseResult, raw: ParseResult, layout: Layout): ParseResult {
  const block: StatBlock = structuredClone(ai.block);
  const report = {
    took: [...ai.report.took],
    unsure: [...ai.report.unsure],
    missing: [] as string[],
  };

  for (const gap of ai.report.missing) {
    const copy = FILL[gap];
    if (copy && !raw.report.missing.includes(gap)) {
      copy(block, raw.block);
      report.took.push(`${gap}, by the built-in reader`);
    } else if (gap !== 'Traits and actions') {
      report.missing.push(gap);
    }
  }

  /* An empty list is how a block says "none", so it is only filled where the
     built-in reader found something the model passed over. */
  for (const key of ['vulnerabilities', 'resistances', 'damageImmunities',
    'conditionImmunities', 'languages', 'saves'] as const) {
    if (!block[key].length && raw.block[key].length) {
      (block as unknown as Record<string, unknown>)[key] = [...raw.block[key]];
    }
  }
  if (!Object.keys(block.skills).length && Object.keys(raw.block.skills).length) {
    block.skills = { ...raw.block.skills };
  }
  const sees = (b: StatBlock) =>
    b.senses.darkvision + b.senses.blindsight + b.senses.tremorsense + b.senses.truesight;
  if (!sees(block) && sees(raw.block)) block.senses = { ...raw.block.senses };

  /* The entries are the model's unless it lost some of them — quoted words it
     could not be held to — and the built-in reader found at least as many. */
  const lost = layout.located < layout.expected;
  if (total(block) === 0 || (lost && total(raw.block) >= layout.expected)) {
    block.entries = structuredClone(raw.block.entries);
    block.legendaryCount = raw.block.legendaryCount;
  } else if (lost) {
    report.unsure.push(`${layout.expected - layout.located} of ${layout.expected} entries could not be found in the text and were left out`);
  }
  if (total(block) === 0) report.missing.push('Traits and actions');

  return { block, report };
}

/* ---------------- Asking ---------------- */

export type Outcome =
  /** The AI reader's result, combined with the built-in one. */
  | { via: 'ai'; result: ParseResult }
  /** Today's free allowance is used up; the built-in reader stands. */
  | { via: 'spent' }
  /** No Worker configured. */
  | { via: 'off' }
  /** Anything else — the built-in reader stands, and the next block tries again. */
  | { via: 'failed' };

export interface AskOptions {
  url?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  now?: number;
  /** How long to wait before giving up on the model. */
  timeoutMs?: number;
}

/**
 * Read a pasted block with the AI reader.
 *
 * `raw` is the built-in reader's result for the same text, which the caller
 * already has: it is what any gap is filled from, and what stands whenever
 * this returns anything but `ai`. Never throws.
 */
export async function readWithAi(text: string, raw: ParseResult, options: AskOptions = {}): Promise<Outcome> {
  const url = options.url ?? readerUrl();
  if (!url) return { via: 'off' };
  const now = options.now ?? Date.now();
  if (spentToday(now)) return { via: 'spent' };

  /* A deadline of our own, joined to the caller's. A model that has not
     answered by then is not going to be worth the wait. */
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), options.timeoutMs ?? 40_000);
  const stop = () => deadline.abort();
  options.signal?.addEventListener('abort', stop);

  try {
    const response = await (options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalize(text) }),
      signal: deadline.signal,
    });
    if (response.status === 429) {
      markSpent(now);
      return { via: 'spent' };
    }
    if (!response.ok) return { via: 'failed' };

    const body = (await response.json()) as { extraction?: unknown };
    const extraction = reviveExtraction(body.extraction);
    if (!extraction) return { via: 'failed' };

    const layout = layOut(extraction, text);
    const ai = parseStatBlock(layout.text);
    return { via: 'ai', result: combine(ai, raw, layout) };
  } catch {
    return { via: 'failed' };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
  }
}
