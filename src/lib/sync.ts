/* What gets synced, and how two copies of it are reconciled.

   Nothing here knows about Google, or about the network at all. It reads and
   writes the same two shelves the app already had — saved calculations and
   saved monsters — and it can fold a second copy of them into the first.
   That keeps the hard part, which is the folding, testable in Node.

   The rule is last write wins, per record rather than per shelf. A snapshot
   is not a backup to be restored over the top of whatever is here: both sides
   have usually been edited since they last spoke, and taking either one whole
   throws away the other's afternoon. So every profile and every monster
   carries the moment it was saved, every deletion leaves a gravestone, and
   merging walks the union of the two and keeps the later of each.

   Profiles did not used to carry a timestamp. Rather than widen CalcState —
   which the engine reads, and which has no business growing a field about
   storage — the times live in a map beside them. Anything saved before this
   existed reads as time zero, which loses to any real edit on another device
   and beats nothing at all. That is the right way round. */

import type { CalcState } from './types.ts';
import { reviveState } from './calcState.ts';
import { LIBRARY_KEY, newestFirst, replaceLibrary, reviveSaved, savedMonsters, shelfKey } from './library.ts';
import type { SavedMonster } from './library.ts';
import {
  deletedAt, mergeTombstones, noTombstones, reviveTombstones,
  sweep, tombstone, tombstones, unstone, writeTombstones,
} from './tombstones.ts';
import type { Tombstones } from './tombstones.ts';
import { readStored, writeStored } from '../hooks/usePersistentState.ts';

export const PROFILE_KEY = 'cr-calc-profiles';
const TIME_KEY = 'cr-calc-profile-times';
const TOMB_KEY = 'cr-calc-forgotten';

/** The keys a local write has to be on for sync to care about it. */
export const SYNCED_KEYS: readonly string[] = [PROFILE_KEY, TIME_KEY, TOMB_KEY, LIBRARY_KEY];

export interface StampedProfile {
  state: CalcState;
  savedAt: number;
}

export interface Snapshot {
  version: 1;
  profiles: Record<string, StampedProfile>;
  monsters: SavedMonster[];
  forgotten: Tombstones;
}

export const emptySnapshot = (): Snapshot =>
  ({ version: 1, profiles: {}, monsters: [], forgotten: noTombstones() });

/* ---------------- The local shelves ---------------- */

export function readProfiles(): Record<string, CalcState> {
  const raw = readStored<unknown>(PROFILE_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, CalcState> = {};
  for (const [name, state] of Object.entries(raw as Record<string, unknown>)) {
    if (name) out[name] = reviveState(state);
  }
  return out;
}

function readTimes(): Record<string, number> {
  const raw = readStored<unknown>(TIME_KEY, {});
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at)) out[name] = at;
  }
  return out;
}

/** Save one calculation under a name, replacing anything already there. */
export function putProfile(name: string, state: CalcState): Record<string, CalcState> {
  const next = { ...readProfiles(), [name]: state };
  const times = { ...readTimes(), [name]: Date.now() };
  /* Times first. A profile with no time reads as ancient, so if only one of
     these two writes lands it had better be the one that cannot lose. */
  writeStored(TIME_KEY, times);
  writeStored(PROFILE_KEY, next);
  unstone('profiles', name);
  return next;
}

export function dropProfile(name: string): Record<string, CalcState> {
  const next = readProfiles();
  delete next[name];
  const times = readTimes();
  delete times[name];
  writeStored(TIME_KEY, times);
  writeStored(PROFILE_KEY, next);
  tombstone('profiles', name);
  return next;
}

export function localSnapshot(): Snapshot {
  const states = readProfiles();
  const times = readTimes();
  const profiles: Record<string, StampedProfile> = {};
  for (const [name, state] of Object.entries(states)) {
    profiles[name] = { state, savedAt: times[name] ?? 0 };
  }
  return { version: 1, profiles, monsters: savedMonsters(), forgotten: tombstones() };
}

