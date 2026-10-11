/* A record of what you have deleted.

   Only sync needs this. With two browsers holding the same shelf, "this one
   is missing from over there" is ambiguous: it either has not arrived yet or
   it has been thrown away. Merging without knowing which resurrects every
   deletion the moment the other device next connects.

   So a deletion writes down when it happened, and a merge drops any record
   older than its own gravestone. The gravestones are kept for half a year,
   which is far longer than it takes a second device to come back, and then
   swept up so the file does not grow without bound. */

import { readStored, writeStored } from '../hooks/usePersistentState.ts';

const KEY = 'cr-calc-forgotten';

/** How long a gravestone is honoured. */
const KEEP_MS = 180 * 24 * 60 * 60 * 1000;

export type Shelf = 'profiles' | 'monsters';

/** Key (whatever the shelf uses) to when it was deleted, in milliseconds. */
export type Stones = Record<string, number>;

export interface Tombstones {
  profiles: Stones;
  monsters: Stones;
}

const emptyStones = (): Stones => ({});

export const noTombstones = (): Tombstones =>
  ({ profiles: emptyStones(), monsters: emptyStones() });

/** Reads a map of name to timestamp, discarding anything that is not that. */
function stones(raw: unknown): Stones {
  const out: Stones = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at) && at > 0) out[name] = at;
  }
  return out;
}

export function reviveTombstones(raw: unknown): Tombstones {
  const t = (raw ?? {}) as Partial<Record<Shelf, unknown>>;
  return { profiles: stones(t.profiles), monsters: stones(t.monsters) };
}

export function tombstones(): Tombstones {
  return reviveTombstones(readStored<unknown>(KEY, null));
}

export function writeTombstones(next: Tombstones): void {
  writeStored(KEY, sweep(next));
}

/** Note that something has been deleted. */
export function tombstone(shelf: Shelf, key: string, at: number = Date.now()): void {
  const all = tombstones();
  const stone = all[shelf];
  /* Keep the later of the two. Deleting, restoring from a backup and deleting
     again should leave the second deletion standing, not the first. */
  stone[key] = Math.max(stone[key] ?? 0, at);
  writeTombstones(all);
}

/** Forget that something was deleted — it is back, and newer than its stone. */
export function unstone(shelf: Shelf, key: string): void {
  const all = tombstones();
  if (all[shelf][key] === undefined) return;
  delete all[shelf][key];
  writeTombstones(all);
}

export function deletedAt(all: Tombstones, shelf: Shelf, key: string): number {
  return all[shelf][key] ?? 0;
}

/** The later of each gravestone across two sets. */
export function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const out = noTombstones();
  for (const shelf of ['profiles', 'monsters'] as const) {
    for (const [key, at] of Object.entries(a[shelf])) out[shelf][key] = at;
    for (const [key, at] of Object.entries(b[shelf])) {
      out[shelf][key] = Math.max(out[shelf][key] ?? 0, at);
    }
  }
  return out;
}

/** Drops gravestones old enough that no device can still be carrying the body. */
export function sweep(all: Tombstones, now: number = Date.now()): Tombstones {
  const out = noTombstones();
  for (const shelf of ['profiles', 'monsters'] as const) {
    for (const [key, at] of Object.entries(all[shelf])) {
      if (now - at < KEEP_MS) out[shelf][key] = at;
    }
  }
  return out;
}
