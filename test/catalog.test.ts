/* Monster Manual catalogue regression tests. Run with `npm test`.

   The catalogue is generated rather than written, so what these check is that
   the generator's assumptions still hold: that the markup is gone, that every
   value landed in a vocabulary the app knows, and that a creature revived out
   of the data prints the numbers the book prints. */

import * as S from '../src/lib/statblock.ts';
import { MONSTER_BOOKS, fromMonsterBook, plainName, searchTemplates, searchTraits, templateBlock } from '../src/lib/catalog.ts';
import type { MonsterTemplate } from '../src/lib/catalog.ts';
import { MONSTER_TRAITS } from '../src/data/monsterTraits.ts';
import { MONSTER_TEMPLATES, PRUNED_AGAINST } from '../src/data/monsterTemplates.ts';
import { SEALED_TEMPLATES } from '../src/data/monsterTemplatesSealed.ts';
import { OPEN_COUNT, SEALED_COUNT } from '../src/data/bestiaryCounts.ts';
import { open as openVault } from '../src/lib/vault.ts';
import { vibeCheck } from '../src/lib/vibeCheck.ts';
import { parseDamage } from '../src/lib/damageText.ts';
import { compute } from '../src/lib/engine.ts';
import type { TierId } from '../src/lib/types.ts';
import { toRoll20 } from '../src/lib/roll20.ts';
import { CR_TABLE } from '../src/lib/crTable.ts';
import type { CalcState } from '../src/lib/types.ts';

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

/* The creatures outside the reference document ship encrypted, so the whole
   book is only under test when the password is in the environment. Without it
   everything below still runs, over the open two thirds, and says so. */
const password = process.env['BESTIARY_PASSWORD'];
const unsealed = password ? await openVault(password, SEALED_TEMPLATES) : null;
if (password && !unsealed) throw new Error('BESTIARY_PASSWORD did not open the vault');
const ALL: readonly MonsterTemplate[] = unsealed
  ? [...MONSTER_TEMPLATES, ...unsealed].sort((a, b) => a.name.localeCompare(b.name))
  : MONSTER_TEMPLATES;
console.log(unsealed
  ? `(the vault is open, so all ${ALL.length} creatures are under test)`
  : `(no BESTIARY_PASSWORD, so only the ${ALL.length} open creatures are under test)`);

const byName = (name: string): MonsterTemplate => {
  const t = ALL.find((x) => x.name === name);
  if (!t) throw new Error(`no template called ${name}`);
  return t;
};

const have = (name: string): boolean => ALL.some((x) => x.name === name);

/** Runs a check only when the creature it needs is one of the open ones. */
function ifPresent(name: string, check: () => void): void {
  if (have(name)) check();
  else console.log(`skip  ${name} is sealed, so its checks need BESTIARY_PASSWORD`);
}

console.log('--- the catalogue is there ---');
is('the reference document creatures ship in the open', MONSTER_TEMPLATES.length, OPEN_COUNT);
is('and every one of them really is in it',
  MONSTER_TEMPLATES.every((t) => t.srd), true);
is('the rest are sealed', SEALED_TEMPLATES.count, SEALED_COUNT);
is('which together is everything in print that was not reprinted',
  OPEN_COUNT + SEALED_COUNT, 3772);
is('and a good hundred and more distinct traits', MONSTER_TRAITS.length > 120, true);
is('template ids are unique', new Set(ALL.map((t) => t.id)).size, ALL.length);
is('trait ids are unique',
  new Set(MONSTER_TRAITS.map((t) => t.id)).size, MONSTER_TRAITS.length);

console.log('\n--- the vault ---');
is('the sealed half is ciphertext, not a list',
  /^[A-Za-z0-9+/=]+$/.test(SEALED_TEMPLATES.data), true);
is('and nothing in it reads as a stat block',
  SEALED_TEMPLATES.data.includes('Melee Attack Roll'), false);
is('the password is stretched before it becomes a key',
  SEALED_TEMPLATES.iterations >= 100000, true);
is('a wrong password opens nothing',
  await openVault('not the password', SEALED_TEMPLATES), null);
is('and so does an empty one', await openVault('', SEALED_TEMPLATES), null);
if (unsealed) {
  is('the right one opens all of them', unsealed.length, SEALED_COUNT);
  is('and none of them claims to be in the reference document',
    unsealed.some((t) => t.srd), false);
}

