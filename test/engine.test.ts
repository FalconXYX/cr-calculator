/* Engine regression tests. Run with `npm test`.
   Every "BUG" block pins a defect the previous calculator shipped. */

import * as E from '../src/lib/engine.ts';
import { CR_TABLE, TIERS } from '../src/lib/crTable.ts';
import { TRAITS, STAT_TRAITS, NO_EFFECT_TRAITS } from '../src/lib/traits.ts';
import type { EngineInput } from '../src/lib/engine.ts';

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

const base: EngineInput = {
  tierId: '0-4', ac: 13, hp: 75, attackBonus: 4, saveDC: 12,
  damageMode: 'flat', damagePerRound: 10, saveProficiencies: 0,
  traits: {}, traitValues: {},
};
const run = (o: Partial<EngineInput> = {}) => E.compute({ ...base, ...o });

console.log('--- table integrity ---');
let contigHP = true, contigDmg = true;
for (let i = 1; i < CR_TABLE.length; i++) {
  if (CR_TABLE[i]!.hpMin !== CR_TABLE[i - 1]!.hpMax + 1) contigHP = false;
  if (CR_TABLE[i]!.dmgMin !== CR_TABLE[i - 1]!.dmgMax + 1) contigDmg = false;
}
is('HP bands contiguous', contigHP, true);
is('damage bands contiguous', contigDmg, true);
is('34 rungs (CR 0..30)', CR_TABLE.length, 34);
is('4 target tiers', TIERS.length, 4);

console.log('\n--- reference example (AC13 HP75 +4 atk, 10 dmg, DC12) ---');
is('final CR', run().final.row.cr, '1');
is('defensive CR', run().defensive.row.cr, '1');
is('offensive CR', run().offensive.row.cr, '1');
is('XP', run().final.row.xpLabel, '200');

console.log('\n--- BUG 1: roundCR printed "0" for averages in [0.1875, 0.25) ---');
const b1 = run({ hp: 30, ac: 13, damagePerRound: 4, attackBonus: 3, saveDC: 13 });
is('def CR', b1.defensive.row.cr, '1/8');
is('off CR', b1.offensive.row.cr, '1/4');
is('average', b1.final.average, 0.1875);
is('final CR (old code said "0")', b1.final.row.cr, '1/4');

console.log('\n--- BUG 2: integer CR added to a fractional CR ---');
const b2 = run({ hp: 30, ac: 17, damagePerRound: 3, attackBonus: 3, saveDC: 13 });
is('steps 2 rungs to 1/2 (old code gave 2.125)', b2.defensive.row.cr, '1/2');
is('rung shift', b2.defensive.acShift, 2);

console.log('\n--- BUG 3: a 1-point deficit silently cost a full CR ---');
is('AC 12 (1 under) -> no shift', run({ ac: 12 }).defensive.acShift, 0);
is('AC 14 (1 over)  -> no shift', run({ ac: 14 }).defensive.acShift, 0);
is('AC 12 def CR stays 1 (old code gave 0)', run({ ac: 12 }).defensive.row.cr, '1');
is('AC 11 (2 under) -> -1 rung', run({ ac: 11 }).defensive.acShift, -1);
is('AC 15 (2 over)  -> +1 rung', run({ ac: 15 }).defensive.acShift, 1);
is('AC 10 (3 under) -> -1 rung', run({ ac: 10 }).defensive.acShift, -1);
is('AC 16 (3 over)  -> +1 rung', run({ ac: 16 }).defensive.acShift, 1);

console.log('\n--- BUG 4: zero-damage rounds dropped from the divisor ---');
is('30 on round 1 only, over 3 rounds',
  run({ damageMode: 'rounds', roundCount: 3, rounds: [30, 0, 0] }).effective.damage, 10);

console.log('\n--- CR 0 lists ceilings, not targets ---');
is('low AC is not penalised',
  run({ hp: 5, ac: 8, damagePerRound: 1, attackBonus: 0, saveDC: 5 }).defensive.row.cr, '0');
is('above the cap still counts', run({ hp: 5, ac: 20, damagePerRound: 1 }).defensive.row.cr, '1/2');

