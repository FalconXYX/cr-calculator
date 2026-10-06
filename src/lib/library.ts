/* Monsters you have kept.

   The editor holds one creature at a time and remembers it between visits,
   which is enough until you have made a second one. This is the shelf you put
   the first on while you work on the next.

   Stored whole rather than pruned against the defaults, the way the shipped
   catalogue is. The catalogue is a megabyte of creatures that has to travel
   down a wire; this is a handful that never leaves the browser, and a plain
   copy is one less thing that can go subtly wrong years from now when the
   defaults have moved underneath it. */

import { reviveStatBlock } from './statblock.ts';
import type { StatBlock } from './statblock.ts';
import { readStored, writeStored } from '../hooks/usePersistentState.ts';

const KEY = 'cr-calc-monster-library';

export interface SavedMonster {
  /** What it was called when it was put away, which is also its key. */
  name: string;
  /** Milliseconds, so the shelf can be shown newest first. */
  savedAt: number;
  block: StatBlock;
}

/** Everything on the shelf, newest first. */
export function savedMonsters(): SavedMonster[] {
  const raw = readStored<unknown>(KEY, []);
  if (!Array.isArray(raw)) return [];
  const out: SavedMonster[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const { name, savedAt, block } = row as Partial<SavedMonster>;
    if (typeof name !== 'string' || !name) continue;
    /* Revived rather than trusted: this came out of storage, where it may
       have been written by a version of the app that did not have half of
       these fields. */
    out.push({ name, savedAt: typeof savedAt === 'number' ? savedAt : 0, block: reviveStatBlock(block) });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Put one away, replacing anything of the same name.
 *
 * The name is the key, because that is how somebody looking at the shelf will
 * tell two creatures apart. Saving a second Winter Wolf is almost always
 * meant to replace the first rather than to sit beside it, and a shelf with
 * two identically named things on it is worse than either outcome.
 */
export function saveMonster(block: StatBlock): SavedMonster[] {
  const name = block.name.trim() || 'Monster';
  const kept = savedMonsters().filter((m) => m.name.toLowerCase() !== name.toLowerCase());
  const next = [{ name, savedAt: Date.now(), block: { ...block, name } }, ...kept];
  writeStored(KEY, next);
  return next;
}

/** Take one off the shelf. */
export function forgetMonster(name: string): SavedMonster[] {
  const next = savedMonsters().filter((m) => m.name.toLowerCase() !== name.toLowerCase());
  writeStored(KEY, next);
  return next;
}
