/* The shelf of saved monsters. Run with `npm test`.

   There is no browser here, so localStorage is stood up as a plain object.
   That is the whole dependency: the library reads and writes through the same
   two guarded helpers the rest of the app uses. */

import { defaultStatBlock } from '../src/lib/statblock.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { forgetMonster, saveMonster, savedMonsters } = await import('../src/lib/library.ts');

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

const named = (name: string, hp = 10) => {
  const b = defaultStatBlock();
  b.name = name;
  b.hpValue = hp;
  return b;
};

console.log('--- keeping a monster ---');
is('the shelf starts empty', savedMonsters().length, 0);
saveMonster(named('Winter Wolf', 75));
is('one goes on', savedMonsters().length, 1);
is('under its own name', savedMonsters()[0]?.name, 'Winter Wolf');
is('and comes back whole', savedMonsters()[0]?.block.hpValue, 75);

saveMonster(named('Fire Wolf', 80));
is('a second sits beside it', savedMonsters().length, 2);
is('newest first', savedMonsters()[0]?.name, 'Fire Wolf');

console.log('\n--- a name is a name ---');
saveMonster(named('Winter Wolf', 99));
is('saving over one replaces it rather than doubling it', savedMonsters().length, 2);
is('with the newer block', savedMonsters().find((m) => m.name === 'Winter Wolf')?.block.hpValue, 99);
saveMonster(named('winter WOLF', 120));
is('and case does not make a second shelf space', savedMonsters().length, 2);
is('- the name saved is the one typed',
  savedMonsters().some((m) => m.name === 'winter WOLF'), true);

console.log('\n--- an unnamed creature still has to go somewhere ---');
saveMonster(named(''));
is('a blank name becomes Monster', savedMonsters().some((m) => m.name === 'Monster'), true);
saveMonster(named('   '));
is('and so does a name of spaces', savedMonsters().filter((m) => m.name === 'Monster').length, 1);

console.log('\n--- forgetting ---');
forgetMonster('Fire Wolf');
is('one comes off', savedMonsters().some((m) => m.name === 'Fire Wolf'), false);
is('leaving the rest', savedMonsters().length, 2);
forgetMonster('Nothing By That Name');
is('forgetting what was never there changes nothing', savedMonsters().length, 2);

console.log('\n--- what storage hands back cannot be trusted ---');
store.set('cr-calc-monster-library', '{"not":"an array"}');
is('an object where a list belongs reads as empty', savedMonsters().length, 0);
store.set('cr-calc-monster-library', 'not json at all');
is('and so does nonsense', savedMonsters().length, 0);
store.set('cr-calc-monster-library', JSON.stringify([
  { name: 'Half A Monster' }, { savedAt: 1, block: {} }, null, 'x',
]));
const salvaged = savedMonsters();
is('a row with a name is salvaged, the rest dropped', salvaged.length, 1);
is('and the missing block is filled in from the defaults',
  salvaged[0]?.block.acValue, defaultStatBlock().acValue);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
