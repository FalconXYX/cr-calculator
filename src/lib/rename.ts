/* Renaming a monster, and everything it calls itself.

   A stat block's prose refers to the creature by a noun rather than by its
   full name: a winter wolf's Pack Tactics reads "The wolf has Advantage on an
   attack roll ... if at least one of the wolf's allies". Rename the block to
   Fire Wolf and nothing needs doing; rename it to Inferno Drake and every one
   of those has to be found by hand, across traits, actions and legendary
   actions alike. That is the tedious part of taking a published creature and
   making it yours, and it is entirely mechanical. */

import { CONDITIONS, ENTRY_SECTIONS } from './statblock.ts';
import type { Entry, EntrySection, StatBlock } from './statblock.ts';

/**
 * Words that follow "the" in stat block prose and never name the creature.
 *
 * Without these the commonest phrase in most blocks is "the target", and
 * every monster would think it was called a target.
 */
const GENERIC = new Set<string>([
  ...CONDITIONS.map((c) => c.toLowerCase()),
  'target', 'targets', 'creature', 'creatures', 'ally', 'allies',
  'enemy', 'enemies', 'ground', 'air', 'water', 'space', 'area', 'surface',
  'start', 'end', 'effect', 'spell', 'save', 'attack', 'attacks', 'damage',
  'condition', 'first', 'second', 'third', 'next', 'same', 'other', 'nearest',
  'triggering', 'following', 'dc', 'grapple', 'escape', 'magic', 'cloud',
]);

export interface SelfName {
  /** The noun the prose uses, in lower case. */
  noun: string;
  /** How many times it appears, which is what makes it the likeliest. */
  count: number;
}

const allText = (sb: StatBlock): string =>
  ENTRY_SECTIONS.flatMap((s) => sb.entries[s])
    .map((e) => `${e.name} ${e.text}`)
    .join('\n');

/**
 * What the prose calls this creature, where that can be told.
 *
 * The creature is whatever "the …" is most often, once the words that are
 * never a creature are out of the way. A block written generically — "the
 * creature teleports" — has nothing specific to find, and says so by
 * returning nothing rather than by guessing.
 */
export function findSelfName(sb: StatBlock): SelfName | null {
  const counts = new Map<string, number>();
  for (const m of allText(sb).matchAll(/\bthe\s+([A-Za-z][a-z-]*)/gi)) {
    const word = (m[1] ?? '').toLowerCase();
    if (word.length < 3 || GENERIC.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  let best: SelfName | null = null;
  for (const [noun, count] of counts) {
    if (!best || count > best.count) best = { noun, count };
  }
  return best;
}

/**
 * What a name would have its prose call it.
 *
 * The last word, which is the noun in almost every monster name — except
 * where the name is built round "of", as a Swarm of Bats is, and then it is
 * the first. A swarm calls itself the swarm, not the bats.
 */
export function selfNameFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.some((w) => w.toLowerCase() === 'of')) return words[0]!.toLowerCase();
  return words[words.length - 1]!.toLowerCase().replace(/[^a-z-]/g, '');
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Swap one noun for another everywhere it stands on its own.
 *
 * Case is carried over rather than imposed, so "The wolf" at the start of a
 * sentence becomes "The drake" and "the wolf's allies" becomes "the drake's".
 * Word boundaries do the rest: a possessive keeps its apostrophe, and a
 * longer word that merely contains the noun is left alone.
 */
export function renameThroughout(
  sb: StatBlock, from: string, to: string,
): { next: StatBlock; changed: number } {
  if (!from || !to || from === to) return { next: sb, changed: 0 };
  const pattern = new RegExp(`\\b${escape(from)}\\b`, 'gi');
  let changed = 0;

  const swap = (text: string): string => text.replace(pattern, (match) => {
    changed += 1;
    const capital = match[0] === match[0]?.toUpperCase();
    return capital ? to[0]!.toUpperCase() + to.slice(1) : to;
  });

  const entries = {} as Record<EntrySection, Entry[]>;
  for (const section of ENTRY_SECTIONS) {
    entries[section] = sb.entries[section].map((e) => ({
      ...e,
      name: swap(e.name),
      text: swap(e.text),
    }));
  }
  return { next: { ...sb, entries }, changed };
}
