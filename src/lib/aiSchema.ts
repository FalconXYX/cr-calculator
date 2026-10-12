/* What the AI reader is asked for, and the shape it answers in.

   Shared by the page and by the Cloudflare Worker that talks to the model, so
   the two cannot drift: the Worker builds its request from the prompt and
   schema here, and the page reads the answer with the types here.

   The model is asked to ANNOTATE the block, not to rewrite it. It copies the
   short header values — armour class, hit points, speed — and for each trait
   and action it names the entry and quotes the first few words of its body.
   The body itself is then cut out of the original text by the page, running
   from there to the next entry or heading.

   That split is the point. A stat block's attacks are what its offensive
   rating is made of, and a model asked to retype "15 (2d8 + 6) slashing" can
   hand back "15 (2d8 + 5)" without anyone noticing — the rating moves and
   nothing says why. Quoting the ends and cutting the middle out of the real
   text means the dice the calculator reads are the dice that were on the
   page. It also makes the answer a third the length, which is a third the
   wait and three times as many reads out of each day's free allowance.

   It used to quote each body's last words too, to mark where it ended. Llama
   was unreliable at that in the one way that matters: "cold damage." for a
   bite that says "cold damage" twice, or the second-last line of an aura —
   and a body cut short loses dice, which drags the rating down silently. A
   body that runs on a little too far costs nothing worse than a stray word. */

export type AiSection = 'trait' | 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair';

export const AI_SECTIONS: readonly AiSection[] =
  ['trait', 'action', 'bonus', 'reaction', 'legendary', 'lair'];

export interface AiEntry {
  section: AiSection;
  name: string;
  /** The first few words of the body, exactly as printed. */
  opening: string;
}

export interface AiExtraction {
  name: string;
  sizeTypeAlignment: string;
  armorClass: string;
  hitPoints: string;
  speed: string;
  initiative: string;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  savingThrows: string;
  skills: string;
  damageVulnerabilities: string;
  damageResistances: string;
  damageImmunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  challenge: string;
  proficiencyBonus: string;
  legendaryActionsPerRound: number;
  entries: AiEntry[];
}

const text = { type: 'string' } as const;
const score = { type: 'integer' } as const;

/**
 * The JSON schema the model's answer is held to.
 *
 * Flat, and strings almost throughout. Workers AI enforces it, but the docs
 * are frank that a model can fail to meet a complicated one — and every value
 * here is going straight into a text reader that already knows how to read
 * "18 (natural armor)", so asking the model to break it up further buys
 * nothing but another way to fail.
 */
export const AI_SCHEMA = {
  type: 'object',
  properties: {
    name: text,
    sizeTypeAlignment: text,
    armorClass: text,
    hitPoints: text,
    speed: text,
    initiative: text,
    str: score, dex: score, con: score, int: score, wis: score, cha: score,
    savingThrows: text,
    skills: text,
    damageVulnerabilities: text,
    damageResistances: text,
    damageImmunities: text,
    conditionImmunities: text,
    senses: text,
    languages: text,
    challenge: text,
    proficiencyBonus: text,
    legendaryActionsPerRound: score,
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: [...AI_SECTIONS] },
          name: text,
          opening: text,
        },
        required: ['section', 'name', 'opening'],
      },
    },
  },
  /* Every field, so the model answers "" for one that is absent rather than
     leaving it out — left optional, it skipped the size and type line of a
     block that plainly had one. */
  required: [
    'name', 'sizeTypeAlignment', 'armorClass', 'hitPoints', 'speed', 'initiative',
    'str', 'dex', 'con', 'int', 'wis', 'cha',
    'savingThrows', 'skills', 'damageVulnerabilities', 'damageResistances',
    'damageImmunities', 'conditionImmunities', 'senses', 'languages',
    'challenge', 'proficiencyBonus', 'legendaryActionsPerRound', 'entries',
  ],
} as const;

export const AI_PROMPT = `You read Dungeons & Dragons 5e monster stat blocks that were copied from web pages or read off screenshots by OCR. The text may be messy: odd line breaks, stray symbols like | or _ from borders, missing punctuation, entry names with no full stop after them, several fields on one line, or the challenge rating printed beside the name.

Return the stat block's structure as JSON. Rules:

1. Copy values exactly as printed. Do not correct, round, recalculate or invent anything. If a field is not in the text, use an empty string, or 0 for a number.
2. armorClass is the number and any bracketed note, e.g. "18 (natural armor)". hitPoints is the number and any dice, e.g. "225 (18d10+126)". speed lists every speed, e.g. "40 ft., climb 20 ft.".
3. str, dex, con, int, wis, cha are the six ability SCORES (usually 1 to 30), not the modifiers in brackets.
4. Split a combined "Immunities" line: damage types (fire, poison, cold...) go in damageImmunities, conditions (charmed, frightened, poisoned...) go in conditionImmunities.
5. challenge is the challenge rating only, e.g. "15" or "1/4". proficiencyBonus only if printed, e.g. "+5".
6. legendaryActionsPerRound: the number in "can take N legendary actions", or 0.
7. entries: every trait, action, bonus action, reaction, legendary action and lair action, in the order printed. For each:
   - section: "trait" for features listed before the actions; "action", "bonus", "reaction", "legendary" or "lair" for the rest. Attacks and Multiattack are actions even when no Actions heading is printed.
   - name: the entry's name exactly as printed, including any "(Recharge 5-6)" or "(3/Day)" in it, without the full stop or colon after it.
   - opening: the first 4 to 6 words of the entry's text after its name, copied exactly.
   Do not include section headings, the sentence introducing legendary actions, page decoration, or template placeholder text such as "Enter the description".`;

/** The model to ask, unless the Worker is configured with another. */
export const AI_DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** The longest block the Worker will pass on, in characters. */
export const AI_MAX_INPUT = 12_000;