console.log('\n--- Legendary Resistance no longer affects CR ---');
is('not a scoring trait', TRAITS.some((t) => t.id === 'legendaryResistance'), false);
is('listed as no-effect', NO_EFFECT_TRAITS.some((t) => t.name === 'Legendary Resistance'), true);
is('ticking it changes nothing',
  run({ traits: { legendaryResistance: true }, traitValues: { legendaryResistance: 3 } }).effective.hp, 75);

console.log('\n--- tier-scaled traits ---');
is('Undead Fortitude @0-4  = +7',  run({ traits: { undeadFortitude: true } }).effective.hp, 82);
is('Undead Fortitude @17+  = +28', run({ tierId: '17+', traits: { undeadFortitude: true } }).effective.hp, 103);

console.log('\n--- resistance multipliers ---');
is('resist @0-4   x2',    run({ damageResistance: true }).effective.hp, 150);
is('resist @5-10  x1.5',  run({ tierId: '5-10', damageResistance: true }).effective.hp, 113);
is('resist @11-16 x1.25', run({ tierId: '11-16', damageResistance: true }).effective.hp, 94);
is('resist @17+   x1',    run({ tierId: '17+', damageResistance: true }).effective.hp, 75);
is('immune @17+   x1.25', run({ tierId: '17+', damageImmunity: true }).effective.hp, 94);
is('immunity beats resistance', run({ damageResistance: true, damageImmunity: true }).effective.hp, 150);

console.log('\n--- "level 10 or lower" gates ---');
is('Frightful Presence @0-4 = +25%', run({ traits: { frightfulPresence: true } }).effective.hp, 94);
is('Frightful Presence @17+ = nothing', run({ tierId: '17+', traits: { frightfulPresence: true } }).effective.hp, 75);
is('fly+ranged @0-4   = +2 AC', run({ flyAndRanged: true }).effective.ac, 15);
is('fly+ranged @11-16 = nothing', run({ tierId: '11-16', flyAndRanged: true }).effective.ac, 13);

console.log('\n--- save proficiencies ---');
is('2 -> +0 AC', run({ saveProficiencies: 2 }).effective.ac, 13);
is('3 -> +2 AC', run({ saveProficiencies: 3 }).effective.ac, 15);
is('5 -> +4 AC', run({ saveProficiencies: 5 }).effective.ac, 17);

console.log('\n--- bursts are averaged, never counted whole ---');
is('10/round + 9 once over 3 rounds = 13',
  run({ traits: { surpriseAttack: true }, traitValues: { surpriseAttack: 9 } }).effective.damage, 13);

console.log('\n--- Damage Transfer ---');
const dt = run({ hp: 60, traits: { damageTransfer: true } });
is('doubles effective HP', dt.effective.hp, 120);
is('adds HP/3 to damage', dt.effective.damage, 30);

console.log('\n--- every rung reproduces itself from its own baseline ---');
let ladderOK = true;
for (const r of CR_TABLE) {
  const res = E.compute({ ...base, tierId: '17+', hp: r.hpMin, ac: r.ac,
    damagePerRound: r.dmgMin, attackBonus: r.atk, saveDC: r.dc });
  if (res.final.row.cr !== r.cr) { ladderOK = false; console.log(`   mismatch at CR ${r.cr}: got ${res.final.row.cr}`); }
}
is('all 34 rungs self-consistent', ladderOK, true);

console.log('\n--- snapToRung never lands between rungs ---');
let snapOK = true;
for (let v = 0; v <= 30; v += 0.03125) if (!CR_TABLE[E.snapToRung(v)]) snapOK = false;
is('always a real rung', snapOK, true);

console.log('\n--- catalogue ---');
const ids = [...TRAITS, ...STAT_TRAITS].map((t) => t.id);
is('no duplicate ids', new Set(ids).size, ids.length);
is('every trait documents what it does', TRAITS.every((t) => t.desc.length > 20), true);
is('every trait documents its CR effect', TRAITS.every((t) => t.effect.length > 5), true);
is('every no-effect trait has a description', NO_EFFECT_TRAITS.every((t) => t.desc.length > 20), true);
console.log(`     ${STAT_TRAITS.length} stat rows + ${TRAITS.length} scoring + ${NO_EFFECT_TRAITS.length} no-effect = ${STAT_TRAITS.length + TRAITS.length + NO_EFFECT_TRAITS.length + 1} documented`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
