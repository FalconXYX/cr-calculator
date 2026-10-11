/* Folding two copies of the shelves into one. Run with `npm test`.

   This is the part of sync worth testing: the network is somebody else's
   code, but deciding which of two edits to keep is ours, and getting it wrong
   silently deletes somebody's work. There is no browser here, so localStorage
   is stood up as a plain object, the same as the library's own test. */

import { defaultStatBlock } from '../src/lib/statblock.ts';
import { DEFAULTS } from '../src/lib/calcState.ts';
import type { CalcState } from '../src/lib/types.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const {
  applySnapshot, digest, emptySnapshot, localSnapshot, merge,
  dropProfile, putProfile, readProfiles, reviveSnapshot,
} = await import('../src/lib/sync.ts');
const { forgetMonster, saveMonster, savedMonsters } = await import('../src/lib/library.ts');
const { noTombstones, tombstones } = await import('../src/lib/tombstones.ts');

type Snapshot = ReturnType<typeof emptySnapshot>;

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

const DAY = 24 * 60 * 60 * 1000;
const T = 1_700_000_000_000;

const state = (hp: number): CalcState => ({ ...DEFAULTS, hp });

const monster = (name: string, savedAt: number, hp = 10) => {
  const block = defaultStatBlock();
  block.name = name;
  block.hpValue = hp;
  return { name, savedAt, block };
};

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ ...emptySnapshot(), ...over });

/* ---------------- Profiles ---------------- */

console.log('--- nothing to fold ---');
is('two empties stay empty', Object.keys(merge(emptySnapshot(), emptySnapshot(), T).profiles).length, 0);

console.log('\n--- one side only ---');
{
  const mine = snap({ profiles: { Gorgon: { state: state(114), savedAt: T } } });
  is('mine survives an empty remote', merge(mine, emptySnapshot(), T).profiles.Gorgon?.state.hp, 114);
  is('and an empty local takes theirs', merge(emptySnapshot(), mine, T).profiles.Gorgon?.state.hp, 114);
}

console.log('\n--- the later edit wins ---');
{
  const mine = snap({ profiles: { Gorgon: { state: state(100), savedAt: T } } });
  const theirs = snap({ profiles: { Gorgon: { state: state(200), savedAt: T + 1000 } } });
  is('a newer remote replaces mine', merge(mine, theirs, T).profiles.Gorgon?.state.hp, 200);
  is('an older remote does not', merge(theirs, mine, T).profiles.Gorgon?.state.hp, 200);
}
{
  /* Anything saved before profiles carried a timestamp reads as time zero,
     which has to lose to a real edit rather than beat it. */
  const old = snap({ profiles: { Gorgon: { state: state(1), savedAt: 0 } } });
  const edited = snap({ profiles: { Gorgon: { state: state(2), savedAt: T } } });
  is('an untimed profile loses to a timed one', merge(old, edited, T).profiles.Gorgon?.state.hp, 2);
  is('whichever way round it is asked', merge(edited, old, T).profiles.Gorgon?.state.hp, 2);
}
{
  const mine = snap({ profiles: { Gorgon: { state: state(7), savedAt: T } } });
  const theirs = snap({ profiles: { Gorgon: { state: state(9), savedAt: T } } });
  is('a dead heat goes to the device being used', merge(mine, theirs, T).profiles.Gorgon?.state.hp, 7);
}

console.log('\n--- a deletion is not an absence ---');
{
  const theirs = snap({ profiles: { Gorgon: { state: state(114), savedAt: T } } });
  const deleted = snap({ forgotten: { ...noTombstones(), profiles: { Gorgon: T + 500 } } });
  is('deleting here removes it from there',
    Object.keys(merge(deleted, theirs, T + 1000).profiles).length, 0);
  is('and the gravestone is carried forward',
    merge(deleted, theirs, T + 1000).forgotten.profiles.Gorgon, T + 500);
}
{
  /* The order of the two events is the whole question. Deleted, then saved
     again somewhere else, means it is back. */
  const deleted = snap({ forgotten: { ...noTombstones(), profiles: { Gorgon: T } } });
  const resaved = snap({ profiles: { Gorgon: { state: state(55), savedAt: T + 5000 } } });
  is('a save after the deletion stands', merge(deleted, resaved, T + 9000).profiles.Gorgon?.state.hp, 55);
}
{
  const ancient = snap({ forgotten: { ...noTombstones(), profiles: { Gorgon: T } } });
  const theirs = snap({ profiles: { Gorgon: { state: state(3), savedAt: T - DAY } } });
  const out = merge(ancient, theirs, T + 200 * DAY);
  is('a swept gravestone stops holding anything down', out.profiles.Gorgon?.state.hp, 3);
  is('and is gone from the record', Object.keys(out.forgotten.profiles).length, 0);
}

