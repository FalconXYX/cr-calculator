/* Published material, as something to build from.

   tools/build-bestiary.mjs writes two catalogues into src/data: one row per
   named trait, and the creatures as stat blocks ready to be edited. The
   traits are small enough to ship with the app. The creatures are not — five
   hundred stat blocks is most of a megabyte — so they arrive on demand, the
   first time someone opens the picker. */

import { reviveStatBlock } from './statblock.ts';
import type { SavedStatBlock, StatBlock } from './statblock.ts';

/** One named feature, in the wording most creatures share. */
export interface CatalogTrait {
  id: string;
  name: string;
  text: string;
  /**
   * A creature that has it.
   *
   * Names repeat with different numbers in them — Regeneration is 10 hit
   * points on a troll and 20 on a vampire — so the list needs something
   * besides the name to tell two entries apart.
   */
  example: string;
  /** How many published creatures have this trait. */
  count: number;
}

/** A published monster, ready to be loaded into the maker and changed. */
export interface MonsterTemplate {
  id: string;
  name: string;
  cr: string;
  /** The rating as a number, so a list can sort by it. */
  crValue: number;
  /** Page in the book it was printed in, for looking it up. */
  page: number;
  /** Also in the System Reference Document 5.2, which is openly licensed. */
  srd: boolean;
  /**
   * Stored with every default-valued field left out, which is a third off
   * the download. reviveStatBlock puts them all back.
   */
  block: SavedStatBlock;
}

export const templateBlock = (t: MonsterTemplate): StatBlock => reviveStatBlock(t.block);

/* ---------------- Searching ---------------- */

/**
 * How well one name answers a query, higher being better, 0 being no match.
 *
 * A name that starts with what was typed comes first, then a word inside it
 * that does, then anything that merely contains it: typing "gob" should
 * reach Goblin before Hobgoblin Captain, and reach it before anything whose
 * description happens to mention goblins.
 */
function score(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n === query) return 4;
  if (n.startsWith(query)) return 3;
  if (n.includes(` ${query}`) || n.includes(`(${query}`)) return 2;
  if (n.includes(query)) return 1;
  return 0;
}

function rank<T>(list: readonly T[], query: string, name: (t: T) => string, limit: number): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  const hits: { item: T; s: number }[] = [];
  for (const item of list) {
    const s = score(name(item), q);
    if (s) hits.push({ item, s });
  }
  /* Stable underneath the score, so an unsearched list and a searched one
     put the same names in the same order. */
  hits.sort((a, b) => b.s - a.s);
  return hits.slice(0, limit).map((h) => h.item);
}

export function searchTraits(
  list: readonly CatalogTrait[], query: string, limit = 80,
): CatalogTrait[] {
  return rank(list, query, (t) => t.name, limit);
}

export function searchTemplates(
  list: readonly MonsterTemplate[], query: string, limit = 80,
): MonsterTemplate[] {
  return rank(list, query, (t) => t.name, limit);
}

/**
 * The trait's name without the bracket that qualifies it.
 *
 * The book writes "Legendary Resistance (3/Day, or 4/Day in Lair)", and the
 * calculator calls the same feature "Legendary Resistance". Comparing them
 * needs the brackets gone or every one of them reads as a new trait.
 */
export const plainName = (name: string): string =>
  name.replace(/\s*\([^)]*\)\s*$/, '').trim();

/* ---------------- Loading ---------------- */

let pending: Promise<readonly MonsterTemplate[]> | null = null;

/** Fetches the creature catalogue, once, and hands out the same list after. */
export function loadTemplates(): Promise<readonly MonsterTemplate[]> {
  pending ??= import('../data/monsterTemplates.ts').then((m) => m.MONSTER_TEMPLATES);
  return pending;
}
