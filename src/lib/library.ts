/* Monsters you have kept.

   The editor holds one creature at a time and remembers it between visits,
   which is enough until you have made a second one. This is the shelf you put
   the first on while you work on the next.

   Stored whole rather than pruned against the defaults, the way the shipped
   catalogue is. The catalogue is a megabyte of creatures that has to travel
   down a wire; this is a handful that never leaves the browser, and a plain
   copy is one less thing that can go subtly wrong years from now when the
   defaults have moved underneath it.

   Whole also happens to be exactly what sync wants to send. */

import { reviveStatBlock } from './statblock.ts';
import type { StatBlock } from './statblock.ts';
import { tombstone, unstone } from './tombstones.ts';
import { readStored, writeStored } from '../hooks/usePersistentState.ts';

export const LIBRARY_KEY = 'cr-calc-monster-library';

export interface SavedMonster {
  /** What it was called when it was put away, which is also its key. */
  name: string;
  /** Milliseconds, so the shelf can be shown newest first. */
  savedAt: number;
  block: StatBlock;
}

/** The shelf keys on the name, case ignored, so two Winter Wolves cannot sit side by side. */
export const shelfKey = (name: string): string => name.trim().toLowerCase();

/** One row out of storage, or null if it is not one. */
export function reviveSaved(row: unknown): SavedMonster | null {
  if (!row || typeof row !== 'object') return null;
  const { name, savedAt, block } = row as Partial<SavedMonster>;
  if (typeof name !== 'string' || !name) return null;
  /* Revived rather than trusted: this came out of storage, where it may
     have been written by a version of the app that did not have half of
     these fields. */
  return {
    name,
    savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0,
    block: reviveStatBlock(block),
  };
}

export const newestFirst = (a: SavedMonster, b: SavedMonster): number => b.savedAt - a.savedAt;

/** Everything on the shelf, newest first. */
export function savedMonsters(): SavedMonster[] {
  const raw = readStored<unknown>(LIBRARY_KEY, []);
  if (!Array.isArray(raw)) return [];
  const out: SavedMonster[] = [];
  for (const row of raw) {
    const saved = reviveSaved(row);
    if (saved) out.push(saved);
  }
  return out.sort(newestFirst);
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
  const kept = savedMonsters().filter((m) => shelfKey(m.name) !== shelfKey(name));
  const next = [{ name, savedAt: Date.now(), block: { ...block, name } }, ...kept];
  writeStored(LIBRARY_KEY, next);
  /* It is back. Leaving its gravestone standing would be harmless — the new
     copy is newer than the deletion — but an unswept graveyard is one more
     thing to reason about later. */
  unstone('monsters', shelfKey(name));
  return next;
}

/** Take one off the shelf. */
export function forgetMonster(name: string): SavedMonster[] {
  const next = savedMonsters().filter((m) => shelfKey(m.name) !== shelfKey(name));
  writeStored(LIBRARY_KEY, next);
  tombstone('monsters', shelfKey(name));
  return next;
}

/** Overwrite the shelf wholesale, which is what arriving from sync looks like. */
export function replaceLibrary(list: SavedMonster[]): SavedMonster[] {
  const next = [...list].sort(newestFirst);
  writeStored(LIBRARY_KEY, next);
  return next;
}
