/* Monster Maker regression tests. Run with `npm test`. */

import * as S from '../src/lib/statblock.ts';
import { toMarkdown, toPlainText } from '../src/lib/statblockText.ts';
import { vibeCheck } from '../src/lib/vibeCheck.ts';
import {
  isLimitedUse, parseDamage, parseMultiattack, parseSaveDC, parseToHit, readDamage,
} from '../src/lib/damageText.ts';
import * as P from '../src/lib/actionPresets.ts';
import { roll20Filename, toRoll20, toRoll20Json } from '../src/lib/roll20.ts';
import {
  imageFilename, layoutStatBlock, smallCapRuns, wrapSpans,
} from '../src/lib/statblockImage.ts';
import type { FontSpec, Measure } from '../src/lib/statblockImage.ts';
import {
  fiveToolsFilename, retag, retagName, toFiveTools, toFiveToolsMonster,
} from '../src/lib/fivetools.ts';
import { detag } from '../src/lib/detag.ts';
import { findSelfName, renameThroughout, selfNameFor } from '../src/lib/rename.ts';
import type { CalcState } from '../src/lib/types.ts';
import { CR_TABLE } from '../src/lib/crTable.ts';

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

const CR1 = CR_TABLE[4]!;   // prof +2
const CR10 = CR_TABLE[13]!; // prof +4

console.log('--- ability modifiers ---');
is('score 10 is +0', S.abilityMod(10), 0);
is('score 11 is +0', S.abilityMod(11), 0);
is('score 9 is -1', S.abilityMod(9), -1);
is('score 1 is -5', S.abilityMod(1), -5);
is('score 30 is +10', S.abilityMod(30), 10);
is('sign renders +0', S.sign(0), '+0');
is('sign keeps minus', S.sign(-2), '-2');

console.log('\n--- hit dice ---');
const hd = S.hitDice(45, 'Medium', 2);
is('45 hp Medium con+2 -> 7d8 + 14', hd.text, '7d8 + 14');
is('and that averages back to 45', hd.average, 45);

const hd2 = S.hitDice(75, 'Medium', 2);
is('75 hp Medium con+2 -> 12d8 + 24', hd2.text, '12d8 + 24');
is('nearest reachable average is 78', hd2.average, 78);
is('11 dice would be further off',
  Math.abs(78 - 75) < Math.abs((Math.floor(11 * 4.5) + 22) - 75), true);

is('con +0 omits the modifier', S.hitDice(28, 'Small', 0).text, '8d6');
is('size picks the die', S.hitDice(100, 'Gargantuan', 0).die, 20);
is('negative con subtracts', S.hitDice(40, 'Large', -1).conTotal < 0, true);

/* A big enough Constitution penalty makes the per-die contribution negative,
   where no dice count reaches the target. It must still produce something. */
const cursed = S.hitDice(10, 'Tiny', -4);
is('impossible con still gives >=1 die', cursed.count >= 1, true);
is('impossible con still gives >=1 hp', cursed.average >= 1, true);
is('hp of 0 does not divide by zero', S.hitDice(0, 'Medium', 0).count >= 1, true);

console.log('\n--- derived bonuses ---');
const sb = S.defaultStatBlock();
sb.abilities = { str: 16, dex: 12, con: 15, int: 13, wis: 14, cha: 11 };
sb.saves = ['dex', 'wis'];
sb.skills = { stealth: 'proficient' };
sb.acValue = 13;
sb.hpValue = 75;
sb.proficiencyBonus = 2;
const d = S.derive(sb, CR1);
is('proficiency is the block\u2019s own', d.pb, 2);
is('unproficient save is the bare modifier', d.saveBonus.str, 3);
is('proficient save adds the bonus', d.saveBonus.wis, 4);
is('skill adds the bonus', d.skillBonus['stealth'], 3);
is('passive Perception without proficiency', d.passivePerception, 12);

sb.skills = { perception: 'proficient', stealth: 'proficient' };
const dPerc = S.derive(sb, CR1);
is('passive Perception with proficiency', dPerc.passivePerception, 14);

const dHigh = S.derive(sb, CR10);
is('a different calculator CR does NOT move the block\u2019s bonus', dHigh.pb, 2);
is('so proficient saves stay put', dHigh.saveBonus.wis, 4);
is('but the CR\u2019s own bonus is reported for comparison', dHigh.crPb, 4);
sb.proficiencyBonus = 4;
is('raising it on the block does move them', S.derive(sb, CR1).saveBonus.wis, 6);
sb.proficiencyBonus = 2;

console.log('\n--- skills: proficiency and expertise ---');
const sk = S.defaultStatBlock();
sk.abilities = { str: 10, dex: 16, con: 10, int: 18, wis: 12, cha: 8 };
sk.proficiencyBonus = 3;
sk.skills = { arcana: 'proficient', stealth: 'expertise', athletics: 'proficient' };
const skd = S.derive(sk, CR1);

/* Each skill keys off its OWN ability, not a shared one. */
is('Arcana is Intelligence plus proficiency', skd.skillBonus['arcana'], 7);
is('Stealth is Dexterity plus twice proficiency', skd.skillBonus['stealth'], 9);
is('Athletics is Strength plus proficiency', skd.skillBonus['athletics'], 3);

sk.skills = { arcana: 'expertise' };
is('expertise doubles only the proficiency bonus, not the ability',
  S.derive(sk, CR1).skillBonus['arcana'], 10);

is('an untrained skill has no entry', 'medicine' in S.derive(sk, CR1).skillBonus, false);

/* Every skill must key off the right ability. */
const ABILITY_OF: Record<string, string> = {
  acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str',
  deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha',
  investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', sleightOfHand: 'dex',
  stealth: 'dex', survival: 'wis',
};
is('all 18 skills map to the right ability',
  S.SKILLS.every((x) => ABILITY_OF[x.id] === x.ability), true);
is('and the map covers every skill', Object.keys(ABILITY_OF).length, S.SKILLS.length);

const pairs = S.defaultStatBlock();
pairs.proficiencyBonus = 2;
pairs.abilities = { str: 20, dex: 18, con: 16, int: 14, wis: 12, cha: 10 };
pairs.skills = Object.fromEntries(S.SKILLS.map((x) => [x.id, 'proficient' as const]));
const pd = S.derive(pairs, CR1);
is('every skill reads its own ability modifier',
  S.SKILLS.every((x) => pd.skillBonus[x.id] === pd.mods[x.ability] + 2), true);

/* Skills were a flat list of proficient ids before expertise existed. */
const oldSkills = S.reviveStatBlock({ skills: ['stealth', 'perception'] });
is('an old skill list becomes proficiencies', oldSkills.skills['stealth'], 'proficient');
is('and every entry in it', oldSkills.skills['perception'], 'proficient');
is('a tiered object survives',
  S.reviveStatBlock({ skills: { stealth: 'expertise' } }).skills['stealth'], 'expertise');
is('a junk tier is dropped',
  'stealth' in S.reviveStatBlock({ skills: { stealth: 'mastery' } }).skills, false);

console.log('\n--- initiative ---');
const init = S.defaultStatBlock();
init.abilities = { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 };
init.proficiencyBonus = 3;

init.initiative = 'none';
is('untrained is just Dexterity', S.derive(init, CR1).initiativeBonus, 3);
is('and the score is 10 plus that', S.derive(init, CR1).initiativeScore, 13);

init.initiative = 'proficient';
is('proficient adds the bonus once', S.derive(init, CR1).initiativeBonus, 6);
is('score follows', S.derive(init, CR1).initiativeScore, 16);