console.log('\n--- the upstream markup is gone ---');
/* 5etools writes `{@hit 5}` and `{@damage 2d6}` in its prose. A single one
   left behind is both unreadable in the block and invisible to the vibe
   check, which is looking for the words those tags stand for. */
const tagged: string[] = [];
for (const t of ALL) {
  const block = templateBlock(t);
  for (const section of S.ENTRY_SECTIONS) {
    for (const e of block.entries[section]) {
      if (e.name.includes('{@') || e.text.includes('{@')) tagged.push(`${t.name}: ${e.name}`);
    }
  }
}
is('no creature keeps a 5etools tag', tagged.slice(0, 3).join(' | '), '');
is('nor does any trait in the catalogue',
  MONSTER_TRAITS.filter((t) => t.text.includes('{@') || t.name.includes('{@')).length, 0);
is('and no empty trait text got through',
  MONSTER_TRAITS.filter((t) => !t.name.trim() || !t.text.trim()).length, 0);

console.log('\n--- everything landed in a vocabulary the app knows ---');
const strays = { size: 0, type: 0, alignment: 0, skill: 0, save: 0, entryId: 0 };
const ABILITY_SET = new Set<string>(S.ABILITIES);
const SKILL_SET = new Set(S.SKILLS.map((s) => s.id));
for (const t of ALL) {
  const b = templateBlock(t);
  if (!S.SIZES.includes(b.size)) strays.size++;
  if (!S.CREATURE_TYPES.includes(b.type)) strays.type++;
  if (!S.ALIGNMENTS.includes(b.alignment)) strays.alignment++;
  if (b.saves.some((a) => !ABILITY_SET.has(a))) strays.save++;
  if (Object.keys(b.skills).some((id) => !SKILL_SET.has(id))) strays.skill++;
  for (const section of S.ENTRY_SECTIONS) {
    const ids = b.entries[section].map((e) => e.id);
    if (new Set(ids).size !== ids.length) strays.entryId++;
  }
}
is('every size is one of the six', strays.size, 0);
is('every type is one of the fourteen', strays.type, 0);
is('every alignment is one of the ten', strays.alignment, 0);
is('every saving throw names a real ability', strays.save, 0);
is('every skill names a real skill', strays.skill, 0);
is('entry ids are unique within their list', strays.entryId, 0);

console.log('\n--- pruning against the defaults ---');
/* The generator leaves out anything a fresh block already says, so the two
   ideas of "fresh" have to agree. */
is('the data was pruned against today’s defaults',
  JSON.stringify(PRUNED_AGAINST), JSON.stringify(S.defaultStatBlock()));
is('an empty saved block revives to the default',
  JSON.stringify(S.reviveStatBlock({})), JSON.stringify(S.defaultStatBlock()));

console.log('\n--- one creature, read off the page ---');
const dragon = byName('Adult Red Dragon');
const red = templateBlock(dragon);
const rd = S.derive(red, CR_TABLE[0]!);
is('rated CR 17 in the book', dragon.cr, '17');
is('and printed on page 255', dragon.page, 255);
is('Huge', red.size, 'Huge');
is('Dragon', red.type, 'Dragon');
is('Chaotic Evil', red.alignment, 'Chaotic Evil');
is('AC 19', red.acValue, 19);
is('256 hit points', red.hpValue, 256);
is('Strength 27', red.abilities.str, 27);
is('fly 80', red.speeds.fly, 80);
is('proficiency +6 from CR 17', red.proficiencyBonus, 6);
is('Dexterity save +6', rd.saveBonus.dex, 6);
is('Wisdom save +7', rd.saveBonus.wis, 7);
is('Perception is expertise', red.skills['perception'], 'expertise');
is('so Perception reads +13', rd.skillBonus['perception'], 13);
is('Stealth is plain proficiency', red.skills['stealth'], 'proficient');
is('so Stealth reads +6', rd.skillBonus['stealth'], 6);
is('passive Perception 23', rd.passivePerception, 23);
is('initiative is doubled proficiency', red.initiative, 'expertise');
is('immune to fire', red.damageImmunities.join(','), 'Fire');
is('blindsight 60', red.senses.blindsight, 60);
is('darkvision 120', red.senses.darkvision, 120);
is('speaks Common and Draconic', red.languages.join(', '), 'Common, Draconic');
is('one trait', red.entries.trait.length, 1);
is('which is Legendary Resistance',
  red.entries.trait[0]!.name.startsWith('Legendary Resistance'), true);
is('three legendary actions', red.entries.legendary.length, 3);
is('Fire Breath recharges on 5 or 6',
  red.entries.action.some((e) => e.name === 'Fire Breath (Recharge 5–6)'), true);