/** Lay a merged snapshot down over the shelves. */
export function applySnapshot(snap: Snapshot): void {
  const states: Record<string, CalcState> = {};
  const times: Record<string, number> = {};
  for (const [name, p] of Object.entries(snap.profiles)) {
    states[name] = p.state;
    times[name] = p.savedAt;
  }
  writeTombstones(snap.forgotten);
  writeStored(TIME_KEY, times);
  writeStored(PROFILE_KEY, states);
  replaceLibrary(snap.monsters);
}

/* ---------------- Reading one off the wire ---------------- */

/** Anything at all, turned into a snapshot. It came from a file in a cloud. */
export function reviveSnapshot(raw: unknown): Snapshot {
  const snap = (raw ?? {}) as Partial<Snapshot>;
  const profiles: Record<string, StampedProfile> = {};
  const given = (snap.profiles ?? {}) as Record<string, unknown>;
  if (given && typeof given === 'object') {
    for (const [name, row] of Object.entries(given)) {
      if (!name || !row || typeof row !== 'object') continue;
      const { state, savedAt } = row as Partial<StampedProfile>;
      profiles[name] = {
        state: reviveState(state),
        savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0,
      };
    }
  }
  const monsters: SavedMonster[] = [];
  if (Array.isArray(snap.monsters)) {
    for (const row of snap.monsters) {
      const saved = reviveSaved(row);
      if (saved) monsters.push(saved);
    }
  }
  return {
    version: 1,
    profiles,
    monsters: monsters.sort(newestFirst),
    forgotten: reviveTombstones(snap.forgotten),
  };
}

/* ---------------- The merge ---------------- */

/** The later of two records, preferring `mine` when they are the same age. */
const later = <T extends { savedAt: number }>(mine: T | undefined, theirs: T | undefined): T | undefined => {
  if (!mine) return theirs;
  if (!theirs) return mine;
  return theirs.savedAt > mine.savedAt ? theirs : mine;
};

/**
 * Fold two snapshots into one. Ties go to `mine`.
 *
 * Not symmetric only in that one respect, and deliberately: the device doing
 * the merging is the one somebody is sitting in front of.
 */
export function merge(mine: Snapshot, theirs: Snapshot, now: number = Date.now()): Snapshot {
  const forgotten = sweep(mergeTombstones(mine.forgotten, theirs.forgotten), now);

  const profiles: Record<string, StampedProfile> = {};
  for (const name of new Set([...Object.keys(mine.profiles), ...Object.keys(theirs.profiles)])) {
    const kept = later(mine.profiles[name], theirs.profiles[name]);
    /* A gravestone laid after the record was saved means the record is gone;
       one laid before it means the record is a later rewrite and stands. */
    if (!kept || deletedAt(forgotten, 'profiles', name) > kept.savedAt) continue;
    profiles[name] = kept;
  }

  const byKey = new Map<string, SavedMonster>();
  for (const m of mine.monsters) byKey.set(shelfKey(m.name), m);
  for (const m of theirs.monsters) {
    const key = shelfKey(m.name);
    const kept = later(byKey.get(key), m);
    if (kept) byKey.set(key, kept);
  }
  const monsters: SavedMonster[] = [];
  for (const [key, m] of byKey) {
    if (deletedAt(forgotten, 'monsters', key) > m.savedAt) continue;
    monsters.push(m);
  }

  return { version: 1, profiles, monsters: monsters.sort(newestFirst), forgotten };
}

/* ---------------- Telling whether anything moved ---------------- */

/** Key order is insertion order, which differs between two browsers holding
    identical data. Sorted, so the digest below means what it says. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canon((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * A stable string for a snapshot's contents.
 *
 * Used to answer "is there anything to send?", which stops the obvious loop:
 * arriving data is written to the shelves, writing the shelves looks exactly
 * like an edit, and an edit schedules a send.
 */
export const digest = (snap: Snapshot): string => JSON.stringify(canon(snap));