init.initiative = 'expertise';
is('expertise adds it twice', S.derive(init, CR1).initiativeBonus, 9);
is('score follows', S.derive(init, CR1).initiativeScore, 19);

/* It leans on the block's own proficiency bonus, not the calculator's. */
init.proficiencyBonus = 5;
is('a bigger proficiency bonus doubles through', S.derive(init, CR1).initiativeBonus, 13);
is('the calculator CR does not change it', S.derive(init, CR10).initiativeBonus, 13);

init.abilities.dex = 8;
init.initiative = 'none';
is('a Dexterity penalty carries', S.derive(init, CR1).initiativeBonus, -1);
is('and the score with it', S.derive(init, CR1).initiativeScore, 9);

is('initiative doubles under expertise too', (() => {
  const e = S.defaultStatBlock();
  e.abilities.dex = 16; e.proficiencyBonus = 4; e.initiative = 'expertise';
  return S.derive(e, CR1).initiativeBonus;
})(), 11);
is('an older block defaults to untrained', S.reviveStatBlock({ name: 'Old' }).initiative, 'none');
is('a nonsense value falls back', S.reviveStatBlock({ initiative: 'wizardry' }).initiative, 'none');
is('a real value survives', S.reviveStatBlock({ initiative: 'expertise' }).initiative, 'expertise');
is('every tier has a label', S.PROFICIENCY_TIERS.every((t) => t in S.PROFICIENCY_LABEL), true);

console.log('\n--- the block owns its own defences ---');
sb.acValue = 17; sb.hpValue = 200;
is('AC is the block\u2019s own', S.derive(sb, CR1).ac, 17);
is('HP is the block\u2019s own', S.derive(sb, CR1).hp, 200);
is('hit dice follow that HP', S.derive(sb, CR1).hitDice.average > 150, true);
sb.acValue = 13; sb.hpValue = 75;

console.log('\n--- line formatting ---');
is('speed lists only what it has',
  S.speedText({ walk: 30, burrow: 0, climb: 0, fly: 60, swim: 0, hover: true }),
  '30 ft., Fly 60 ft. (hover)');
is('no hover, no parenthetical',
  S.speedText({ walk: 30, burrow: 0, climb: 0, fly: 60, swim: 0, hover: false }),
  '30 ft., Fly 60 ft.');
is('senses always end with passive Perception',
  S.sensesText({ darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false }, 12),
  'Darkvision 60 ft., passive Perception 12');
is('blindsight rider appears',
  S.sensesText({ darkvision: 0, blindsight: 30, tremorsense: 0, truesight: 0, blindBeyond: true }, 11)
    .includes('(blind beyond this radius)'), true);
is('no languages prints an em dash', S.languagesText([], 0), '—');
is('telepathy joins the language list', S.languagesText(['Common'], 60), 'Common, Telepathy 60 ft.');

const meta = S.defaultStatBlock();
meta.size = 'Large'; meta.type = 'Fiend'; meta.alignment = 'Chaotic Evil';
is('meta line', S.metaText(meta), 'Large Fiend, Chaotic Evil');
meta.alignment = '';
is('no alignment, no comma', S.metaText(meta), 'Large Fiend');

const order = S.defaultStatBlock();
order.saves = ['wis', 'dex'];
is('saves print in ability order', S.savesText(order, S.derive(order, CR1)), 'Dex +2, Wis +2');

console.log('\n--- revive ---');
const revived = S.reviveStatBlock({ name: 'Old Save', abilities: { str: 18 } });
is('keeps what was saved', revived.name, 'Old Save');
is('keeps a partial nested value', revived.abilities.str, 18);
is('fills a missing nested value', revived.abilities.cha, 10);
is('fills a field added later', revived.legendaryCount, 3);
is('entry groups always exist', Array.isArray(revived.entries.lair), true);
is('garbage in gives defaults out', S.reviveStatBlock(null).name, 'Monster');
/* Blocks saved before the vocabularies were capitalised. */
is('a lowercase type is folded onto the canonical spelling',
  S.reviveStatBlock({ type: 'humanoid' }).type, 'Humanoid');
is('a lowercase alignment likewise',
  S.reviveStatBlock({ alignment: 'chaotic evil' }).alignment, 'Chaotic Evil');
is('the old bare Neutral becomes True Neutral',
  S.reviveStatBlock({ alignment: 'Neutral' }).alignment, 'True Neutral');
is('Unaligned survives now that it is back',
  S.reviveStatBlock({ alignment: 'unaligned' }).alignment, 'Unaligned');
is('an unknown value is kept rather than snapped',
  S.reviveStatBlock({ type: 'Aberrant Horror' }).type, 'Aberrant Horror');
is('undefined gives defaults out', S.reviveStatBlock(undefined).size, 'Medium');