is('Rend hits at +14',
  red.entries.action.find((e) => e.name === 'Rend')?.text.startsWith('Melee Attack Roll: +14'), true);
is('its spellcasting is filed as an action',
  red.entries.action.some((e) => e.name === 'Spellcasting' && e.text.includes('At Will:')), true);

console.log('\n--- a creature with the other kinds of entry ---');
const captain = templateBlock(byName('Bandit Captain'));
is('Parry is a reaction',
  captain.entries.action.find((e) => e.name === 'Parry')?.kind, 'reaction');
is('and reads as a trigger and a response',
  captain.entries.action.find((e) => e.name === 'Parry')?.text.startsWith('Trigger:'), true);
const goblin = templateBlock(byName('Goblin Warrior'));
is('Nimble Escape is a bonus action',
  goblin.entries.action.find((e) => e.name.startsWith('Nimble Escape'))?.kind, 'bonus');
is('a plain action carries no kind at all',
  goblin.entries.action.find((e) => e.name === 'Multiattack')?.kind ?? 'action', 'action');

console.log('\n--- the vibe check can read what the book wrote ---');
const blank: CalcState = {
  tierId: '11-16', ac: 10, hp: 10, attackBonus: 0, saveDC: 10, extraDamage: 0,
  roundCount: 3, primary: [0, 0, 0], secondary: [0, 0, 0], traits: {}, traitValues: {},
};
const vd = vibeCheck(red, blank);
is('it finds the dragon’s attack bonus', vd.next.attackBonus, 14);
is('and its breath weapon’s save DC', vd.next.saveDC, 21);
is('and its armour class', vd.next.ac, 19);
is('and its hit points', vd.next.hp, 256);

let read = 0;
let threw = 0;
for (const t of ALL) {
  try {
    const r = vibeCheck(templateBlock(t), blank);
    if (r.next.attackBonus > 0 || r.next.saveDC > 10) read++;
  } catch { threw++; }
}
is('no creature in the book breaks it', threw, 0);
is('and it gets an attack or a DC off nearly all of them', read / ALL.length > 0.95, true);
is('- which is how many exactly', read, read);

console.log('\n--- damage the book states as a choice ---');
/* The creatures this was written for. Each of them used to have every
   outcome of a single action added together. */
const entryOf = (monster: string, entry: string): string => {
  const block = templateBlock(byName(monster));
  for (const section of S.ENTRY_SECTIONS) {
    const found = block.entries[section].find((e) => e.name.startsWith(entry));
    if (found) return found.text;
  }
  throw new Error(`${monster} has no ${entry}`);
};

ifPresent('Elemental Cataclysm', () => is('the Cataclysmic Event averages its four random effects',
  parseDamage(entryOf('Elemental Cataclysm', 'Cataclysmic Event')), 40));
ifPresent('Beholder', () => is('the beholder averages ten eye rays, duds included',
  parseDamage(entryOf('Beholder', 'Eye Rays')), 15));
is('a chimera bites for the better of its two lines',
  parseDamage(entryOf('Chimera', 'Bite')), 18);
is('but a solar still adds its radiant damage to its slashing',
  parseDamage(entryOf('Solar', 'Flying Sword')), 58);
ifPresent('Swarm of Stirges', () => is('and a stirge swarm keeps the damage its grapple deals',
  parseDamage(entryOf('Swarm of Stirges', 'Swarm of Proboscises')), 21));

const routineOf = (monster: string): number => {
  const { next } = vibeCheck(templateBlock(byName(monster)), blank);
  return next.primary[next.roundCount - 1] ?? 0;
};
is('a balor swings both of its weapons', routineOf('Balor'), 78);
is('a bandit uses one weapon, not both', routineOf('Bandit'), 5);

console.log('\n--- scoring the whole book ---');
/* Not a claim that the DMG procedure agrees with the designers — it does
   not, and 2024 dragons come out low however carefully they are read. It is
   a floor: a change that makes the reading worse will show up here. */
const tierFor = (v: number): TierId =>
  (v <= 4 ? '0-4' : v <= 10 ? '5-10' : v <= 16 ? '11-16' : '17+');
const rung = new Map(CR_TABLE.map((r) => [r.cr, r.i]));

/* Split by book, because the two are different questions. The 2025 Monster
   Manual is what the calculator is really aimed at and a drop there would be
   a regression; the 2014 books and the adventure NPCs are full of creatures
   whose whole threat is spellcasting, which the DMG procedure does not score
   and never claimed to. */