/* ---------------- Monsters ---------------- */

console.log('\n--- the monster shelf folds the same way ---');
{
  const mine = snap({ monsters: [monster('Winter Wolf', T, 75)] });
  const theirs = snap({ monsters: [monster('Fire Wolf', T + 1, 80)] });
  const out = merge(mine, theirs, T);
  is('both shelves end up on one', out.monsters.length, 2);
  is('newest first', out.monsters[0]?.name, 'Fire Wolf');
}
{
  const mine = snap({ monsters: [monster('Winter Wolf', T, 75)] });
  const theirs = snap({ monsters: [monster('winter wolf', T + 10, 99)] });
  const out = merge(mine, theirs, T);
  is('case does not make a second shelf space', out.monsters.length, 1);
  is('and the later one is the one kept', out.monsters[0]?.block.hpValue, 99);
}
{
  const theirs = snap({ monsters: [monster('Winter Wolf', T, 75)] });
  const deleted = snap({ forgotten: { ...noTombstones(), monsters: { 'winter wolf': T + 1 } } });
  is('forgetting it here forgets it there', merge(deleted, theirs, T + 2).monsters.length, 0);
}

/* ---------------- The digest ---------------- */

console.log('\n--- telling whether anything moved ---');
{
  const a = snap({ profiles: { A: { state: { ...DEFAULTS, traits: { fly: true, pack: true } }, savedAt: T } } });
  const b = snap({ profiles: { A: { state: { ...DEFAULTS, traits: { pack: true, fly: true } }, savedAt: T } } });
  is('key order is not a change', digest(a) === digest(b), true);
  is('but a value is', digest(a) === digest(snap({ profiles: { A: { state: state(1), savedAt: T } } })), false);
}
{
  const mine = snap({
    profiles: { Gorgon: { state: state(114), savedAt: T } },
    monsters: [monster('Winter Wolf', T, 75)],
    forgotten: { ...noTombstones(), monsters: { 'fire wolf': T } },
  });
  is('a snapshot survives the trip through JSON',
    digest(reviveSnapshot(JSON.parse(JSON.stringify(mine)))) === digest(mine), true);
  is('and junk off the wire reads as empty',
    digest(reviveSnapshot({ profiles: 'no', monsters: 7, forgotten: null })) === digest(emptySnapshot()), true);
}

/* ---------------- Against the real shelves ---------------- */

console.log('\n--- the shelves themselves ---');
store.clear();
is('a fresh browser has nothing to send', digest(localSnapshot()) === digest(emptySnapshot()), true);

putProfile('Gorgon', state(114));
is('a saved profile is on the snapshot', localSnapshot().profiles.Gorgon?.state.hp, 114);
is('stamped with a real time', (localSnapshot().profiles.Gorgon?.savedAt ?? 0) > 0, true);
saveMonster(monster('Winter Wolf', 0, 75).block);
is('and so is a saved monster', localSnapshot().monsters.length, 1);

dropProfile('Gorgon');
is('deleting takes it off the shelf', Object.keys(readProfiles()).length, 0);
is('and leaves a gravestone', (tombstones().profiles.Gorgon ?? 0) > 0, true);
forgetMonster('Winter Wolf');
is('the same for a monster', (tombstones().monsters['winter wolf'] ?? 0) > 0, true);

console.log('\n--- what arrives is what is then held ---');
{
  store.clear();
  /* Through revive, because that is the only way one ever arrives: `pull`
     reads the file with it, and a hand-built object would be testing a shape
     the app cannot produce. Note the monsters going in out of order. */
  const arriving = reviveSnapshot(snap({
    profiles: { Gorgon: { state: state(114), savedAt: T }, Skymage: { state: state(60), savedAt: T + 1 } },
    monsters: [monster('Winter Wolf', T, 75), monster('Empty Swarm', T + 1, 22)],
    forgotten: { ...noTombstones(), monsters: { 'fire wolf': Date.now() } },
  }));
  is('a snapshot off the wire is put in shelf order', arriving.monsters[0]?.name, 'Empty Swarm');
  applySnapshot(arriving);
  is('both profiles land', Object.keys(readProfiles()).length, 2);
  is('with their values', readProfiles().Skymage?.hp, 60);
  is('both monsters land', savedMonsters().length, 2);
  is('with their blocks', savedMonsters().find((m) => m.name === 'Empty Swarm')?.block.hpValue, 22);
  is('the gravestones land', (tombstones().monsters['fire wolf'] ?? 0) > 0, true);
  /* The guard against sync chasing its own tail: what was just written has to
     read back identical, or every arrival looks like a local edit and is sent
     straight back up. */
  is('and reading it back gives the same snapshot', digest(localSnapshot()) === digest(arriving), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