console.log('\n--- unusual choices ---');
is('Incapacitated immunity is flagged',
  S.unusualPicks(['Incapacitated'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 1);
is('Stunned immunity is flagged',
  S.unusualPicks(['Stunned'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 1);
is('both at once give two notes',
  S.unusualPicks(['Stunned', 'Incapacitated'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 2);
is('an ordinary condition immunity is not flagged',
  S.unusualPicks(['Poisoned', 'Charmed'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 0);
is('Force resistance is flagged',
  S.unusualPicks(['Force'], S.UNUSUAL_RESISTANCES).length, 1);
is('Force immunity is flagged',
  S.unusualPicks(['Force'], S.UNUSUAL_DAMAGE_IMMUNITIES).length, 1);
is('an ordinary resistance is not flagged',
  S.unusualPicks(['Cold', 'Fire'], S.UNUSUAL_RESISTANCES).length, 0);
is('nothing picked, nothing flagged',
  S.unusualPicks([], S.UNUSUAL_CONDITION_IMMUNITIES).length, 0);
/* A value typed by hand will not match the canonical capitalisation. */
is('matching ignores case', S.unusualPicks(['force'], S.UNUSUAL_RESISTANCES).length, 1);
is('and surrounding space', S.unusualPicks([' Stunned '], S.UNUSUAL_CONDITION_IMMUNITIES).length, 1);
is('every warning explains itself',
  [...S.UNUSUAL_CONDITION_IMMUNITIES, ...S.UNUSUAL_RESISTANCES, ...S.UNUSUAL_DAMAGE_IMMUNITIES]
    .every((u) => u.why.length > 60), true);
is('every flagged value is a real option',
  S.UNUSUAL_CONDITION_IMMUNITIES.every((u) => S.CONDITIONS.includes(u.value))
  && S.UNUSUAL_RESISTANCES.every((u) => S.DAMAGE_TYPES.includes(u.value))
  && S.UNUSUAL_DAMAGE_IMMUNITIES.every((u) => S.DAMAGE_TYPES.includes(u.value)), true);

console.log('\n--- export ---');
const full = S.defaultStatBlock();
full.name = 'Bog Hag';
full.resistances = ['Cold'];
full.skills = {};
full.entries.trait = [{ id: 't', name: 'Amphibious', text: 'Breathes air and water.' }];
full.entries.action = [{ id: 'a', name: 'Claws', text: 'Melee Weapon Attack: +5 to hit.' }];
full.entries.action.push({ id: 'b', name: 'Shift', text: 'Disengages.', kind: 'bonus' });
full.entries.action.push({ id: 'r', name: 'Parry', text: 'Adds 3 to its AC.', kind: 'reaction' });
full.entries.legendary = [{ id: 'l', name: 'Detect', text: 'Makes a Perception check.' }];
const fd = S.derive(full, CR1);
const md = toMarkdown(full, fd);
const txt = toPlainText(full, fd);

is('markdown heads with the name', md.startsWith('> ## Bog Hag'), true);
is('markdown has an ability table', md.includes('|:---:|'), true);
is('markdown carries the challenge', md.includes('**Challenge** 1 (200 XP)'), true);
is('markdown carries initiative', md.includes('**Initiative** +0 (10)'), true);
is('initiative sits between armour and hit points',
  md.indexOf('**Armor Class**') < md.indexOf('**Initiative**')
  && md.indexOf('**Initiative**') < md.indexOf('**Hit Points**'), true);
is('plain text carries initiative', txt.includes('Initiative +0 (10)'), true);
is('markdown names the action section', md.includes('### Actions'), true);
is('markdown heads each action kind', md.includes('### Bonus Actions') && md.includes('### Reactions'), true);
is('and orders them action, bonus, reaction',
  md.indexOf('### Actions') < md.indexOf('### Bonus Actions')
  && md.indexOf('### Bonus Actions') < md.indexOf('### Reactions'), true);
is('markdown writes the legendary preamble', md.includes('can take 3 legendary actions'), true);
is('markdown omits empty lines like Skills', md.includes('**Skills**'), false);
is('markdown keeps a line that has content', md.includes('**Damage Resistances** Cold'), true);
is('every markdown line is quoted', md.split('\n').every((l) => l.startsWith('>')), true);
is('plain text heads with the name', txt.startsWith('Bog Hag'), true);
is('plain text has no markdown syntax', /[*_|]/.test(txt), false);
is('plain text carries the challenge', txt.includes('Challenge 1 (200 XP)'), true);

/* Newlines inside an entry would break the one-line-per-entry export. */
const multi = S.defaultStatBlock();
multi.entries.trait = [{ id: 'm', name: 'Long', text: 'First para.\n\nSecond para.' }];
const mdMulti = toMarkdown(multi, S.derive(multi, CR1));
is('entry newlines are flattened', mdMulti.includes('First para. Second para.'), true);
is('and still every line is quoted', mdMulti.split('\n').every((l) => l.startsWith('>')), true);

console.log('\n--- one action list, three kinds ---');
const acts = S.defaultStatBlock();
acts.entries.action = [
  { id: '1', name: 'Claw', text: 'Hit: 5 (1d8 + 1) slashing damage.' },
  { id: '2', name: 'Parry', text: 'Adds 2 to AC.', kind: 'reaction' },
  { id: '3', name: 'Bite', text: 'Hit: 7 (1d10 + 2) piercing damage.', kind: 'action' },
  { id: '4', name: 'Shift', text: 'Disengages.', kind: 'bonus' },
];
is('an untagged entry is a plain action', S.kindOf(acts.entries.action[0]!), 'action');
const grouped = S.actionsByKind(acts.entries.action);
is('three groups come back', grouped.length, 3);
is('actions first', grouped[0]!.kind, 'action');
is('then bonus actions', grouped[1]!.kind, 'bonus');
is('then reactions', grouped[2]!.kind, 'reaction');
is('authored order holds inside a group',
  grouped[0]!.entries.map((e) => e.name).join(','), 'Claw,Bite');
is('an empty kind is left out',
  S.actionsByKind([{ id: 'x', name: 'A', text: '' }]).length, 1);
is('an empty list gives no groups', S.actionsByKind([]).length, 0);

/* Bonus actions and reactions used to be lists of their own. */
const oldEntries = S.reviveStatBlock({ entries: {
  action: [{ id: 'a', name: 'Claw', text: '' }],
  bonus: [{ id: 'b', name: 'Shift', text: '' }],
  reaction: [{ id: 'r', name: 'Parry', text: '' }],
} });
is('old lists collapse into one', oldEntries.entries.action.length, 3);
is('the action keeps its kind', S.kindOf(oldEntries.entries.action[0]!), 'action');
is('the bonus action is tagged', S.kindOf(oldEntries.entries.action[1]!), 'bonus');
is('the reaction is tagged', S.kindOf(oldEntries.entries.action[2]!), 'reaction');
is('and nothing is lost',
  oldEntries.entries.action.map((e) => e.name).join(','), 'Claw,Shift,Parry');

console.log('\n--- Roll20 export ---');
const r20 = S.defaultStatBlock();
r20.name = 'Bog Hag';
r20.size = 'Large';
r20.type = 'Fey';
r20.alignment = 'Neutral Evil';
r20.acValue = 16; r20.acNote = 'Natural Armor';
r20.hpValue = 142;
r20.proficiencyBonus = 3;
r20.abilities = { str: 18, dex: 16, con: 16, int: 14, wis: 14, cha: 11 };
r20.saves = ['str', 'wis'];
r20.skills = { stealth: 'expertise', perception: 'proficient', sleightOfHand: 'proficient' };
r20.initiative = 'proficient';
r20.resistances = ['Cold'];
r20.conditionImmunities = ['Charmed'];
r20.languages = ['Common'];
r20.speeds = { walk: 30, burrow: 0, climb: 0, fly: 60, swim: 0, hover: false };
r20.senses = { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false };
r20.entries.trait = [{ id: 't', name: 'Amphibious', text: 'Breathes air and water.' }];
r20.entries.action = [
  { id: 'a', name: 'Claws', text: 'Melee Attack Roll: +7, reach 5 ft. Hit: 13 (2d6 + 6) Slashing damage.' },
  { id: 'b', name: 'Shift', text: 'Disengages.', kind: 'bonus' },
  { id: 'c', name: 'Parry', text: 'Adds 3 to AC.', kind: 'reaction' },
];
r20.entries.legendary = [{ id: 'l', name: 'Tail Swipe', text: 'Deals 7 (2d6) damage.' }];
r20.entries.lair = [{ id: 'z', name: 'Grasping Roots', text: 'Roots erupt.' }];
r20.legendaryCount = 3;
const rd = S.derive(r20, CR_TABLE[13]!);
const doc = toRoll20(r20, rd);

const at = (name: string) => doc.attribs.find((x) => x.name === name);
is('schema version 2', doc.schema_version, 2);
is('name at the top level', doc.name, 'Bog Hag');
is('the sheet is marked as an NPC', at('npc')?.current, 1);
is('armour class', at('npc_ac')?.current, 16);
is('armour note', at('npc_actype')?.current, 'Natural Armor');
is('hit points with the dice', at('npc_hpbase')?.current, '142 (17d10 + 51)');
is('hp lives in the max field', at('hp')?.max, 142);
is('speed', at('npc_speed')?.current, '30 ft., Fly 60 ft.');
is('initiative bonus carries', at('initiative_bonus')?.current, 6);
is('ability score', at('strength')?.current, 18);
is('ability modifier', at('strength_mod')?.current, 4);
is('a proficient save is written', at('npc_str_save')?.current, 7);
is('and flagged', at('npc_str_save_flag')?.current, 1);
is('an unproficient save is absent', at('npc_dex_save'), undefined);
is('challenge rating', at('npc_challenge')?.current, '10');
is('xp has no thousands separator', at('npc_xp')?.current, '5900');
is('senses', at('npc_senses')?.current, 'Darkvision 60 ft., passive Perception 15');
is('condition immunities', at('npc_condition_immunities')?.current, 'Charmed');
is('legendary count', at('npc_legendary_actions')?.current, 3);
is('reactions flag is set', at('npcreactionsflag')?.current, 1);
is('the save DC is read out of the actions', at('npc_spelldc')?.current, 11);
is('the attack bonus too', at('npc_spellattackmod')?.current, 7);

/* Roll20's skill keys are snake_case throughout. The source gist used
   String.replace, which only swaps the FIRST space, so "sleight of hand"
   came out as "sleight_of hand" and the sheet ignored it. */
is('a one-word skill', at('npc_stealth')?.current, 9);
is('expertise doubled it', at('npc_stealth')?.current, 9);
is('a two-word skill is fully snake_cased', at('npc_sleight_of_hand')?.current, 6);
is('and not half-converted', at('npc_sleight_of hand'), undefined);
is('skills are flagged on', at('npc_skills_flag')?.current, 1);

const rows = (prefix: string) => doc.attribs
  .filter((x) => x.name.startsWith(`repeating_${prefix}_`) && x.name.endsWith('_name'))
  .map((x) => String(x.current));
is('traits become trait rows', rows('npctrait').join(','), 'Amphibious');
is('bonus actions ride with the actions, labelled',
  rows('npcaction').join(','), 'Claws,Shift (Bonus Action),Grasping Roots (Lair Action)');
is('reactions get their own rows', rows('npcreaction').join(','), 'Parry');
is('legendary actions are preceded by the preamble',
  rows('npcaction-l').join(','), 'Legendary Actions,Tail Swipe');

/* Roll20 splits repeating attribute names on underscores, so a row id
   containing one would silently break the row. */
const rowIds = doc.attribs
  .filter((x) => x.name.startsWith('repeating_'))
  .map((x) => x.name.split('_')[2]!);
is('no row id contains an underscore', rowIds.every((x) => !x.includes('_')), true);
is('every attribute has a unique id',
  new Set(doc.attribs.map((x) => x.id)).size, doc.attribs.length);
is('ids are Roll20 length', doc.attribs.every((x) => x.id.length === 20), true);

const token = JSON.parse(doc.defaulttoken) as Record<string, unknown>;
is('a Large token is two squares wide', token['width'], 140);
is('the token points at the character', token['represents'], doc.oldId);
is('bar 1 is hit points', token['bar1_max'], 142);
is('bar 2 is armour class', token['bar2_value'], 16);

is('the whole thing is valid JSON',
  typeof JSON.parse(toRoll20Json(r20, rd)), 'object');
is('filename is safe', roll20Filename(r20), 'Bog_Hag.json');
is('an awkward name is scrubbed',
  roll20Filename({ ...r20, name: 'Bog/Hag: "Old" #2' }), 'BogHag_Old_2.json');
is('an empty name still gives a file',
  roll20Filename({ ...r20, name: '' }), 'monster.json');

console.log('\n--- vocabulary ---');
is('18 skills', S.SKILLS.length, 18);
is('no duplicate skill ids', new Set(S.SKILLS.map((s) => s.id)).size, S.SKILLS.length);
is('13 damage types', S.DAMAGE_TYPES.length, 13);
is('15 conditions', S.CONDITIONS.length, 15);
const vocab = [...S.DAMAGE_TYPES, ...S.CONDITIONS, ...S.CREATURE_TYPES, ...S.ALIGNMENTS, ...S.LANGUAGES];
is('every vocabulary word is capitalised', vocab.every((w) => /^[A-Z]/.test(w)), true);
is('14 monster types', S.CREATURE_TYPES.length, 14);
is('10 alignments', S.ALIGNMENTS.length, 10);
is('the neutral alignment is True Neutral', S.ALIGNMENTS.includes('True Neutral'), true);
is('Unaligned comes last', S.ALIGNMENTS[S.ALIGNMENTS.length - 1], 'Unaligned');
is('6 sizes, each with a hit die',
  S.SIZES.every((z) => typeof S.HIT_DIE[z] === 'number') && S.SIZES.length === 6, true);
is('every entry section has a heading entry',
  S.ENTRY_SECTIONS.every((x) => x in S.ENTRY_HEADING), true);
is('4 entry sections now', S.ENTRY_SECTIONS.length, 4);
is('3 action kinds, each with a label and a heading',
  S.ACTION_KINDS.every((k) => k in S.ACTION_KIND_LABEL && k in S.ACTION_KIND_HEADING)
  && S.ACTION_KINDS.length === 3, true);
is('traits deliberately have no heading', S.ENTRY_HEADING.trait, '');
is('entry ids are unique', S.newEntryId() !== S.newEntryId(), true);

console.log('\n--- vibe check: reading numbers out of text ---');
is('stated average wins', parseDamage('Hit: 10 (2d6 + 3) slashing damage.'), 10);
is('dice alone are averaged', parseDamage('takes (2d6) fire damage'), 7);
is('dice with a modifier', parseDamage('(2d6 + 3)'), 10);
is('two damage clauses add up',
  parseDamage('Hit: 10 (2d6 + 3) slashing damage plus 7 (2d6) fire damage.'), 17);
is('a reach is not damage', parseDamage('reach 5 ft., one target.'), 0);
is('a save DC is not damage', parseDamage('DC 15 Dexterity saving throw'), 0);
is('a recharge note is not damage', parseDamage('Breath Weapon (Recharge 5-6)'), 0);
is('negative modifiers cannot go below zero', parseDamage('(1d4 - 10)'), 0);

is('to hit is read', parseToHit('+5 to hit, reach 5 ft.'), 5);
is('highest to hit wins', parseToHit('+5 to hit. Also +11 to hit.'), 11);
is('no to hit gives null', parseToHit('The creature hides.'), null);
is('save DC is read', parseSaveDC('DC 15 Dexterity saving throw'), 15);
is('the 2024 wording is read too',
  parseSaveDC('Dexterity Saving Throw: DC 21, each creature in a Cone.'), 21);
is('and a spellcasting preamble',
  parseSaveDC('using Charisma as the spellcasting ability (spell save DC 20)'), 20);
is('highest save DC wins',
  parseSaveDC('Constitution Saving Throw: DC 12. Wisdom Saving Throw: DC 18.'), 18);

/* A stat block is full of DCs that nobody rolls a saving throw against. An
   ankheg's escape DC 13 beats its real save DC of 12, and reading it would
   quietly score the ankheg as the harder monster. */
is('an escape DC is not a save DC',
  parseSaveDC('the target has the Grappled condition (escape DC 13).'), null);
is('nor is a skill check DC',
  parseSaveDC('a buried creature can make a DC 18 Strength (Athletics) check.'), null);
is('and a real save still wins past one',
  parseSaveDC('Constitution Saving Throw: DC 12, escape DC 14.'), 12);

console.log('\n--- damage that replaces rather than adds ---');
/* The bug this was written for: the Elemental Cataclysm rolls a d4 for one of
   four effects, and adding all four gave 161 where the worst deals 45. */
is('an "or" clause is a choice, not a total',
  parseDamage('Hit: 11 (2d6 + 4) Piercing damage, or 18 (4d6 + 4) Piercing damage if it had Advantage.'), 18);
is('a miss replaces the hit',
  parseDamage('Hit: 10 (3d6) Fire damage. Miss: 5 (1d6) Fire damage.'), 10);
is('but "Hit or Miss" is not a choice at all',
  parseDamage('Hit: 22 (4d6 + 8) Slashing damage plus 36 (8d8) Radiant damage. Hit or Miss: it returns.'), 58);
is('a second failure replaces the first',
  parseDamage('First Failure: 10 (3d6) damage. Second Failure: 20 (6d6) damage.'), 20);
is('a choice is over at the end of its sentence',
  parseDamage('Hit: 14 (2d10 + 3) damage, or 8 (1d10 + 3) damage if Bloodied. Until the grapple ends, the target takes 7 (2d6) Necrotic damage.'), 21);

const menu = [
  'The creature creates one of the following effects at random (roll 1d4):',
  '', '1: Flames. Failure: 45 (13d6) Fire damage.',
  '', '2: Waves. Failure: 22 (5d8) Bludgeoning damage plus 22 (5d8) Cold damage.',
  '', '3: Storm. Failure: 18 (4d8) Lightning damage plus 18 (4d8) Thunder damage.',
  '', '4: Earth. Failure: 18 (4d8) Bludgeoning damage plus 18 (4d8) Acid damage.',
].join('\n');
is('four random effects are averaged, not summed', parseDamage(menu), 40);
is('and the reading says how many there were', readDamage(menu).choices, 4);
is('and that it was rolled for', readDamage(menu).random, true);

/* Ten eye rays, four of which deal nothing. The die is what says there are
   ten; counting only the six that hurt would rate the beholder as though it
   never rolled a dud. */
const rays = [
  'The beholder randomly shoots one of the following rays (roll 1d10):',
  '', '1: Charm Ray. Failure: 13 (3d8) Psychic damage.',
  '', '2: Paralyzing Ray. Failure: the target is Paralyzed.',
  '', '3: Death Ray. Failure: 55 (10d10) Necrotic damage.',
].join('\n');
is('a d10 menu divides by ten, not by the options with damage', parseDamage(rays), 7);

is('a menu that is chosen takes the heaviest', parseDamage([
  'The creature uses one of the following, of its choice:',
  '', 'Burn. 30 (12d4) Fire damage.',
  '', 'Freeze. 10 (4d4) Cold damage.',
].join('\n')), 30);

console.log('\n--- reading a Multiattack ---');
is('a plain routine', JSON.stringify(parseMultiattack('The dragon makes three Rend attacks.')),
  JSON.stringify({ branches: [[{ times: 3, names: ['Rend'] }]] }));
is('two different attacks add up',
  parseMultiattack('The balor makes one Flame Whip attack and one Lightning Blade attack.')!.branches[0]!.length, 2);
is('"in any combination" is a choice within one clause',
  JSON.stringify(parseMultiattack('The bandit makes three attacks, using Scimitar or Pistol in any combination.')!.branches[0]![0]!.names),
  JSON.stringify(['Scimitar', 'Pistol']));
is('an "or it makes" is a second routine, not more attacks',
  parseMultiattack('The devil makes one Claws attack and one Tail attack, or it makes two Hurl Flame attacks.')!.branches.length, 2);
is('a mixed routine keeps both halves',
  parseMultiattack('The tarrasque makes one Bite attack and three other attacks, using Claw or Tail in any combination.')!.branches[0]!.length, 2);
is('something used alongside the attacks comes too',
  parseMultiattack('The banshee makes two Corrupting Touch attacks and uses Horrify.')!.branches[0]!.length, 2);
is('a repeated action is read', parseMultiattack('The beholder uses Eye Rays three times.')!.branches[0]![0]!.times, 3);
is('and what cannot be read comes back empty-handed',
  parseMultiattack('The hydra makes as many Bite attacks as it has heads.'), null);

is('a recharge marks a limited use', isLimitedUse('Fire Breath (Recharge 5\u20136)'), true);
is('so does a daily', isLimitedUse('Wish (1/Day)'), true);
is('a plain attack is not limited', isLimitedUse('Greatsword'), false);

console.log('\n--- vibe check: filling the calculator ---');
const blank: CalcState = {
  tierId: '0-4', ac: 1, hp: 1, attackBonus: 0, saveDC: 0, extraDamage: 0,
  roundCount: 3, primary: [9, 9, 9, 0, 0, 0], secondary: [9, 9, 9, 0, 0, 0],
  traits: { staleTrait: true }, traitValues: { staleTrait: 99 },
};

const mon = S.defaultStatBlock();
mon.acValue = 16;
mon.hpValue = 142;
mon.abilities = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
mon.saves = ['str', 'con', 'wis'];
mon.resistances = ['Cold'];
mon.damageImmunities = ['Poison'];
mon.entries.trait = [
  { id: '1', name: 'Pack Tactics', text: 'Advantage when an ally is within 5 feet.' },
  { id: '2', name: 'Not A Real Trait', text: 'Does nothing the DMG scores.' },
];
mon.entries.action = [
  { id: '3', name: 'Greatsword', text: 'Melee Weapon Attack: +7 to hit, reach 5 ft. Hit: 13 (2d6 + 6) slashing damage.' },
  { id: '4', name: 'Breath Weapon (Recharge 5-6)', text: 'Each creature makes a DC 15 save, taking 45 (10d8) fire damage.' },
];
mon.entries.legendary = [
  { id: '5', name: 'Tail Swipe', text: 'The creature deals 7 (2d6) bludgeoning damage.' },
];
mon.entries.action.push(
  { id: '6', name: 'Riposte', text: 'The creature deals 4 (1d8) piercing damage.', kind: 'reaction' });

mon.proficiencyBonus = 3;
const v = vibeCheck(mon, blank);
is('armour class is taken', v.next.ac, 16);
is('hit points are taken', v.next.hp, 142);
is('the stated to-hit wins over the ability score', v.next.attackBonus, 7);
is('the stated save DC is taken', v.next.saveDC, 15);
is('a matching trait is ticked', v.next.traits['packTactics'], true);
is('a non-matching trait is ignored', 'notarealtrait' in v.next.traits, false);
/* One resistance and one immunity, which is under the line. Ticking these
   was doubling the effective hit points of every skeleton immune to poison. */
is('one resistance does not tick the row',
  v.next.traits['damageResistance'] ?? false, false);
is('nor does one immunity', v.next.traits['damageImmunity'] ?? false, false);
is('but the report says so rather than going quiet',
  v.report.judged.filter((l) => /under the three it takes/.test(l)).length, 2);
is('three save proficiencies are counted', v.next.traitValues['saveProficiencies'], 3);
is('stale traits are cleared', 'staleTrait' in v.next.traits, false);

/* Breath Weapon scores its own damage through the trait, so counting it in
   the round as well would charge the monster for it twice. */
is('breath weapon is scored as a trait', v.next.traits['breathWeapon'], true);
is('and carries its damage', v.next.traitValues['breathWeapon'], 45);
is('so the round holds only the greatsword', v.next.primary[0], 13);
/* Three legendary actions a round and one option to spend them on, so it
   spends them on that. The reaction is one more, off-turn. */
is('legendary actions are spent, and a reaction added',
  v.next.extraDamage, 3 * 7 + 4);
is('rounds collapse to one', v.next.roundCount, 1);
is('secondary damage is cleared', v.next.secondary[0], 0);
is('the target CR range is left alone', v.next.tierId, '0-4');

console.log('\n--- a defence has to be worth routing around ---');
/* Three is the line, and it is where nonmagical bludgeoning, piercing and
   slashing lands — the case the rule exists for. */
const armoured = S.defaultStatBlock();
armoured.resistances = ['Bludgeoning', 'Piercing', 'Slashing'];
armoured.damageImmunities = ['Necrotic', 'Poison'];
armoured.saves = ['dex', 'con'];
const a = vibeCheck(armoured, blank);
is('three resistances tick the row', a.next.traits['damageResistance'], true);
is('two immunities do not', a.next.traits['damageImmunity'] ?? false, false);
is('two save proficiencies do not tick either',
  a.next.traits['saveProficiencies'] ?? false, false);
is('and the two that fell short are both explained',
  a.report.judged.filter((l) => /under the three/.test(l)).length, 2);

const warded = S.defaultStatBlock();
warded.damageImmunities = ['Fire', 'Poison', 'Psychic'];
warded.saves = ['str', 'dex', 'con', 'wis'];
const w = vibeCheck(warded, blank);
is('three immunities tick the immunity row', w.next.traits['damageImmunity'], true);
is('four save proficiencies tick theirs', w.next.traits['saveProficiencies'], true);
is('and carry their count', w.next.traitValues['saveProficiencies'], 4);
is('the report says what it took', v.report.took.length > 5, true);

/* The 2024 books write attack lines differently from the 2014 ones. */
is('2014 wording is read', parseToHit('Melee Weapon Attack: +7 to hit, reach 5 ft.'), 7);
is('2024 wording is read', parseToHit('Melee Attack Roll: +10, reach 5 ft.'), 10);
is('ranged 2024 wording too', parseToHit('Ranged Attack Roll: +6, range 150/600 ft.'), 6);
is('the higher of the two wordings wins',
  parseToHit('Melee Attack Roll: +10. Also +12 to hit.'), 12);
is('a 2024 save line still yields its DC',
  parseSaveDC('Constitution Saving Throw: DC 12, each creature in a 15-foot Cone.'), 12);
is('2024 damage with no stated average is worked out',
  parseDamage('Hit: (4d12 + 5) Force damage.'), 31);

console.log('\n--- action presets ---');
is('every preset has a name and body',
  P.ACTION_PRESETS.every((x) => x.name.length > 0 && x.text.length > 20), true);
is('no duplicate preset ids',
  new Set(P.ACTION_PRESETS.map((x) => x.id)).size, P.ACTION_PRESETS.length);
is('every preset belongs to a listed group',
  P.ACTION_PRESETS.every((x) => P.PRESET_GROUPS.includes(x.group)), true);
is('every preset kind is a real kind',
  P.ACTION_PRESETS.every((x) => S.ACTION_KINDS.includes(x.kind)), true);
is('lookup by id works', P.presetById('slam')?.name, 'Slam');
is('an unknown id gives nothing', P.presetById('nope'), undefined);

/* A preset the vibe check cannot read would be worse than no preset.
   Only actual attack lines count: Parry and Riposte mention an attack roll
   in prose without being one, and must NOT yield a bonus. */
const attackLines = P.ACTION_PRESETS.filter(
  (x) => /attack roll:\s*[+-]?\d/i.test(x.text) || /[+-]?\d+\s*to hit/i.test(x.text));
is('every attack preset yields a to-hit',
  attackLines.every((x) => parseToHit(x.text) !== null), true);
is('and there are several', attackLines.length >= 8, true);
is('prose mentioning an attack roll yields nothing',
  parseToHit(P.presetById('parry')!.text), null);
is('nor does a riposte', parseToHit(P.presetById('riposte')!.text), null);
const damaging = P.ACTION_PRESETS.filter((x) => /damage/i.test(x.text) && /\d+d\d+/.test(x.text));
is('every damaging preset yields damage',
  damaging.every((x) => parseDamage(x.text) > 0), true);
is('and there are some to check', damaging.length > 8, true);

console.log('\n--- vibe check: what it admits it cannot do ---');
const multiAtk = S.defaultStatBlock();
multiAtk.entries.action = [
  { id: 'm', name: 'Multiattack', text: 'The creature makes two claw attacks.' },
  { id: 'c', name: 'Claw', text: 'Melee Weapon Attack: +4 to hit. Hit: 6 (1d8 + 2) slashing damage.' },
];
const vm = vibeCheck(multiAtk, blank);
is('the routine is two claws, not one', vm.next.primary[0], 12);
is('and the report says why',
  vm.report.judged.some((x) => x.includes('2 \u00d7 **Claw**')), true);
/* The panel turns `**…**` into bold, so a stray or unclosed marker would be
   printed at the reader instead of emphasising anything. */
const marks = (r: { took: string[]; judged: string[]; skipped: string[] }): number =>
  [...r.took, ...r.judged, ...r.skipped]
    .reduce((n, line) => n + (line.match(/\*\*/g)?.length ?? 0), 0);
is('every name the report marks is closed again', marks(vm.report) % 2, 0);
is('and the whole dragon report too', marks(v.report) % 2, 0);
is('names are marked at all', marks(vm.report) > 0, true);

/* A hydra makes as many bites as it has heads, which is not a number. */
const unreadable = S.defaultStatBlock();
unreadable.entries.action = [
  { id: 'm', name: 'Multiattack', text: 'The hydra makes as many Bite attacks as it has heads.' },
  { id: 'b', name: 'Bite', text: 'Melee Attack Roll: +7. Hit: 10 (1d10 + 5) Piercing damage.' },
];
const vu = vibeCheck(unreadable, blank);
is('an unreadable multiattack is reported rather than guessed at',
  vu.report.skipped.some((x) => x.toLowerCase().includes('multiattack')), true);
is('and the one attack stands in for the round', vu.next.primary[0], 10);

console.log('\n--- vibe check: one action a turn ---');
/* A bandit has a scimitar and a crossbow and uses one of them, so adding
   both would score it as though it did both at once. */
const chooser = S.defaultStatBlock();
chooser.entries.action = [
  { id: 's', name: 'Scimitar', text: 'Melee Attack Roll: +3. Hit: 4 (1d6 + 1) Slashing damage.' },
  { id: 'c', name: 'Light Crossbow', text: 'Ranged Attack Roll: +3. Hit: 5 (1d8 + 1) Piercing damage.' },
];
const vc = vibeCheck(chooser, blank);
is('the heavier of the two is the round', vc.next.primary[0], 5);
is('and it is one round, not three', vc.next.roundCount, 1);

console.log('\n--- vibe check: a recharge is not every round ---');
const breather = S.defaultStatBlock();
breather.entries.action = [
  { id: 'm', name: 'Multiattack', text: 'The drake makes two Rend attacks.' },
  { id: 'r', name: 'Rend', text: 'Melee Attack Roll: +7. Hit: 10 (2d6 + 3) Slashing damage.' },
  { id: 'f', name: 'Fire Breath (Recharge 5\u20136)', text: 'Dexterity Saving Throw: DC 14. Failure: 35 (10d6) Fire damage.' },
];
const vb = vibeCheck(breather, blank);
is('the breath takes the first round', vb.next.primary[0], 35);
is('and the routine takes the rest', vb.next.primary[1], 20);
is('over three rounds', vb.next.roundCount, 3);
is('which the report explains',
  vb.report.judged.some((x) => x.includes('round 1')), true);
is('and what the three rounds average to',
  vb.report.judged.some((x) => x.includes('Averaged across the three')), true);

const flyer = S.defaultStatBlock();
flyer.speeds = { walk: 0, burrow: 0, climb: 0, fly: 60, swim: 0, hover: false };
flyer.entries.action = [{ id: 'f', name: 'Talons', text: 'Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) slashing damage.' }];
is('flying without reach does not earn the bonus',
  'flyAndRanged' in vibeCheck(flyer, blank).next.traits, false);
is('and it says why',
  vibeCheck(flyer, blank).report.judged.some((x) => x.includes('has to land')), true);

flyer.entries.action.push({ id: 'b', name: 'Rock', text: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft. Hit: 5 (1d6 + 2) bludgeoning damage.' });
is('flying with a ranged attack does', vibeCheck(flyer, blank).next.traits['flyAndRanged'], true);

const quiet = S.defaultStatBlock();
quiet.abilities = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
quiet.proficiencyBonus = 4;
const vq = vibeCheck(quiet, blank);
is('a silent block falls back to Strength plus proficiency', vq.next.attackBonus, 7);
is('and to 8 + proficiency + the best mental score', vq.next.saveDC, 12);
is('and admits it found no damage',
  vq.report.skipped.some((x) => x.includes('No damage')), true);

console.log('\n--- drawing the block ---');

/* Ten pixels a character, so what wraps where is arithmetic rather than a
   question about which font the machine running the tests happens to have. */
const ruler: Measure = (text) => text.length * 10;
const body: FontSpec = { size: 16, weight: 400 };
const label: FontSpec = { size: 16, weight: 700 };

const oneLine = wrapSpans([{ text: 'a b c', font: body }], 200, ruler);
is('what fits stays on one line', oneLine.length, 1);

const broken = wrapSpans([{ text: 'aaa bbb ccc ddd', font: body }], 80, ruler);
is('and what does not is broken up', broken.length, 2);
is('the break eats the space that caused it',
  broken.map((l) => l.map((s) => s.text).join('')).join('|'), 'aaa bbb|ccc ddd');

const mixed = wrapSpans([
  { text: 'Armor Class ', font: label, accent: true },
  { text: 'nineteen and a bit more words here', font: body },
], 300, ruler);
is('a line takes as much as it can hold', mixed.length, 2);
is('the label keeps its weight', mixed[0]![0]!.font.weight, 700);
is('and the value beside it keeps its own', mixed[0]!.at(-1)!.font.weight, 400);
is('what carried over keeps the font it arrived with',
  mixed[1]!.every((s) => s.font.weight === 400), true);
is('every line carries at least one span', mixed.every((l) => l.length > 0), true);

console.log('\n--- small capitals ---');
const caps = smallCapRuns('Adult Red Dragon', { size: 30, weight: 700, smallCaps: true });
is('capitals keep their size', caps[0]!.font.size, 30);
is('lower case is set smaller', caps[1]!.font.size < 30, true);
is('and in capitals', caps[1]!.text, caps[1]!.text.toUpperCase());
is('the words come back whole',
  caps.map((c) => c.text).join(''), 'ADULT RED DRAGON');
is('a plain font is left alone',
  smallCapRuns('Rend', body).map((c) => c.text).join(''), 'Rend');

console.log('\n--- one column and two ---');
const drawn = S.defaultStatBlock();
drawn.name = 'Test Drake';
drawn.entries.action = Array.from({ length: 12 }, (_, i) => ({
  id: `a${i}`,
  name: `Attack ${i}`,
  text: 'Melee Attack Roll: +7, reach 5 ft. Hit: 10 (2d6 + 3) Slashing damage and a good deal more text besides.',
}));
const dd = S.derive(drawn, CR1);

const single = layoutStatBlock(drawn, dd, { columns: 1 }, ruler);
is('one column holds everything', single.columns.length, 1);

const double = layoutStatBlock(drawn, dd, { columns: 2 }, ruler);
is('two columns are two columns', double.columns.length, 2);
is('and both of them are used', double.columns.every((c) => c.blocks.length > 0), true);
is('the name starts in the first', double.columns[0]!.blocks[0]!.placed.block.kind, 'spans');
is('no block is in two places at once',
  double.columns.flatMap((c) => c.blocks).length,
  single.columns[0]!.blocks.length);

const heights = double.columns.map((c) =>
  c.blocks.reduce((a, b) => a + b.placed.height, 0));
is('neither column runs away with it',
  Math.max(...heights) / (heights[0]! + heights[1]!) < 0.62, true);
is('two columns are wider than one', double.width > single.width, true);
is('and shorter', double.height < single.height, true);

/* The split may only fall at the actions or later. A printed block never
   starts its second column part way through the ability scores. */
const traitHeavy = S.defaultStatBlock();
traitHeavy.name = 'Trait Heavy';
traitHeavy.entries.trait = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i}`,
  name: `Trait ${i}`,
  text: 'A long enough sentence about what this does that it takes a line or two to say it properly.',
}));
traitHeavy.entries.action = [
  { id: 'a', name: 'Bite', text: 'Melee Attack Roll: +5. Hit: 7 (1d8 + 3) Piercing damage.' },
];
const th = S.derive(traitHeavy, CR1);

/** The words a block puts on its first line, for finding one by name. */
const opener = (b: { placed: { lines: { text: string }[][] } }): string =>
  (b.placed.lines[0] ?? []).map((x) => x.text).join('');

const flat = layoutStatBlock(traitHeavy, th, { columns: 1 }, ruler).columns[0]!.blocks;
const actionsAt = flat.findIndex((b) => opener(b) === 'Actions');
is('the fixture does have an Actions heading', actionsAt > 0, true);

const heavy = layoutStatBlock(traitHeavy, th, { columns: 2 }, ruler);
is('the first column holds everything up to the actions',
  heavy.columns[0]!.blocks.length >= actionsAt, true);
is('so the last trait is not in the second',
  heavy.columns[1]!.blocks.some((b) => opener(b).startsWith('Trait 9.')), false);
is('and the second column is used all the same',
  heavy.columns[1]!.blocks.length > 0, true);

/* Even when that leaves the columns lopsided, which it must be allowed to. */
const sides = heavy.columns.map((c) => c.blocks.reduce((a, b) => a + b.placed.height, 0));
is('lopsided is allowed, so long as the rule holds', sides[0]! > sides[1]!, true);

is('the file says which it is', imageFilename(drawn, 2), 'test-drake-2col.png');
is('and a nameless one still gets a name',
  imageFilename({ ...drawn, name: '' }, 1), 'monster-1col.png');

console.log('\n--- putting the 5etools markup back on ---');
/* The strongest check available: put it through the reader the catalogue was
   built with and see whether the same words come back. */
const trips = [
  'Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage.',
  'Ranged Attack Roll: +6, range 150/600 ft. Hit: 11 (2d8 + 2) Piercing damage.',
  'Melee or Ranged Attack Roll: +5, reach 5 ft. or range 120 ft. Hit: 7 (1d8 + 3) Bludgeoning damage.',
  'Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.',
  'Trigger: The bandit is hit by a melee attack roll. Response: The bandit adds 2 to its AC.',
  'Constitution Saving Throw: DC 16. First Failure: The target has the Restrained condition. Second Failure: The target has the Petrified condition.',
  'Failure or Success: The sword returns. Failure by 5 or More: The target has the Prone condition.',
  'Hit: 5 (1d6 + 2) Piercing damage. Hit or Miss: The javelin returns to its hand.',
];
for (const text of trips) {
  is(`it survives the trip: ${text.slice(0, 34)}\u2026`, detag(retag(text)), text);
}
is('an attack line really does get tagged',
  retag('Melee Attack Roll: +9, reach 5 ft.').startsWith('{@atkr m} {@hit 9}'), true);
is('and a damage expression too',
  retag('Hit: 13 (1d10 + 8) Slashing damage.').includes('{@damage 1d10 + 8}'), true);
is('plain prose is left alone',
  retag('The dragon makes three Rend attacks.'), 'The dragon makes three Rend attacks.');
is('a recharge comes off the name', retagName('Fire Breath (Recharge 5\u20136)'), 'Fire Breath {@recharge 5}');
is('and a plain recharge too', retagName('Cold Breath (Recharge 6)'), 'Cold Breath {@recharge}');
is('a name with no recharge is untouched', retagName('Greatsword'), 'Greatsword');

console.log('\n--- the 5etools file ---');
const brew = S.defaultStatBlock();
brew.name = 'Brew Beast';
brew.size = 'Huge';
brew.type = 'Dragon';
brew.alignment = 'Chaotic Evil';
brew.acValue = 18;
brew.acNote = 'Natural Armor';
brew.hpValue = 200;
brew.abilities = { str: 22, dex: 10, con: 20, int: 12, wis: 14, cha: 16 };
brew.saves = ['dex', 'con'];
brew.skills = { perception: 'expertise', stealth: 'proficient' };
brew.initiative = 'proficient';
brew.proficiencyBonus = 5;
brew.speeds = { walk: 40, burrow: 0, climb: 20, fly: 80, swim: 0, hover: true };
brew.resistances = ['Cold'];
brew.damageImmunities = ['Fire'];
brew.conditionImmunities = ['Frightened'];
brew.senses = { darkvision: 120, blindsight: 60, tremorsense: 0, truesight: 0, blindBeyond: true };
brew.languages = ['Common', 'Draconic'];
brew.telepathy = 120;
brew.entries.trait = [{ id: 't', name: 'Amphibious', text: 'It breathes air and water.' }];
brew.entries.action = [
  { id: 'a', name: 'Bite', text: 'Melee Attack Roll: +11, reach 10 ft. Hit: 17 (2d10 + 6) Piercing damage.' },
  { id: 'b', name: 'Leap', text: 'It jumps 30 feet.', kind: 'bonus' },
  { id: 'r', name: 'Parry', text: 'Trigger: It is hit. Response: It adds 3 to its AC.', kind: 'reaction' },
];
brew.entries.legendary = [{ id: 'l', name: 'Pounce', text: 'It makes one Bite attack.' }];
brew.entries.lair = [{ id: 'x', name: 'Grasping Roots', text: 'Roots erupt from the ground.' }];
brew.legendaryCount = 2;

const bd = S.derive(brew, CR10);
const file = toFiveTools(brew, bd, { cr: '13', now: 1700000000 });
const brewMeta = file['_meta'] as Record<string, unknown>;
const beast = toFiveToolsMonster(brew, bd, { cr: '13' });

is('the file declares a source', (brewMeta['sources'] as { json: string }[])[0]!.json, 'CRCalc');
is('and says which rules it is for', brewMeta['edition'], 'one');
is('and is stamped', brewMeta['dateAdded'], 1700000000);
is('the creature points at that source', beast['source'], 'CRCalc');
is('Huge is H', JSON.stringify(beast['size']), '["H"]');
is('the type is lower case', beast['type'], 'dragon');
is('Chaotic Evil is two letters', JSON.stringify(beast['alignment']), '["C","E"]');
is('an armour note becomes a source of AC',
  JSON.stringify(beast['ac']), '[{"ac":18,"from":["Natural Armor"]}]');
is('hit dice are written out', JSON.stringify(beast['hp']), '{"average":200,"formula":"17d12 + 85"}');
is('hovering is a flag on the speed', (beast['speed'] as Record<string, unknown>)['canHover'], true);
is('a speed of zero is left out', 'swim' in (beast['speed'] as object), false);
is('saves carry their totals', JSON.stringify(beast['save']), '{"dex":"+5","con":"+10"}');
is('and expertise survives as the bigger number',
  (beast['skill'] as Record<string, string>)['perception'], '+12');
is('a two-word skill keeps its space',
  'sleight of hand' in (beast['skill'] as object) === false, true);
is('initiative keeps its tier',
  JSON.stringify(beast['initiative']), '{"proficiency":1}');
is('blindsight says how blind', (beast['senses'] as string[])[0],
  'Blindsight 60 ft. (blind beyond this radius)');
is('telepathy hangs off the last language',
  (beast['languages'] as string[]).at(-1), 'Draconic; telepathy 120 ft.');
is('damage words are lower case', JSON.stringify(beast['immune']), '["fire"]');
is('so are conditions', JSON.stringify(beast['conditionImmune']), '["frightened"]');
is('bonus actions get their own list', (beast['bonus'] as unknown[]).length, 1);
is('and so do reactions', (beast['reaction'] as unknown[]).length, 1);
is('legendary actions say how many when it is not three', beast['legendaryActions'], 2);
/* 2024 blocks have no lair action list, so they ride along as actions. */
is('a lair action is not dropped', (beast['action'] as { name: string }[]).length, 2);
is('it is marked as one',
  (beast['action'] as { name: string }[])[1]!.name, 'Grasping Roots (Lair Action)');
is('the attack came through tagged',
  (beast['action'] as { entries: string[] }[])[0]!.entries[0]!.startsWith('{@atkr m} {@hit 11}'), true);

const plain = S.defaultStatBlock();
plain.showHitDice = false;
plain.legendaryCount = 3;
const plainD = S.derive(plain, CR1);
const bare = toFiveToolsMonster(plain, plainD, { cr: '1' });
is('hit points with no dice are written as they are',
  JSON.stringify(bare['hp']), '{"special":"75"}');
is('three legendary actions is the default and goes unsaid',
  'legendaryActions' in bare, false);
is('an empty list is left out entirely', 'trait' in bare, false);
is('True Neutral is one letter', JSON.stringify(bare['alignment']), '["N"]');
is('Unaligned is U',
  JSON.stringify(toFiveToolsMonster({ ...plain, alignment: 'Unaligned' }, plainD, { cr: '1' })['alignment']),
  '["U"]');

is('the file is named after the monster', fiveToolsFilename(brew), 'brew-beast-5etools.json');

console.log('\n--- renaming a monster and its prose ---');
const wolf = S.defaultStatBlock();
wolf.name = 'Winter Wolf';
wolf.entries.trait = [{
  id: 't', name: 'Pack Tactics',
  text: "The wolf has Advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition.",
}];
wolf.entries.action = [
  { id: 'a', name: 'Bite', text: 'Melee Attack Roll: +6, reach 5 ft. Hit: 11 (2d6 + 4) Piercing damage. If the target is Large or smaller, it has the Prone condition.' },
];

is('it works out what the prose calls it', findSelfName(wolf)?.noun, 'wolf');
is('and how often it says so', findSelfName(wolf)?.count, 2);
/* Without the blocklist the commonest phrase in most blocks is "the target",
   and every monster would think that was its name. */
is('a target is not a creature\u2019s name',
  findSelfName(wolf)?.noun === 'target', false);
is('nor is a condition',
  findSelfName(wolf)?.noun === 'incapacitated', false);

const generic = S.defaultStatBlock();
generic.entries.action = [{ id: 'a', name: 'Teleport', text: 'The creature teleports up to 60 feet.' }];
is('a block written generically has nothing to find', findSelfName(generic), null);

is('a name gives up its noun', selfNameFor('Inferno Drake'), 'drake');
is('a one-word name is its own noun', selfNameFor('Balrog'), 'balrog');
/* A swarm calls itself the swarm, not the bats. */
is('a name built round "of" keeps the first word', selfNameFor('Swarm of Bats'), 'swarm');
is('an empty name gives nothing', selfNameFor('   '), '');

const drake = renameThroughout(wolf, 'wolf', 'drake');
is('every mention is swapped', drake.changed, 2);
is('a capital at the start of a sentence stays capital',
  drake.next.entries.trait[0]!.text.startsWith('The drake has'), true);
is('and a possessive keeps its apostrophe',
  drake.next.entries.trait[0]!.text.includes("the drake's allies"), true);
is('what was never the creature is untouched',
  drake.next.entries.action[0]!.text.includes('the target is Large'), true);
is('the original is left alone', wolf.entries.trait[0]!.text.includes('The wolf has'), true);

/* Renaming Winter Wolf to Fire Wolf changes nothing, because both are wolves. */
is('a rename to the same noun is no work at all',
  renameThroughout(wolf, 'wolf', 'wolf').changed, 0);
is('and hands back the very same block',
  renameThroughout(wolf, 'wolf', 'wolf').next === wolf, true);

const named = S.defaultStatBlock();
named.entries.action = [{ id: 'a', name: 'Wolf Bite', text: 'The wolf bites. A dire wolfhound is unaffected.' }];
is('an entry name is renamed too',
  renameThroughout(named, 'wolf', 'drake').next.entries.action[0]!.name, 'Drake Bite');
is('but a longer word that merely contains it is not',
  renameThroughout(named, 'wolf', 'drake').next.entries.action[0]!.text.includes('wolfhound'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