const tally = new Map<string, { n: number; within1: number }>();
let unrated = 0;
let scored = 0;
for (const t of ALL) {
  const book = rung.get(t.cr);
  if (book === undefined) { unrated++; continue; }
  const { next } = vibeCheck(templateBlock(t), { ...blank, tierId: tierFor(t.crValue) });
  const result = compute({
    tierId: next.tierId, ac: next.ac, hp: next.hp,
    attackBonus: next.attackBonus, saveDC: next.saveDC,
    damageMode: 'rounds', roundCount: next.roundCount,
    rounds: Array.from({ length: next.roundCount }, (_, i) =>
      (next.primary[i] ?? 0) + (next.secondary[i] ?? 0)),
    extraDamage: next.extraDamage, traits: next.traits, traitValues: next.traitValues,
  });
  scored++;
  const key = t.source === 'XMM' ? 'xmm' : 'rest';
  const row = tally.get(key) ?? { n: 0, within1: 0 };
  row.n++;
  if (Math.abs(result.final.index - book) <= 1) row.within1++;
  tally.set(key, row);
}
const share = (key: string): number => {
  const row = tally.get(key);
  return row && row.n ? Math.round((row.within1 / row.n) * 100) : 0;
};

is('every creature scores without throwing', scored + unrated, ALL.length);
is('and barely any lack a rating to compare against', unrated < 5, true);
is('the 2025 Monster Manual still lands within one rung four times in five',
  share('xmm') >= 80, true);
is('- which is what share exactly', share('xmm'), share('xmm'));
is('the older books and the adventure NPCs do worse, as they should',
  share('rest') > 45, true);
is('- and that share', share('rest'), share('rest'));

console.log('\n--- and Roll20 still takes them ---');
const r20 = toRoll20(red, rd);
is('the export names the dragon',
  r20.attribs.some((a) => a.name === 'npc_name' && a.current === 'Adult Red Dragon'), true);
is('and carries its legendary actions',
  r20.attribs.filter((a) => a.name.startsWith('repeating_npcaction-l')).length > 0, true);

console.log('\n--- searching ---');
const goblins = searchTemplates(ALL, 'goblin');
is('a search for goblin finds some', goblins.length > 2, true);
is('and leads with the plain one', goblins[0]!.name.startsWith('Goblin'), true);
is('an exact name wins outright', searchTemplates(ALL, 'Bandit')[0]!.name, 'Bandit');
is('a word inside a name still matches',
  searchTemplates(ALL, 'dragon').length > 10, true);
is('nonsense finds nothing', searchTemplates(ALL, 'zzzqqq').length, 0);
is('an empty query shows the head of the list',
  searchTemplates(ALL, '', 5).length, 5);
is('the limit is honoured', searchTemplates(ALL, 'a', 7).length, 7);
is('traits search the same way',
  searchTraits(MONSTER_TRAITS, 'pack tactics')[0]!.name, 'Pack Tactics');

console.log('\n--- monster books against adventures ---');
const books = ALL.filter(fromMonsterBook);
is('the reference document creatures are all from a monster book',
  MONSTER_TEMPLATES.every(fromMonsterBook), true);
is('nothing shown comes from a source that is not on the list',
  books.every((t) => MONSTER_BOOKS.has(t.source)), true);
if (unsealed) {
  /* The counts are the feature, not a detail of it. If a source code changes
     upstream and drops off the list, a few hundred creatures vanish from the
     picker and nothing else in the suite would say so. */
  is('the whole catalogue splits into books and adventures', books.length, 1479);
  is('and the rest are adventures', ALL.length - books.length, 2293);
  is('Infernal Machine Rebuild is an adventure, so its ettin called'
    + ' "The Demogorgon" is hidden',
    books.some((t) => t.source === 'IMR'), false);
  is('and all twenty-six of its creatures are behind the switch',
    ALL.filter((t) => t.source === 'IMR').length, 26);
} else {
  console.log('skip  the split needs BESTIARY_PASSWORD; the open set is all one book');
}

console.log('\n--- names with a qualifier in brackets ---');
is('the bracket comes off',
  plainName('Legendary Resistance (3/Day, or 4/Day in Lair)'), 'Legendary Resistance');
is('a plain name is left alone', plainName('Pack Tactics'), 'Pack Tactics');
is('and a bracket in the middle stays',
  plainName('Adhesive (Object Form Only) rider'), 'Adhesive (Object Form Only) rider');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
